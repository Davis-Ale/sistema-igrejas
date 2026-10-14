import { z } from "zod";
import { createPublicRegistrationSchema } from "./event.schema.js";

// Structural contract only. No current route consumes these schemas yet.
export const CHECKOUT_ACCESS_HEADER = "x-event-checkout-key";
export const CHECKOUT_ACCESS_TTL_MS = 24 * 60 * 60 * 1000;
export const CHECKOUT_RECOVERY_ROLES = ["SUPER_ADMIN"] as const;

// 32 random bytes, encoded as canonical, unpadded base64url. Generation belongs
// to the later client/service cut; syntax alone does not prove randomness.
export const checkoutCredentialSchema = z.string().regex(
  /^ec2_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/,
  "Credencial privada de checkout inválida."
);

export const checkoutScopeSchema = z.object({
  churchId: z.string().trim().min(1),
  eventId: z.string().trim().min(1),
  registrationId: z.string().trim().min(1)
}).strict();

export const createPublicRegistrationV2Schema = createPublicRegistrationSchema
  .extend({ email: z.string().trim().email().max(254) })
  .strict();

// Scope is resolved from the route and the persisted credential, never contacts.
// The credential travels in CHECKOUT_ACCESS_HEADER, not in either body.
export const publicCheckoutStatusV2Schema = z.object({}).strict();
export const publicCheckoutResumeV2Schema = createPublicRegistrationSchema
  .pick({ cpf: true })
  .strict();

export const checkoutPaymentMethodSchema = z.enum([
  "PIX", "CREDIT_CARD", "DEBIT_CARD"
]);
export const checkoutAccessSourceSchema = z.enum([
  "PUBLIC_ATTEMPT", "ADMIN_RECOVERY"
]);
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const checkoutAccessRecordSchema = checkoutScopeSchema.extend({
  id: z.string().min(1),
  credentialHash: digestSchema,
  source: checkoutAccessSourceSchema,
  requestFingerprint: digestSchema.nullable(),
  requestedPaymentMethod: checkoutPaymentMethodSchema.nullable(),
  createdAt: z.date(),
  expiresAt: z.date(),
  revokedAt: z.date().nullable()
}).superRefine((access, context) => {
  if (access.expiresAt.getTime() - access.createdAt.getTime() !== CHECKOUT_ACCESS_TTL_MS) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "A validade absoluta deve ser de 24 horas." });
  }
  if (access.source === "PUBLIC_ATTEMPT" &&
      (!access.requestFingerprint || !access.requestedPaymentMethod)) {
    context.addIssue({ code: "custom", message: "Tentativa pública exige fingerprint e método inicial." });
  }
  if (access.source === "ADMIN_RECOVERY" &&
      (access.requestFingerprint !== null || access.requestedPaymentMethod !== null)) {
    context.addIssue({ code: "custom", message: "Recuperação não redefine dados ou método da compra." });
  }
  if (access.revokedAt && access.revokedAt < access.createdAt) {
    context.addIssue({ code: "custom", path: ["revokedAt"], message: "Revogação anterior à emissão." });
  }
});

// Internal validation contract: the later service must resolve these records,
// verify credentialHash, acquire the appropriate lock and then validate here.
export const checkoutAuthorizationContextSchema = z.object({
  scope: checkoutScopeSchema,
  access: checkoutAccessRecordSchema,
  now: z.date()
}).strict().superRefine(({ scope, access, now }, context) => {
  if (scope.churchId !== access.churchId || scope.eventId !== access.eventId ||
      scope.registrationId !== access.registrationId || access.revokedAt !== null ||
      now < access.createdAt || now >= access.expiresAt) {
    context.addIssue({ code: "custom", message: "Acesso ao checkout não autorizado." });
  }
});

// These attestations record human verification; they are not automated proof.
// Store only a minimal reference, never document copies, CPF or private tokens.
export const checkoutOwnershipVerificationSchema = z.object({
  ownershipVerified: z.literal(true),
  verificationMethod: z.string().trim().min(3).max(120),
  evidenceReference: z.string().trim().min(3).max(160),
  verifiedChannelReference: z.string().trim().min(3).max(160)
}).strict();

export const checkoutRecoveryParamsSchema = checkoutScopeSchema
  .pick({ eventId: true, registrationId: true });
const recoveryRequestShape = {
  operationId: z.string().uuid(),
  verification: checkoutOwnershipVerificationSchema
};
export const checkoutRecoveryRequestSchema = z.discriminatedUnion("action", [
  z.object({
    ...recoveryRequestShape,
    action: z.literal("RECOVER"),
    email: z.string().trim().email().max(254).optional()
  }).strict(),
  z.object({ ...recoveryRequestShape, action: z.literal("REISSUE") }).strict()
]);
export const checkoutRevocationRequestSchema = z.object({
  operationId: z.string().uuid(),
  reason: z.string().trim().min(3).max(160)
}).strict();

// Actor, tenant and time come only from authenticated/backend context.
export const checkoutRecoveryActorSchema = z.object({
  userId: z.string().trim().min(1),
  churchId: z.string().trim().min(1),
  role: z.literal("SUPER_ADMIN")
}).strict();
export const checkoutRecoverablePaymentStatusSchema = z.enum(["PENDING", "PAID"]);
export const checkoutChargeAttemptStateSchema = z.enum([
  "STARTED", "SUCCEEDED", "UNCERTAIN"
]);
// Internal transition contract, not permission to call a provider. STARTED must
// already be durable before the first call. UNCERTAIN requires reconciliation;
// neither state permits resetting or automatically issuing another charge.
export const checkoutChargeAttemptTransitionSchema = z.object({
  from: checkoutChargeAttemptStateSchema,
  to: checkoutChargeAttemptStateSchema,
  providerPaymentId: z.string().trim().min(1).nullable()
}).strict().superRefine(({ from, to, providerPaymentId }, context) => {
  const allowed = (from === "STARTED" && (to === "SUCCEEDED" || to === "UNCERTAIN")) ||
    (from === "UNCERTAIN" && to === "SUCCEEDED");
  if (!allowed || (to === "SUCCEEDED" && !providerPaymentId)) {
    context.addIssue({ code: "custom", message: "Tentativa de cobrança exige resultado conhecido ou reconciliação, sem reinício automático." });
  }
});

export type CheckoutCredential = z.infer<typeof checkoutCredentialSchema>;
export type CheckoutScope = z.infer<typeof checkoutScopeSchema>;
export type CheckoutAccessRecord = z.infer<typeof checkoutAccessRecordSchema>;
export type CreatePublicRegistrationV2Input = z.infer<typeof createPublicRegistrationV2Schema>;
export type CheckoutRecoveryRequest = z.infer<typeof checkoutRecoveryRequestSchema>;
export type CheckoutRecoveryActor = z.infer<typeof checkoutRecoveryActorSchema>;
