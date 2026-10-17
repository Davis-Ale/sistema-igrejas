import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  CHECKOUT_ACCESS_TTL_MS,
  checkoutAccessRecordSchema,
  checkoutAuthorizationContextSchema,
  checkoutCredentialSchema,
  checkoutRecoverablePaymentStatusSchema,
  checkoutRecoveryActorSchema,
  checkoutRecoveryRequestSchema,
  checkoutRevocationRequestSchema,
  checkoutScopeSchema,
  createPublicRegistrationV2Schema,
  type CheckoutAccessRecord,
  type CheckoutScope,
  type CheckoutRecoveryActor,
  type CheckoutRecoveryRequest,
  type CreatePublicRegistrationV2Input
} from "./checkout-access.schema.js";

// Deliberately absent from index.ts and all routes. No provider calls or
// financial updates belong to this transaction boundary.
type EventScope = Pick<CheckoutScope, "churchId" | "eventId">;
type Database = Pick<PrismaClient, "$transaction">;
type Clock = () => Date;
const eventScopeSchema = checkoutScopeSchema.pick({ churchId: true, eventId: true });

export function generateCheckoutCredential(): string {
  return `ec2_${randomBytes(32).toString("base64url")}`;
}

function credentialHash(credential: string): string {
  if (!checkoutCredentialSchema.safeParse(credential).success) {
    throw new Error("CHECKOUT_ACCESS_DENIED");
  }
  return createHash("sha256").update(credential).digest("hex");
}

function equalDigest(left: string, right: string): boolean {
  return /^[a-f0-9]{64}$/.test(left) && /^[a-f0-9]{64}$/.test(right) &&
    timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function normalizeInput(value: unknown): CreatePublicRegistrationV2Input {
  const input = createPublicRegistrationV2Schema.parse(value);
  if (new Set(input.answers.map(answer => answer.fieldId)).size !== input.answers.length) {
    throw new Error("INVALID_FORM_ANSWER");
  }
  return {
    ...input,
    phone: input.phone.replace(/\D/g, "") || input.phone.trim(),
    email: input.email.toLowerCase(),
    ...(input.cpf !== undefined ? { cpf: input.cpf.replace(/\D/g, "") } : {}),
    ...(input.discountCode !== undefined ? { discountCode: input.discountCode.trim().toUpperCase() } : {}),
    answers: [...input.answers].sort((a, b) => a.fieldId < b.fieldId ? -1 : a.fieldId > b.fieldId ? 1 : 0)
  };
}

function fingerprint(scope: EventScope, input: CreatePublicRegistrationV2Input, credential: string): string {
  // Explicit shape makes object property order irrelevant. The private key also
  // prevents an offline dictionary attack on low-entropy CPF/contact/answer data.
  return createHmac("sha256", Buffer.from(credential.slice(4), "base64url"))
    .update(JSON.stringify([
      "checkout-attempt-v2", scope.churchId, scope.eventId, input.name,
      input.phone, input.email, input.cpf ?? null, input.paymentMethod,
      input.ticketId, input.ticketBatchId, input.discountCode ?? null,
      input.answers.map(answer => [answer.fieldId, answer.value])
    ])).digest("hex");
}

async function transact<T>(database: Database, operation: (tx: Prisma.TransactionClient) => Promise<T>,
  additionalConflictConstraints: readonly string[] = []): Promise<T> {
  for (let retry = 0; ; retry++) {
    try {
      return await database.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      // A serializable snapshot acquired before an advisory-lock wait can see a
      // stale key lookup. PostgreSQL may then report the credential's unique
      // constraint rather than a serialization error. Recovery also whitelists
      // its operation UUID/single-unrevoked constraints to re-read the winner.
      const failure = error as { code?: string; meta?: { code?: string; message?: string;
        driverAdapterError?: { cause?: { originalCode?: string; originalMessage?: string } } } } | null;
      const cause = failure?.meta?.driverAdapterError?.cause;
      const code = failure?.meta?.code ?? cause?.originalCode;
      const message = failure?.meta?.message ?? cause?.originalMessage;
      const retryable = failure?.code === "P2034" || (failure?.code === "P2010" &&
        (["40001", "40P01"].includes(code ?? "") ||
         (code === "23505" &&
          ["EventCheckoutAccess_credentialHash_key", ...additionalConflictConstraints]
            .some(name => typeof message === "string" && (message === name || message.includes(`"${name}"`))))));
      if (retry >= 2 || !retryable) throw error;
    }
  }
}

async function lockAttempt(tx: Prisma.TransactionClient, scope: EventScope, hash: string): Promise<void> {
  // Global key lock first, then the existing public-registration event lock.
  // Same key across tenants/events cannot win two independent creation races.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`checkout-key:${hash}`}, 0))::text`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`public-registration:${scope.eventId}`}, 0))::text`;
}

async function findAccess(tx: Prisma.TransactionClient, hash: string): Promise<CheckoutAccessRecord | null> {
  // The one global lookup detects reuse in another scope; it never exposes that
  // scope to the caller. Every subsequent read/write is tenant/event scoped.
  const rows = await tx.$queryRaw<CheckoutAccessRecord[]>`
    SELECT "id", "churchId", "eventId", "registrationId", "credentialHash",
      "source", "requestFingerprint", "requestedPaymentMethod", "createdAt", "expiresAt", "revokedAt"
    FROM "EventCheckoutAccess" WHERE "credentialHash" = ${hash}`;
  return rows[0] ?? null;
}

async function authorize(
  tx: Prisma.TransactionClient, scope: EventScope, access: CheckoutAccessRecord | null,
  hash: string, clock: Clock, registrationId?: string
): Promise<CheckoutAccessRecord> {
  if (!access || !equalDigest(access.credentialHash, hash) ||
      access.churchId !== scope.churchId || access.eventId !== scope.eventId ||
      (registrationId !== undefined && access.registrationId !== registrationId)) {
    throw new Error("CHECKOUT_ACCESS_DENIED");
  }
  // Compatible with the row lock used by confirmation-email/payment workflows.
  const rows = await tx.$queryRaw<{ id: string; registrationSource: string }[]>`
    SELECT "id", "registrationSource" FROM "Registration"
    WHERE "churchId" = ${scope.churchId} AND "eventId" = ${scope.eventId}
      AND "id" = ${access.registrationId} FOR UPDATE`;
  // Re-read after locking: future revocation/recovery must use this same lock.
  const current = await findAccess(tx, hash);
  if (!rows[0] || rows[0].registrationSource !== "PUBLIC" || !current ||
      !equalDigest(current.credentialHash, hash) ||
      !checkoutAuthorizationContextSchema.safeParse({
        scope: { ...scope, registrationId: access.registrationId }, access: current, now: clock()
      }).success) throw new Error("CHECKOUT_ACCESS_DENIED");
  return current;
}

function receipt(access: CheckoutAccessRecord, wasExisting: boolean) {
  // Never expose hashes, raw keys, contacts, provider IDs or participant tokens.
  return { registrationId: access.registrationId, expiresAt: access.expiresAt, wasExisting };
}

export type CreateCheckoutRegistration = (
  tx: Prisma.TransactionClient,
  scope: EventScope,
  input: CreatePublicRegistrationV2Input
) => Promise<{ id: string }>;

/** Internal creation seam for the later activation cut. The factory must validate
 * NEW sales and create Registration/Order/Payment/Transaction using ONLY tx. It
 * must not deduplicate by contacts, open another transaction, send email or call
 * a provider: Serializable retries can execute it again after rollback.
 * The existing legacy createPublicRegistration is NOT a compatible factory.
 */
export async function createCheckoutAttempt(
  database: Database,
  resolvedScope: EventScope,
  credential: string,
  value: unknown,
  createRegistration: CreateCheckoutRegistration,
  clock: Clock = () => new Date()
) {
  const scope = eventScopeSchema.parse(resolvedScope);
  const hash = credentialHash(credential);
  const input = normalizeInput(value);
  const requestFingerprint = fingerprint(scope, input, credential);
  return transact(database, async tx => {
    await lockAttempt(tx, scope, hash);
    const existing = await findAccess(tx, hash);
    if (existing) {
      const access = await authorize(tx, scope, existing, hash, clock);
      if (access.source !== "PUBLIC_ATTEMPT" || !access.requestFingerprint ||
          !equalDigest(access.requestFingerprint, requestFingerprint) ||
          access.requestedPaymentMethod !== input.paymentMethod) {
        throw new Error("CHECKOUT_ATTEMPT_CONFLICT");
      }
      // Retry precedes NEW-sale availability/capacity checks. Expiry never renews.
      return receipt(access, true);
    }
    const event = await tx.event.findFirst({
      where: { id: scope.eventId, churchId: scope.churchId, isPublic: true,
        publicRegistrationEnabled: true, deletedAt: null }, select: { id: true }
    });
    if (!event) throw new Error("PUBLIC_EVENT_NOT_FOUND");
    const contacts = await tx.$queryRaw<{ id: string }[]>`
      SELECT r."id" FROM "Registration" r
      LEFT JOIN "Visitor" v ON v."id" = r."visitorId" AND v."churchId" = r."churchId"
      LEFT JOIN "Person" p ON p."id" = r."personId" AND p."churchId" = r."churchId"
      WHERE r."churchId" = ${scope.churchId} AND r."eventId" = ${scope.eventId}
        AND (regexp_replace(coalesce(v."phone", ''), '[^0-9]', '', 'g') = ${input.phone}
          OR regexp_replace(coalesce(p."phone", ''), '[^0-9]', '', 'g') = ${input.phone}
          OR lower(btrim(v."email")) = ${input.email} OR lower(btrim(p."email")) = ${input.email}
          OR lower(btrim(r."checkoutEmail")) = ${input.email})
      LIMIT 1`;
    if (contacts.length) throw new Error("CHECKOUT_ASSISTANCE_REQUIRED");
    const created = await createRegistration(tx, scope, input);
    const registration = await tx.registration.findFirst({
      where: { id: created.id, churchId: scope.churchId, eventId: scope.eventId,
        registrationSource: "PUBLIC" }, select: { id: true }
    });
    if (!registration) throw new Error("CHECKOUT_REGISTRATION_SCOPE_INVALID");
    // Destination belongs to this registration, never the shared contact.
    await tx.$executeRaw`UPDATE "Registration" SET "checkoutEmail" = ${input.email}
      WHERE "churchId" = ${scope.churchId} AND "eventId" = ${scope.eventId}
        AND "id" = ${registration.id} AND "checkoutEmail" IS NULL`;
    const createdAt = clock();
    const access = checkoutAccessRecordSchema.parse({
      ...scope, registrationId: registration.id, id: randomUUID(), credentialHash: hash,
      source: "PUBLIC_ATTEMPT", requestFingerprint, requestedPaymentMethod: input.paymentMethod,
      createdAt, expiresAt: new Date(createdAt.getTime() + CHECKOUT_ACCESS_TTL_MS), revokedAt: null
    });
    await tx.$executeRaw`INSERT INTO "EventCheckoutAccess"
      ("id", "churchId", "eventId", "registrationId", "credentialHash", "source",
       "requestFingerprint", "requestedPaymentMethod", "createdAt", "expiresAt", "revokedAt")
      VALUES (${access.id}, ${access.churchId}, ${access.eventId}, ${access.registrationId},
        ${hash}, 'PUBLIC_ATTEMPT', ${requestFingerprint},
        ${input.paymentMethod}::"EventCheckoutPaymentMethod", ${access.createdAt}, ${access.expiresAt}, NULL)`;
    return receipt(access, false);
  });
}

/** Trusted internal operation under the authorization/registration lock. This
 * grants checkout access only; payment/credential/app eligibility is separate.
 * Operation must be database-only and safe to retry after rollback.
 */
export async function withCheckoutAuthorization<T>(
  database: Database,
  resolvedScope: EventScope & { registrationId?: string },
  credential: string,
  operation: (tx: Prisma.TransactionClient, scope: CheckoutScope) => Promise<T>,
  clock: Clock = () => new Date()
): Promise<T> {
  const scope = eventScopeSchema.parse({ churchId: resolvedScope.churchId, eventId: resolvedScope.eventId });
  if (resolvedScope.registrationId !== undefined) checkoutScopeSchema.parse(resolvedScope);
  const hash = credentialHash(credential);
  return transact(database, async tx => {
    await lockAttempt(tx, scope, hash);
    const access = await authorize(tx, scope, await findAccess(tx, hash), hash, clock, resolvedScope.registrationId);
    return operation(tx, { ...scope, registrationId: access.registrationId });
  });
}

type RecoveryAudit = CheckoutScope & {
  id: string; accessId: string; operationId: string; requestFingerprint: string;
  action: "RECOVER" | "REISSUE" | "REVOKE"; actorUserId: string; actorRole: string;
};
type RecoveryRegistration = CheckoutScope & {
  registrationSource: string; paymentStatus: string; checkoutEmail: string | null;
  personEmail: string | null; visitorEmail: string | null;
};

async function lockRecovery(
  tx: Prisma.TransactionClient, actor: CheckoutRecoveryActor, scope: CheckoutScope,
  operationId: string, hash?: string
) {
  // Tenant-wide operation identity first. Then preserve key -> event -> row
  // ordering shared with public attempts/authorization. No contact lookup.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`checkout-recovery:${actor.churchId}:${operationId}`}, 0))::text`;
  if (hash) await lockAttempt(tx, scope, hash);
  else await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`public-registration:${scope.eventId}`}, 0))::text`;
  const accounts = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "UserAccount" WHERE "churchId" = ${actor.churchId}
      AND "id" = ${actor.userId} AND "role" = 'SUPER_ADMIN' AND "status" = 'ACTIVE' FOR SHARE`;
  if (!accounts.length) throw new Error("CHECKOUT_RECOVERY_FORBIDDEN");
  const event = await tx.event.findFirst({
    where: { id: scope.eventId, churchId: scope.churchId, deletedAt: null }, select: { id: true }
  });
  if (!event) throw new Error("CHECKOUT_RECOVERY_NOT_FOUND");
  const rows = await tx.$queryRaw<RecoveryRegistration[]>`
    SELECT "id" AS "registrationId", "churchId", "eventId", "registrationSource", "paymentStatus", "checkoutEmail"
    FROM "Registration" WHERE "churchId" = ${scope.churchId} AND "eventId" = ${scope.eventId}
      AND "id" = ${scope.registrationId} FOR UPDATE`;
  const registration = rows[0];
  if (!registration || registration.registrationSource !== "PUBLIC") throw new Error("CHECKOUT_RECOVERY_NOT_FOUND");
  // Related destinations are read in the serializable snapshot by persisted IDs
  // and tenant; they are never used to find/authorize a registration.
  const destinations = await tx.$queryRaw<{ personEmail: string | null; visitorEmail: string | null;
    linkedPersonId: string | null; linkedVisitorId: string | null;
    personId: string | null; visitorId: string | null }[]>`
    SELECT p."email" AS "personEmail", v."email" AS "visitorEmail",
      r."personId" AS "linkedPersonId", r."visitorId" AS "linkedVisitorId", p."id" AS "personId", v."id" AS "visitorId"
    FROM "Registration" r
    LEFT JOIN "Person" p ON p."id" = r."personId" AND p."churchId" = r."churchId"
    LEFT JOIN "Visitor" v ON v."id" = r."visitorId" AND v."churchId" = r."churchId"
    WHERE r."churchId" = ${scope.churchId} AND r."eventId" = ${scope.eventId} AND r."id" = ${scope.registrationId}`;
  const related = destinations[0];
  if (!related || (related.linkedPersonId && related.personId !== related.linkedPersonId) ||
      (related.linkedVisitorId && related.visitorId !== related.linkedVisitorId)) {
    throw new Error("CHECKOUT_RECOVERY_NOT_FOUND");
  }
  return { ...registration, personEmail: related.personEmail, visitorEmail: related.visitorEmail };
}

async function findRecoveryAudit(tx: Prisma.TransactionClient, churchId: string, operationId: string) {
  const rows = await tx.$queryRaw<RecoveryAudit[]>`
    SELECT "id", "churchId", "eventId", "registrationId", "accessId", "operationId",
      "requestFingerprint", "action", "actorUserId", "actorRole"
    FROM "EventCheckoutRecoveryAudit" WHERE "churchId" = ${churchId} AND "operationId" = ${operationId}::uuid`;
  return rows[0] ?? null;
}

async function registrationAccesses(tx: Prisma.TransactionClient, scope: CheckoutScope) {
  return tx.$queryRaw<CheckoutAccessRecord[]>`
    SELECT "id", "churchId", "eventId", "registrationId", "credentialHash", "source",
      "requestFingerprint", "requestedPaymentMethod", "createdAt", "expiresAt", "revokedAt"
    FROM "EventCheckoutAccess" WHERE "churchId" = ${scope.churchId} AND "eventId" = ${scope.eventId}
      AND "registrationId" = ${scope.registrationId} ORDER BY "createdAt", "id" FOR UPDATE`;
}

function recoveryFingerprint(
  actor: CheckoutRecoveryActor, scope: CheckoutScope, request: CheckoutRecoveryRequest | { operationId: string; reason: string },
  key: Buffer
) {
  const content = "action" in request ? [request.action,
    request.verification.ownershipVerified, request.verification.verificationMethod,
    request.verification.evidenceReference, request.verification.verifiedChannelReference,
    request.action === "RECOVER" ? request.email?.toLowerCase() ?? null : null] : ["REVOKE", request.reason];
  return createHmac("sha256", key).update(JSON.stringify([
    "checkout-recovery-v2", scope.churchId, scope.eventId, scope.registrationId,
    actor.userId, actor.role, request.operationId, ...content
  ])).digest("hex");
}

function recoveryContext(actorValue: unknown, scopeValue: CheckoutScope) {
  const parsed = checkoutRecoveryActorSchema.safeParse(actorValue);
  if (!parsed.success) throw new Error("CHECKOUT_RECOVERY_FORBIDDEN");
  const actor = parsed.data, scope = checkoutScopeSchema.parse(scopeValue);
  if (actor.churchId !== scope.churchId) throw new Error("CHECKOUT_RECOVERY_FORBIDDEN");
  return { actor, scope };
}

function checkRecoveryReplay(audit: RecoveryAudit, actor: CheckoutRecoveryActor, scope: CheckoutScope,
  action: RecoveryAudit["action"], digest: string) {
  if (audit.churchId !== scope.churchId || audit.eventId !== scope.eventId ||
      audit.registrationId !== scope.registrationId || audit.actorUserId !== actor.userId ||
      audit.actorRole !== actor.role || audit.action !== action || !equalDigest(audit.requestFingerprint, digest)) {
    throw new Error("CHECKOUT_RECOVERY_CONFLICT");
  }
}

function recoveryReceipt(access: CheckoutAccessRecord, operationId: string, wasExisting: boolean) {
  return { registrationId: access.registrationId, accessId: access.id, operationId,
    expiresAt: access.expiresAt, revokedAt: access.revokedAt, wasExisting };
}

async function appendRecoveryAudit(
  tx: Prisma.TransactionClient, actor: CheckoutRecoveryActor, scope: CheckoutScope, accessId: string,
  request: CheckoutRecoveryRequest | { operationId: string; reason: string }, digest: string, createdAt: Date
) {
  const verification = "action" in request ? request.verification : null;
  const action = "action" in request ? request.action : "REVOKE";
  await tx.$executeRaw`INSERT INTO "EventCheckoutRecoveryAudit"
    ("id", "churchId", "eventId", "registrationId", "accessId", "operationId", "requestFingerprint",
     "action", "actorUserId", "actorRole", "ownershipVerified", "verificationMethod", "evidenceReference",
     "verifiedChannelReference", "reason", "createdAt")
    VALUES (${randomUUID()}, ${scope.churchId}, ${scope.eventId}, ${scope.registrationId}, ${accessId},
      ${request.operationId}::uuid, ${digest}, ${action}::"EventCheckoutRecoveryAction", ${actor.userId},
      'SUPER_ADMIN', ${verification?.ownershipVerified ?? null}, ${verification?.verificationMethod ?? null},
      ${verification?.evidenceReference ?? null}, ${verification?.verifiedChannelReference ?? null},
      ${"reason" in request ? request.reason : null}, ${createdAt})`;
}

/** Backend-only SUPER_ADMIN context and human attestation; never a public
 * recovery lookup. Caller retains a fresh generated private key before submitting
 * the operation, and delivers it ONLY through the verified human channel after
 * commit. No raw secret is returned/stored, and no delivery happens in retries.
 */
export async function recoverCheckoutAccess(
  database: Database, actorValue: unknown, scopeValue: CheckoutScope,
  freshCredential: string, value: unknown, clock: Clock = () => new Date(),
  prepareDelivery?: (tx: Prisma.TransactionClient, receipt: ReturnType<typeof recoveryReceipt>) => Promise<void>
) {
  const { actor, scope } = recoveryContext(actorValue, scopeValue);
  const parsedRequest = checkoutRecoveryRequestSchema.parse(value);
  const request = { ...parsedRequest, operationId: parsedRequest.operationId.toLowerCase() };
  const hash = credentialHash(freshCredential);
  const digest = recoveryFingerprint(actor, scope, request, Buffer.from(freshCredential.slice(4), "base64url"));
  return transact(database, async tx => {
    const registration = await lockRecovery(tx, actor, scope, request.operationId, hash);
    const audit = await findRecoveryAudit(tx, actor.churchId, request.operationId);
    const accesses = await registrationAccesses(tx, scope);
    if (audit) {
      checkRecoveryReplay(audit, actor, scope, request.action, digest);
      const access = accesses.find(a => a.id === audit.accessId);
      if (!access || !equalDigest(access.credentialHash, hash)) throw new Error("CHECKOUT_RECOVERY_CONFLICT");
      // Return current revocation/expiry; a delayed retry never resurrects access.
      const receipt = recoveryReceipt(checkoutAccessRecordSchema.parse(access), request.operationId, true);
      if (prepareDelivery) await prepareDelivery(tx, receipt);
      return receipt;
    }
    if (!checkoutRecoverablePaymentStatusSchema.safeParse(registration.paymentStatus).success) {
      throw new Error("CHECKOUT_RECOVERY_INELIGIBLE");
    }
    if (await findAccess(tx, hash)) throw new Error("CHECKOUT_RECOVERY_CONFLICT");
    const unrevoked = accesses.filter(a => a.revokedAt === null);
    if (request.action === "RECOVER" && unrevoked.length) throw new Error("CHECKOUT_REISSUE_REQUIRED");
    const destination = [registration.checkoutEmail, registration.personEmail, registration.visitorEmail]
      .map(email => email?.trim().toLowerCase()).find(email => !!email);
    const supplied = request.action === "RECOVER" ? request.email?.toLowerCase() : undefined;
    if (destination && !createPublicRegistrationV2Schema.shape.email.safeParse(destination).success) {
      throw new Error("CHECKOUT_DESTINATION_INVALID");
    }
    if (destination && supplied && supplied !== destination) throw new Error("CHECKOUT_DESTINATION_CONFLICT");
    if (!destination && !supplied) throw new Error("CHECKOUT_DESTINATION_REQUIRED");
    const createdAt = clock();
    if (accesses.some(a => a.createdAt > createdAt)) throw new Error("CHECKOUT_RECOVERY_CONFLICT");
    if (!destination) {
      await tx.$executeRaw`UPDATE "Registration" SET "checkoutEmail" = ${supplied}
        WHERE "churchId" = ${scope.churchId} AND "eventId" = ${scope.eventId}
          AND "id" = ${scope.registrationId} AND ("checkoutEmail" IS NULL OR btrim("checkoutEmail") = '')`;
    }
    if (unrevoked.length) {
      await tx.$executeRaw`UPDATE "EventCheckoutAccess" SET "revokedAt" = ${createdAt}
        WHERE "churchId" = ${scope.churchId} AND "eventId" = ${scope.eventId}
          AND "registrationId" = ${scope.registrationId} AND "revokedAt" IS NULL`;
    }
    const access = checkoutAccessRecordSchema.parse({ ...scope, id: randomUUID(), credentialHash: hash,
      source: "ADMIN_RECOVERY", requestFingerprint: null, requestedPaymentMethod: null, createdAt,
      expiresAt: new Date(createdAt.getTime() + CHECKOUT_ACCESS_TTL_MS), revokedAt: null });
    await tx.$executeRaw`INSERT INTO "EventCheckoutAccess"
      ("id", "churchId", "eventId", "registrationId", "credentialHash", "source",
       "requestFingerprint", "requestedPaymentMethod", "createdAt", "expiresAt", "revokedAt")
      VALUES (${access.id}, ${scope.churchId}, ${scope.eventId}, ${scope.registrationId}, ${hash},
        'ADMIN_RECOVERY', NULL, NULL, ${createdAt}, ${access.expiresAt}, NULL)`;
    await appendRecoveryAudit(tx, actor, scope, access.id, request, digest, createdAt);
    const receipt = recoveryReceipt(access, request.operationId, false);
    if (prepareDelivery) await prepareDelivery(tx, receipt);
    return receipt;
  }, ["EventCheckoutRecoveryAudit_churchId_operationId_key", "checkout_access_one_unrevoked_key"]);
}

/** Administrative revocation does not require the lost private credential or
 * alter participant/check-in/financial state. Only the scoped active grant is
 * revoked; retries bind to the original audited access, never a later reissue.
 */
export async function revokeCheckoutAccess(
  database: Database, actorValue: unknown, scopeValue: CheckoutScope,
  value: unknown, clock: Clock = () => new Date()
) {
  const { actor, scope } = recoveryContext(actorValue, scopeValue);
  const parsedRequest = checkoutRevocationRequestSchema.parse(value);
  const request = { ...parsedRequest, operationId: parsedRequest.operationId.toLowerCase() };
  return transact(database, async tx => {
    await lockRecovery(tx, actor, scope, request.operationId);
    const audit = await findRecoveryAudit(tx, actor.churchId, request.operationId);
    const accesses = await registrationAccesses(tx, scope);
    const access = audit ? accesses.find(a => a.id === audit.accessId) : accesses.find(a => a.revokedAt === null);
    if (!access) throw new Error("CHECKOUT_RECOVERY_NOT_FOUND");
    checkoutAccessRecordSchema.parse(access);
    // The persisted 256-bit credential digest keys the revocation fingerprint;
    // there is no new secret/configuration and no need to know the lost key.
    const digest = recoveryFingerprint(actor, scope, request, Buffer.from(access.credentialHash, "hex"));
    if (audit) {
      checkRecoveryReplay(audit, actor, scope, "REVOKE", digest);
      return recoveryReceipt(access, request.operationId, true);
    }
    const revokedAt = clock();
    if (revokedAt < access.createdAt) throw new Error("CHECKOUT_RECOVERY_CONFLICT");
    await tx.$executeRaw`UPDATE "EventCheckoutAccess" SET "revokedAt" = ${revokedAt}
      WHERE "churchId" = ${scope.churchId} AND "eventId" = ${scope.eventId}
        AND "registrationId" = ${scope.registrationId} AND "id" = ${access.id} AND "revokedAt" IS NULL`;
    await appendRecoveryAudit(tx, actor, scope, access.id, request, digest, revokedAt);
    return recoveryReceipt({ ...access, revokedAt }, request.operationId, false);
  }, ["EventCheckoutRecoveryAudit_churchId_operationId_key"]);
}
