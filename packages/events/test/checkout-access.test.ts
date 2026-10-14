import assert from "node:assert/strict";
import test from "node:test";
import {
  CHECKOUT_ACCESS_TTL_MS,
  checkoutAccessRecordSchema,
  checkoutAuthorizationContextSchema,
  checkoutChargeAttemptTransitionSchema,
  checkoutCredentialSchema,
  checkoutRecoverablePaymentStatusSchema,
  checkoutRecoveryActorSchema,
  checkoutRecoveryRequestSchema,
  checkoutRevocationRequestSchema,
  createPublicRegistrationV2Schema,
  publicCheckoutResumeV2Schema,
  publicCheckoutStatusV2Schema
} from "../src/checkout-access.schema.ts";

const scope = { churchId: "church-a", eventId: "event-a", registrationId: "registration-a" };
const createdAt = new Date("2026-10-13T12:00:00.000Z");
const expiresAt = new Date(createdAt.getTime() + CHECKOUT_ACCESS_TTL_MS);
const access = {
  ...scope, id: "access-a", credentialHash: "a".repeat(64),
  source: "PUBLIC_ATTEMPT" as const, requestFingerprint: "b".repeat(64),
  requestedPaymentMethod: "PIX" as const, createdAt, expiresAt, revokedAt: null
};
const verification = {
  ownershipVerified: true,
  verificationMethod: "Verificação humana registrada",
  evidenceReference: "atendimento-123",
  verifiedChannelReference: "canal-verificado-123"
};
const operationId = "21a134b8-17f5-45f2-a058-9f05b2ff0d7f";

test("private credential rejects old HMAC tokens, contact values and noncanonical secrets", () => {
  assert.equal(checkoutCredentialSchema.safeParse(`ec2_${"A".repeat(43)}`).success, true);
  for (const token of [
    `registration-a.${"a".repeat(64)}`, "41999990001", "person@example.invalid",
    "Nome Participante", `ec2_${"A".repeat(42)}B`, `ec2_${"A".repeat(43)}=`,
    ` ec2_${"A".repeat(43)}`, `ec2_${"A".repeat(42)}`
  ]) assert.equal(checkoutCredentialSchema.safeParse(token).success, false);
});

test("authorization binds church, event and registration independently", () => {
  const now = new Date(createdAt.getTime() + 1);
  assert.equal(checkoutAuthorizationContextSchema.safeParse({ scope, access, now }).success, true);
  for (const key of ["churchId", "eventId", "registrationId"] as const) {
    assert.equal(checkoutAuthorizationContextSchema.safeParse({
      scope: { ...scope, [key]: "other" }, access, now
    }).success, false);
  }
});

test("validity is absolute: exact expiry, future issuance and revocation deny access", () => {
  for (const now of [expiresAt, new Date(expiresAt.getTime() + 1), new Date(createdAt.getTime() - 1)]) {
    assert.equal(checkoutAuthorizationContextSchema.safeParse({ scope, access, now }).success, false);
  }
  assert.equal(checkoutAuthorizationContextSchema.safeParse({
    scope, access, now: new Date(expiresAt.getTime() - 1)
  }).success, true);
  assert.equal(checkoutAuthorizationContextSchema.safeParse({
    scope, access: { ...access, revokedAt: createdAt }, now: createdAt
  }).success, false);
  for (const delta of [-1, 1, CHECKOUT_ACCESS_TTL_MS]) {
    assert.equal(checkoutAccessRecordSchema.safeParse({
      ...access, expiresAt: new Date(expiresAt.getTime() + delta)
    }).success, false);
  }
});

test("public attempt requires retry fingerprint and original payment method", () => {
  for (const patch of [{ requestFingerprint: null }, { requestedPaymentMethod: null }]) {
    assert.equal(checkoutAccessRecordSchema.safeParse({ ...access, ...patch }).success, false);
  }
  assert.equal(checkoutAccessRecordSchema.safeParse({
    ...access, source: "ADMIN_RECOVERY", requestFingerprint: null, requestedPaymentMethod: null
  }).success, true);
  assert.equal(checkoutAccessRecordSchema.safeParse({ ...access, source: "ADMIN_RECOVERY" }).success, false);
});

test("new public body requires email and cannot smuggle identity or old access fields", () => {
  const body = { name: "Participante", phone: "41999990001", email: "person@example.invalid",
    ticketId: "ticket", ticketBatchId: "batch", answers: [] };
  assert.equal(createPublicRegistrationV2Schema.safeParse(body).success, true);
  const { email: _email, ...withoutEmail } = body;
  assert.equal(createPublicRegistrationV2Schema.safeParse(withoutEmail).success, false);
  for (const patch of [{ registrationId: "other" }, { churchId: "other" },
    { personId: "other" }, { visitorId: "other" }, { checkoutToken: "old" }]) {
    assert.equal(createPublicRegistrationV2Schema.safeParse({ ...body, ...patch }).success, false);
  }
});

test("status and resume cannot authorize by contacts or change the payment method", () => {
  assert.equal(publicCheckoutStatusV2Schema.safeParse({}).success, true);
  assert.equal(publicCheckoutResumeV2Schema.safeParse({ cpf: "52998224725" }).success, true);
  assert.equal(publicCheckoutResumeV2Schema.safeParse({ cpf: "11111111111" }).success, false);
  for (const body of [{ name: "Participante" }, { phone: "41999990001" },
    { email: "person@example.invalid" }, { checkoutToken: "old" }, { registrationId: "other" },
    { paymentMethod: "CREDIT_CARD" }, { paymentId: "other" }]) {
    assert.equal(publicCheckoutStatusV2Schema.safeParse(body).success, false);
    assert.equal(publicCheckoutResumeV2Schema.safeParse(body).success, false);
  }
});

test("recovery requires human attestation and refuses actor, tenant or financial overrides", () => {
  const body = { operationId, action: "RECOVER", verification, email: "person@example.invalid" };
  assert.equal(checkoutRecoveryRequestSchema.safeParse(body).success, true);
  for (const patch of [{ verification: undefined }, { verification: { ...verification, ownershipVerified: false } },
    { verification: { ...verification, evidenceReference: "" } }, { actorUserId: "other" },
    { churchId: "other" }, { status: "CONFIRMED" }, { paymentStatus: "PAID" },
    { paymentId: "other" }, { paymentMethod: "PIX" }, { expiresAt }]) {
    assert.equal(checkoutRecoveryRequestSchema.safeParse({ ...body, ...patch }).success, false);
  }
  assert.equal(checkoutRecoveryRequestSchema.safeParse({ operationId, action: "REISSUE", verification }).success, true);
  assert.equal(checkoutRecoveryRequestSchema.safeParse({ ...body, action: "REISSUE" }).success, false);
  assert.equal(checkoutRevocationRequestSchema.safeParse({ operationId, reason: "Revogar acesso" }).success, true);
});

test("trusted recovery context accepts only SUPER_ADMIN and PENDING or PAID", () => {
  assert.equal(checkoutRecoveryActorSchema.safeParse({ userId: "account", churchId: "church-a", role: "SUPER_ADMIN" }).success, true);
  for (const role of ["PASTOR", "LEADER", "VOLUNTEER", "MEMBER", "VISITOR"]) {
    assert.equal(checkoutRecoveryActorSchema.safeParse({ userId: "account", churchId: "church-a", role }).success, false);
  }
  for (const status of ["PENDING", "PAID"]) assert.equal(checkoutRecoverablePaymentStatusSchema.safeParse(status).success, true);
  for (const status of ["CANCELLED", "REFUNDED", "NOT_REQUIRED", "WAITING_PAYMENT", "OVERDUE"]) {
    assert.equal(checkoutRecoverablePaymentStatusSchema.safeParse(status).success, false);
  }
});

test("uncertain charge creation cannot reset or issue an automatic retry", () => {
  for (const transition of [
    { from: "STARTED", to: "STARTED", providerPaymentId: null },
    { from: "UNCERTAIN", to: "STARTED", providerPaymentId: null },
    { from: "SUCCEEDED", to: "STARTED", providerPaymentId: null },
    { from: "STARTED", to: "SUCCEEDED", providerPaymentId: null }
  ]) assert.equal(checkoutChargeAttemptTransitionSchema.safeParse(transition).success, false);
  for (const transition of [
    { from: "STARTED", to: "UNCERTAIN", providerPaymentId: null },
    { from: "STARTED", to: "SUCCEEDED", providerPaymentId: "provider-payment" },
    { from: "UNCERTAIN", to: "SUCCEEDED", providerPaymentId: "reconciled-payment" }
  ]) assert.equal(checkoutChargeAttemptTransitionSchema.safeParse(transition).success, true);
});
