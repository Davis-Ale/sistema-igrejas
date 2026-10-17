import type { Prisma, PrismaClient } from "@prisma/client";
import {
  CHECKOUT_ACCESS_HEADER, checkoutCredentialSchema, checkoutPaymentMethodSchema,
  createPublicRegistrationV2Schema, publicCheckoutResumeV2Schema, publicCheckoutStatusV2Schema,
  type CheckoutScope
} from "./checkout-access.schema.js";
import { createCheckoutAttempt, withCheckoutAuthorization } from "./checkout-access.service.js";
import { createFirstCheckoutCharge, reconcileFirstCheckoutCharge, type CheckoutFirstChargeProvider } from "./checkout-charge.service.js";
import { createCheckoutRegistrationFactory } from "./event.service.js";
import { isParticipantAppEligible } from "./participant-app.service.js";

type EventScope = Pick<CheckoutScope, "churchId" | "eventId">;
export type CheckoutEventLocator = { eventId: string } | { churchSlug: string; eventSlug: string };
export type CheckoutPaymentProvider = {
  // Known-charge reads. First creation uses the separate durable guard below.
  read(id: string): Promise<{ id: string; method: "PIX" | "CARD"; amount: number;
    status: string; redirectUrl: string | null }>;
  pix(id: string): Promise<{ encodedImage: string; payload: string; expirationDate: string }>;
};

export function checkoutKeyFromHeaders(headers: Record<string, unknown>): string {
  const key = headers[CHECKOUT_ACCESS_HEADER];
  if (typeof key !== "string" || !checkoutCredentialSchema.safeParse(key).success) {
    throw new Error("CHECKOUT_ACCESS_DENIED");
  }
  return key;
}

export async function resolveCheckoutEvent(prisma: PrismaClient, locator: CheckoutEventLocator): Promise<EventScope> {
  const event = await prisma.event.findFirst({
    where: { isPublic: true, deletedAt: null,
      ...("eventId" in locator ? { id: locator.eventId } :
        { slug: locator.eventSlug, church: { slug: locator.churchSlug } }) },
    select: { id: true, churchId: true }
  });
  if (!event) throw new Error("PUBLIC_EVENT_NOT_FOUND");
  return { churchId: event.churchId, eventId: event.id };
}

async function snapshot(tx: Prisma.TransactionClient, scope: CheckoutScope) {
  const registration = await tx.registration.findFirst({
    where: { id: scope.registrationId, churchId: scope.churchId, eventId: scope.eventId, registrationSource: "PUBLIC" },
    select: { id: true, status: true, paymentStatus: true, waitlistedAt: true, confirmedAt: true, checkInToken: true,
      event: { select: { id: true, title: true, date: true, slug: true, publicSlug: true, isPaid: true,
        church: { select: { name: true, slug: true } } } } }
  });
  if (!registration) throw new Error("CHECKOUT_ACCESS_DENIED");
  // Explicit allowlist: no legacy token, contacts, answers, IDs of financial rows,
  // credential hashes or audit references escape through either public route.
  return { id: registration.id, status: registration.status, paymentStatus: registration.paymentStatus,
    waitlistedAt: registration.waitlistedAt, confirmedAt: registration.confirmedAt,
    checkInToken: isParticipantAppEligible(registration) ? registration.checkInToken : null, event: registration.event };
}

type PaymentBinding = {
  paymentId: string; transactionId: string; orderId: string; provider: string;
  providerPaymentId: string | null; asaasId: string | null; amount: string;
  method: string; requestedMethod: string | null; attemptState: string | null;
  attemptReference: string | null; initialMethod: string | null;
};

async function existingPaymentBinding(tx: Prisma.TransactionClient, scope: CheckoutScope): Promise<PaymentBinding | null> {
  const registration = await tx.registration.findFirst({
    where: { id: scope.registrationId, churchId: scope.churchId, eventId: scope.eventId, registrationSource: "PUBLIC" },
    select: { status: true, paymentStatus: true, waitlistedAt: true, paymentId: true }
  });
  if (!registration) throw new Error("CHECKOUT_ACCESS_DENIED");
  if (registration.status === "CANCELLED" || registration.waitlistedAt || registration.paymentStatus !== "PENDING") return null;
  if (!registration.paymentId) throw new Error("CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED");
  // Read the official graph under the authorization/registration lock. Amount and
  // references are resolved exclusively from the backend, never a public body.
  const rows = await tx.$queryRaw<PaymentBinding[]>`
    SELECT p."id" AS "paymentId", p."transactionId", p."orderId", p."provider", p."providerPaymentId",
      t."asaasId", p."amount"::text AS "amount", t."method",
      coalesce(a."requestedMethod"::text, initial."requestedPaymentMethod"::text) AS "requestedMethod", a."state"::text AS "attemptState",
      a."providerPaymentId" AS "attemptReference", initial."requestedPaymentMethod"::text AS "initialMethod"
    FROM "Registration" r
    JOIN "EventPayment" p ON p."id" = r."paymentId" AND p."orderId" = r."orderId"
      AND p."churchId" = r."churchId" AND p."eventId" = r."eventId"
    JOIN "Transaction" t ON t."id" = p."transactionId" AND t."churchId" = p."churchId" AND t."eventId" = p."eventId"
    JOIN "EventOrder" o ON o."id" = p."orderId" AND o."churchId" = p."churchId" AND o."eventId" = p."eventId"
    LEFT JOIN "EventCheckoutChargeAttempt" a ON a."eventPaymentId" = p."id" AND a."transactionId" = t."id"
      AND a."churchId" = p."churchId" AND a."eventId" = p."eventId"
    LEFT JOIN "EventCheckoutAccess" initial ON initial."registrationId" = r."id" AND initial."churchId" = r."churchId"
      AND initial."eventId" = r."eventId" AND initial."source" = 'PUBLIC_ATTEMPT'
    WHERE r."churchId" = ${scope.churchId} AND r."eventId" = ${scope.eventId} AND r."id" = ${scope.registrationId}
      AND r."status" <> 'CANCELLED' AND r."waitlistedAt" IS NULL AND r."paymentStatus" = 'PENDING'
      AND p."status" = 'PENDING' AND t."status" = 'ACTIVE' AND t."type" = 'EVENT'
      AND t."direction" = 'IN' AND p."amount" = t."amount" AND p."amount" = o."totalAmount"`;
  if (rows.length !== 1) throw new Error("CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED");
  return rows[0]!;
}

export function createCheckoutV2Integration(prisma: PrismaClient, provider: CheckoutPaymentProvider,
  firstChargeProvider?: CheckoutFirstChargeProvider) {
  const factory = createCheckoutRegistrationFactory(prisma);
  async function status(scope: EventScope, key: string, value: unknown) {
    publicCheckoutStatusV2Schema.parse(value);
    return withCheckoutAuthorization(prisma, scope, key, snapshot);
  }
  async function resume(scope: EventScope, key: string, value: unknown) {
    publicCheckoutResumeV2Schema.parse(value); // CPF remains ephemeral; no contact/method/ID override.
    let binding = await withCheckoutAuthorization(prisma, scope, key, existingPaymentBinding);
    if (binding?.provider === "ASAAS" && !binding.providerPaymentId && !binding.asaasId &&
        binding.attemptState === null) {
      if (!firstChargeProvider) throw new Error("CHECKOUT_CHARGE_CREATION_NOT_PREPARED");
      // The guard reauthorizes/locks/re-reads and commits STARTED before its only
      // POST. Never call the legacy callback or wrap this in a transaction/retry.
      await createFirstCheckoutCharge(prisma, scope, key, value, firstChargeProvider);
      // References can be persisted even if access expires/revokes during the
      // POST. A new authorization is required before any checkout is disclosed.
      binding = await withCheckoutAuthorization(prisma, scope, key, existingPaymentBinding);
    }
    let paymentCheckout = null;
    if (binding && binding.provider !== "TEST") {
      if (binding.provider !== "ASAAS") throw new Error("EVENT_PAYMENT_PROVIDER_UNSUPPORTED");
      if (binding.attemptState === "STARTED" || binding.attemptState === "UNCERTAIN") {
        throw new Error("CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED");
      }
      if (!binding.providerPaymentId && !binding.asaasId) {
        throw new Error("CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED");
      }
      if (!binding.providerPaymentId || binding.providerPaymentId !== binding.asaasId) {
        throw new Error("CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED");
      }
      if ((binding.attemptState === "SUCCEEDED" && binding.attemptReference !== binding.providerPaymentId) ||
          (binding.initialMethod && binding.requestedMethod !== binding.initialMethod)) {
        throw new Error("CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED");
      }
      const method = checkoutPaymentMethodSchema.safeParse(binding.requestedMethod ?? (binding.method === "PIX" ? "PIX" : null));
      // Legacy CARD cannot tell credit from debit. Never invent a semantic method.
      if (!method.success || (binding.method === "PIX" ? method.data !== "PIX" :
          binding.method !== "CARD" || method.data === "PIX")) throw new Error("CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED");
      const payment = await provider.read(binding.providerPaymentId).catch(() => {
        throw new Error("PAYMENT_CHECKOUT_FAILED");
      });
      if (payment.id !== binding.providerPaymentId || !Number.isFinite(Number(binding.amount)) ||
          Number(binding.amount) <= 0 || payment.amount !== Number(binding.amount) ||
          payment.method !== (method.data === "PIX" ? "PIX" : "CARD")) {
        throw new Error("CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED");
      }
      if (payment.status === "PENDING" || payment.status === "OVERDUE") {
        if (method.data === "PIX") {
          const pix = await provider.pix(payment.id).catch(() => {
            throw new Error("PAYMENT_CHECKOUT_FAILED");
          });
          if (![pix.encodedImage, pix.payload, pix.expirationDate].every(value => typeof value === "string" && value.length > 0)) {
            throw new Error("PAYMENT_CHECKOUT_FAILED");
          }
          paymentCheckout = { method: "PIX", pix: {
            encodedImage: pix.encodedImage, payload: pix.payload, expirationDate: pix.expirationDate
          } };
        }
        else {
          let secureUrl = false;
          try { secureUrl = !!payment.redirectUrl && new URL(payment.redirectUrl).protocol === "https:"; } catch { /* Invalid provider URL. */ }
          if (!payment.redirectUrl || !secureUrl) throw new Error("PAYMENT_CHECKOUT_FAILED");
          paymentCheckout = { method: method.data, redirectUrl: payment.redirectUrl };
        }
      }
      // Provider status alone never grants eligibility. Existing authenticated
      // webhook remains the financial synchronizer; no email/status write here.
    }
    // Reauthorize/re-read AFTER external GET/QR, so revocation/expiry or a financial
    // change during those requests cannot disclose a stale credential/checkout.
    return withCheckoutAuthorization(prisma, scope, key, async (tx, authorized) => {
      const current = await snapshot(tx, authorized);
      if (binding && paymentCheckout && current.paymentStatus === "PENDING" && current.status !== "CANCELLED" && current.waitlistedAt === null) {
        const fresh = await existingPaymentBinding(tx, authorized);
        if (!fresh || fresh.paymentId !== binding.paymentId || fresh.transactionId !== binding.transactionId ||
            fresh.providerPaymentId !== binding.providerPaymentId || fresh.asaasId !== binding.asaasId ||
            fresh.amount !== binding.amount || fresh.requestedMethod !== binding.requestedMethod ||
            fresh.attemptState !== binding.attemptState) throw new Error("CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED");
      }
      return { ...current, ...(current.status !== "CANCELLED" && current.waitlistedAt === null &&
        current.paymentStatus === "PENDING" && paymentCheckout ? { paymentCheckout } : {}) };
    });
  }
  return {
    status, resume,
    // Internal explicit operation only: knownProviderId must come from trusted
    // backend evidence, never status/resume bodies or a public reconciliation route.
    async reconcile(scope: EventScope, key: string, knownProviderId: string) {
      if (!firstChargeProvider) throw new Error("CHECKOUT_CHARGE_CREATION_NOT_PREPARED");
      await reconcileFirstCheckoutCharge(prisma, scope, key, knownProviderId, firstChargeProvider);
      return status(scope, key, {});
    },
    async register(scope: EventScope, key: string, value: unknown) {
      const input = createPublicRegistrationV2Schema.parse(value);
      const attempt = await createCheckoutAttempt(prisma, scope, key, input, factory);
      // Registration persists independently of external creation. The dedicated
      // resume path is the only payment entry; retries keep the original payload.
      return { ...await status(scope, key, {}), expiresAt: attempt.expiresAt, wasExisting: attempt.wasExisting };
    }
  };
}
