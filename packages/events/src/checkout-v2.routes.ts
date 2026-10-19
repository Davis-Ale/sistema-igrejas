import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import { createAuthPreHandler } from "@sistema-igrejas/auth";
import { ZodError, z } from "zod";
import { checkoutRecoveryParamsSchema } from "./checkout-access.schema.js";
import { revokeCheckoutAccess } from "./checkout-access.service.js";
import type { AssistedCheckoutRecovery } from "./checkout-assisted-recovery.service.js";
import type { CheckoutFirstChargeProvider } from "./checkout-charge.service.js";
import { CHECKOUT_PUBLIC_BASES, CHECKOUT_SECURITY_ALLOWED_HEADERS, CHECKOUT_SECURITY_REDACTIONS } from "./checkout-security.prepared.js";
import {
  checkoutKeyFromHeaders, createCheckoutV2Integration, resolveCheckoutEvent,
  type CheckoutPaymentProvider, type CheckoutEventLocator
} from "./checkout-v2.integration.js";

const byId = z.object({ eventId: z.string().trim().min(1) }).strict();
const bySlugs = z.object({ churchSlug: z.string().trim().min(1), eventSlug: z.string().trim().min(1) }).strict();
const publicBases = CHECKOUT_PUBLIC_BASES;
export const CHECKOUT_V2_LOG_REDACTIONS = CHECKOUT_SECURITY_REDACTIONS;
export const CHECKOUT_V2_ALLOWED_HEADERS = CHECKOUT_SECURITY_ALLOWED_HEADERS;

// Read-only gate for the future composition replacement. No switch, flag,
// registration or interception is installed into either running buildApp.
export function assertNoLegacyCheckoutRoutes(app: Pick<FastifyInstance, "hasRoute">) {
  for (const base of publicBases) for (const suffix of ["/register", "/checkout/status", "/checkout/resume"]) {
    if (app.hasRoute({ method: "POST", url: `${base}${suffix}` })) throw new Error("CHECKOUT_V2_REQUIRES_EXCLUSIVE_REPLACEMENT");
  }
}

async function routeError(error: unknown, reply: FastifyReply) {
  const known: Record<string, number> = {
    CHECKOUT_ACCESS_DENIED: 403, CHECKOUT_RECOVERY_FORBIDDEN: 403,
    CHECKOUT_RECOVERY_NOT_FOUND: 404, PUBLIC_EVENT_NOT_FOUND: 404,
    CHECKOUT_ATTEMPT_CONFLICT: 409, CHECKOUT_RECOVERY_CONFLICT: 409, CHECKOUT_ASSISTANCE_REQUIRED: 409,
    CHECKOUT_REISSUE_REQUIRED: 409, CHECKOUT_RECOVERY_INELIGIBLE: 409,
    CHECKOUT_RECOVERY_DELIVERY_NOT_CONFIGURED: 503, CHECKOUT_RECOVERY_INPUT_INVALID: 400,
    CHECKOUT_RECOVERY_KEY_UNAVAILABLE: 409, CHECKOUT_RECOVERY_DELIVERY_UNCERTAIN: 409,
    CHECKOUT_RECOVERY_RETRY_REQUIRED: 503, CHECKOUT_RECOVERY_CREDENTIAL_NOT_ACCEPTED: 400,
    CHECKOUT_DESTINATION_REQUIRED: 400, CHECKOUT_DESTINATION_INVALID: 400, CHECKOUT_DESTINATION_CONFLICT: 409,
    CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED: 409, CHECKOUT_CHARGE_CREATION_NOT_PREPARED: 503,
    EVENT_CAPACITY_REACHED: 409, TICKET_BATCH_SOLD_OUT: 409, TICKET_BATCH_NOT_AVAILABLE: 409,
    EVENT_TICKET_NOT_FOUND: 404, TICKET_BATCH_NOT_FOUND: 404,
    INVALID_FORM_ANSWER: 400, REQUIRED_FORM_ANSWER_MISSING: 400, DISCOUNT_NOT_APPLICABLE: 400,
    PAYMENT_CUSTOMER_CPF_REQUIRED: 400, EVENT_PAYMENT_PROVIDER_UNSUPPORTED: 502,
    PAYMENT_CHECKOUT_FAILED: 502
  };
  const code = error instanceof ZodError ? "VALIDATION_ERROR" :
    error instanceof Error && known[error.message] ? error.message : "INTERNAL_SERVER_ERROR";
  await reply.code(code === "VALIDATION_ERROR" ? 400 : known[code] ?? 500)
    .send({ error: code, message: "Não foi possível concluir esta operação de checkout." });
}

/** Dormant route descriptors, not a plugin/registrar. Both servers prepare the
 * SAME bundle; neither imports it in buildApp. Activation must replace the old
 * critical routes on BOTH servers after draining requests and applying the
 * authorized migration. Never register these beside the legacy route registrar.
 */
export function prepareCheckoutV2Routes(prisma: PrismaClient, provider: CheckoutPaymentProvider,
  firstChargeProvider?: CheckoutFirstChargeProvider, assistedRecovery?: AssistedCheckoutRecovery): RouteOptions[] {
  const integration = createCheckoutV2Integration(prisma, provider, firstChargeProvider);
  const protect = (handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      reply.header("Cache-Control", "no-store");
      try { return await handler(request, reply); } catch (error) { return routeError(error, reply); }
    };
  const routes: RouteOptions[] = [];
  for (const base of publicBases) {
    const locator = (request: FastifyRequest): CheckoutEventLocator =>
      base.includes(":churchSlug") ? bySlugs.parse(request.params) : byId.parse(request.params);
    for (const action of ["register", "status", "resume"] as const) {
      routes.push({ method: "POST", url: `${base}${action === "register" ? "/register" : `/checkout/${action}`}`,
        handler: protect(async (request, reply) => {
          // Invalid/missing key fails before route/DB resolution; there is no
          // fallback to name/phone/email/legacy checkInToken/checkoutToken.
          const key = checkoutKeyFromHeaders(request.headers);
          const scope = await resolveCheckoutEvent(prisma, locator(request));
          const result = await integration[action](scope, key, request.body);
          if (action === "register") reply.code("wasExisting" in result && result.wasExisting ? 200 : 201);
          return result;
        }) });
    }
  }
  const auth = createAuthPreHandler(prisma);
  for (const action of ["recovery", "revocation"] as const) {
    routes.push({ method: "POST", url: `/api/events/:eventId/registrations/:registrationId/checkout/${action}`,
      preHandler: auth, handler: protect(async request => {
        // Always use current authenticated middleware context; never request.body.
        if (!request.churchId || request.churchId !== request.user?.churchId || request.user.role !== "SUPER_ADMIN") {
          throw new Error("CHECKOUT_RECOVERY_FORBIDDEN");
        }
        const scope = { ...checkoutRecoveryParamsSchema.parse(request.params), churchId: request.churchId };
        const actor = { userId: request.user.userId, churchId: request.churchId, role: request.user.role };
        if (action === "revocation") return revokeCheckoutAccess(prisma, actor, scope, request.body);
        // A browser/operator never supplies or receives the new private key.
        // Without explicit verified-email delivery + durable audit, fail closed.
        if (request.headers["x-event-checkout-key"] !== undefined) throw new Error("CHECKOUT_RECOVERY_CREDENTIAL_NOT_ACCEPTED");
        if (!assistedRecovery) throw new Error("CHECKOUT_RECOVERY_DELIVERY_NOT_CONFIGURED");
        return assistedRecovery.execute(actor, scope, request.body);
      }) });
  }
  return routes;
}
