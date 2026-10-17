import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { checkoutRecoveryDeliveryId } from "./checkout-recovery-delivery.identity.js";
import { createPostgresRecoveryDeliveryStore, recoveryReferenceSchema, type CheckoutRecoveryDeliveryStore, type DeliveryContext } from "./checkout-recovery-delivery.store.js";
import { checkoutRecoveryActorSchema, checkoutScopeSchema, type CheckoutRecoveryActor, type CheckoutScope } from "./checkout-access.schema.js";
import { generateCheckoutCredential, recoverCheckoutAccess, withCheckoutAuthorization } from "./checkout-access.service.js";

// Opaque case references only: no documents, contacts, credentials or URLs in audit.
const referenceSchema = recoveryReferenceSchema;
const requestSchema = z.object({
  operationId: z.string().uuid().transform(value => value.toLowerCase()),
  action: z.enum(["RECOVER", "REISSUE"]),
  verifiedEmail: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  verification: z.object({
    ownershipVerified: z.literal(true), emailPossessionVerified: z.literal(true), registrationUnambiguous: z.literal(true),
    evidenceReference: referenceSchema, verifiedChannelReference: referenceSchema
  }).strict()
}).strict();
type Request = z.infer<typeof requestSchema>;
type RecoveryReceipt = Awaited<ReturnType<typeof recoverCheckoutAccess>>;
export type CheckoutRecoveryDelivery = CheckoutScope & {
  operationId: string; accessId: string; recipientEmail: string; credential: string; expiresAt: Date;
};
export type CheckoutRecoveryEmailSender = (input: CheckoutRecoveryDelivery, signal: AbortSignal) => Promise<{ receiptReference: string }>;
export type CheckoutRecoveryDeliveryAudit = CheckoutScope & {
  operationId: string; actorUserId: string; action: "RECOVER" | "REISSUE";
  stage: "DELIVERY_INTENT" | "DELIVERY_ACCEPTED" | "DELIVERY_UNCERTAIN";
  accessId: string; evidenceReference: string; verifiedChannelReference: string;
  policy: "ASSISTED_VERIFIED_EMAIL_V1"; occurredAt: Date; expiresAt: Date;
  receiptReference: string | null;
};
export type AssistedCheckoutRecoveryOptions = {
  // Deployment must explicitly choose the memory retention/delivery deadline and
  // PostgreSQL is the default durable store. Injection is for isolated tests.
  retentionMs: number; deliveryTimeoutMs: number;
  deliveryStore?: CheckoutRecoveryDeliveryStore;
  readEmail?: (receiptReference: string, signal: AbortSignal) => Promise<{ receiptReference: string; operationId: string; deliveryId: string; recipientEmail: string }>;
  sendEmail: CheckoutRecoveryEmailSender;
  clock?: () => Date;
};
export type AssistedCheckoutRecovery = Pick<ReturnType<typeof createAssistedCheckoutRecovery>, "execute">;
function fail(code: string): never { throw new Error(code); }
function unavailable(): never { return fail("CHECKOUT_RECOVERY_KEY_UNAVAILABLE"); }
const safeErrors = new Set([
  "CHECKOUT_RECOVERY_FORBIDDEN", "CHECKOUT_RECOVERY_NOT_FOUND", "CHECKOUT_RECOVERY_INELIGIBLE", "CHECKOUT_RECOVERY_CONFLICT",
  "CHECKOUT_REISSUE_REQUIRED", "CHECKOUT_DESTINATION_REQUIRED", "CHECKOUT_DESTINATION_INVALID", "CHECKOUT_DESTINATION_CONFLICT",
  "CHECKOUT_ACCESS_DENIED", "CHECKOUT_RECOVERY_KEY_UNAVAILABLE", "CHECKOUT_RECOVERY_DELIVERY_UNCERTAIN"
]);

/** Dormant backend coordinator. Neither a route registrar nor a public recovery
 * lookup. Human attestation is recorded, not inferred/proven by matching contacts.
 * The existing service owns issuance, role/tenant checks, audit and revocation.
 */
export function createAssistedCheckoutRecovery(prisma: Pick<PrismaClient, "$transaction">, options: AssistedCheckoutRecoveryOptions) {
  if (!Number.isInteger(options.retentionMs) || options.retentionMs < 1 || options.retentionMs > 15 * 60_000 ||
      !Number.isInteger(options.deliveryTimeoutMs) || options.deliveryTimeoutMs < 1 || options.deliveryTimeoutMs > 30_000 ||
      typeof options.sendEmail !== "function") {
    fail("CHECKOUT_RECOVERY_DELIVERY_NOT_CONFIGURED");
  }
  const clock = options.clock ?? (() => new Date());
  const store = options.deliveryStore ?? createPostgresRecoveryDeliveryStore(prisma);
  const context = (actor: CheckoutRecoveryActor, scope: CheckoutScope, request: Request): DeliveryContext => ({ actor, scope, operationId: request.operationId,
    requestFingerprint: createHash("sha256").update(JSON.stringify([actor.userId, scope.churchId, scope.eventId, scope.registrationId, request])).digest("hex") });
  type Result = RecoveryReceipt & { delivery: "ACCEPTED"; receiptReference: string };
  type Entry = { digest: string; key: Buffer | null; deadline: number; timer: ReturnType<typeof setTimeout>;
    state: "READY" | "SENDING" | "ACCEPTED" | "UNCERTAIN"; result?: Result; running?: Promise<Result>; controller?: AbortController };
  const entries = new Map<string, Entry>();
  let disposed = false;
  const purge = (entry: Entry) => { entry.key?.fill(0); entry.key = null; };
  const identity = (actor: CheckoutRecoveryActor, operationId: string) => `${actor.churchId}:${operationId}`;

  async function preflight(actor: CheckoutRecoveryActor, scope: CheckoutScope, request: Request, forDelivery = true) {
    return prisma.$transaction(async tx => {
      const accounts = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "UserAccount"
        WHERE "churchId" = ${actor.churchId} AND "id" = ${actor.userId}
          AND "role" = 'SUPER_ADMIN' AND "status" = 'ACTIVE' FOR SHARE`;
      if (!accounts.length) fail("CHECKOUT_RECOVERY_FORBIDDEN");
      const event = await tx.event.findFirst({ where: { id: scope.eventId, churchId: scope.churchId, deletedAt: null }, select: { id: true } });
      if (!event) fail("CHECKOUT_RECOVERY_NOT_FOUND");
      const rows = await tx.$queryRaw<{ registrationSource: string; paymentStatus: string; checkoutEmail: string | null;
        personEmail: string | null; visitorEmail: string | null; linkedPersonId: string | null; linkedVisitorId: string | null;
        personId: string | null; visitorId: string | null }[]>`
        SELECT r."registrationSource", r."paymentStatus", r."checkoutEmail", p."email" AS "personEmail", v."email" AS "visitorEmail",
          r."personId" AS "linkedPersonId", r."visitorId" AS "linkedVisitorId", p."id" AS "personId", v."id" AS "visitorId"
        FROM "Registration" r
        LEFT JOIN "Person" p ON p."id" = r."personId" AND p."churchId" = r."churchId"
        LEFT JOIN "Visitor" v ON v."id" = r."visitorId" AND v."churchId" = r."churchId"
        WHERE r."churchId" = ${scope.churchId} AND r."eventId" = ${scope.eventId} AND r."id" = ${scope.registrationId} FOR SHARE OF r`;
      const r = rows[0];
      if (!r || r.registrationSource !== "PUBLIC" || (r.linkedPersonId && r.personId !== r.linkedPersonId) ||
          (r.linkedVisitorId && r.visitorId !== r.linkedVisitorId)) fail("CHECKOUT_RECOVERY_NOT_FOUND");
      if (forDelivery && !["PENDING", "PAID"].includes(r.paymentStatus)) fail("CHECKOUT_RECOVERY_INELIGIBLE");
      const destination = [r.checkoutEmail, r.personEmail, r.visitorEmail].map(value => value?.trim().toLowerCase()).find(Boolean);
      if (forDelivery && destination && !z.string().email().max(254).safeParse(destination).success) fail("CHECKOUT_DESTINATION_INVALID");
      // This comparison protects routing; it is NEVER ownership/email-possession proof.
      if (forDelivery && destination && destination !== request.verifiedEmail) fail("CHECKOUT_DESTINATION_CONFLICT");
      if (forDelivery && !destination && request.action === "REISSUE") fail("CHECKOUT_DESTINATION_REQUIRED");
      const audits = await tx.$queryRaw<{ eventId: string; registrationId: string; actorUserId: string; accessId: string }[]>`
        SELECT "eventId", "registrationId", "actorUserId", "accessId" FROM "EventCheckoutRecoveryAudit"
        WHERE "churchId" = ${scope.churchId} AND "operationId" = ${request.operationId}::uuid`;
      if (audits.some(a => a.eventId !== scope.eventId || a.registrationId !== scope.registrationId || a.actorUserId !== actor.userId)) {
        fail("CHECKOUT_RECOVERY_CONFLICT");
      }
      return audits[0] ?? null;
    }, { isolationLevel: "Serializable" });
  }

  async function loadReceipt(scope: CheckoutScope, accessId: string, operationId: string): Promise<RecoveryReceipt> {
    return prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<{ id: string; expiresAt: Date; revokedAt: Date | null }[]>`SELECT "id", "expiresAt", "revokedAt" FROM "EventCheckoutAccess"
        WHERE "churchId" = ${scope.churchId} AND "eventId" = ${scope.eventId} AND "registrationId" = ${scope.registrationId} AND "id" = ${accessId}`;
      const access = rows[0]; if (!access) fail("CHECKOUT_RECOVERY_NOT_FOUND");
      return { registrationId: scope.registrationId, accessId: access.id, operationId, expiresAt: access.expiresAt, revokedAt: access.revokedAt, wasExisting: true };
    }, { isolationLevel: "Serializable" });
  }

  function ensureRetained(entry: Entry) {
    if (disposed || clock().getTime() >= entry.deadline || !entry.key) { purge(entry); unavailable(); }
  }

  async function perform(actor: CheckoutRecoveryActor, scope: CheckoutScope, request: Request, entry: Entry): Promise<Result> {
    let handoff = false;
    let receipt: RecoveryReceipt | undefined;
    let providerReceipt: string | null = null;
    const c = context(actor, scope, request);
    const audit = async (stage: CheckoutRecoveryDeliveryAudit["stage"]) => {
      return store.append(c, stage, clock(), providerReceipt);
    };
    try {
      ensureRetained(entry);
      receipt = await recoverCheckoutAccess(prisma, actor, scope, entry.key!.toString("utf8"), {
        operationId: request.operationId, action: request.action,
        ...(request.action === "RECOVER" ? { email: request.verifiedEmail } : {}),
        verification: { ownershipVerified: true, verificationMethod: "ASSISTED_VERIFIED_EMAIL_V1",
          evidenceReference: request.verification.evidenceReference, verifiedChannelReference: request.verification.verifiedChannelReference }
      }, clock, async tx => { await store.prepare(tx, c, clock()); });
      if (receipt.revokedAt || clock().getTime() >= receipt.expiresAt.getTime()) unavailable();
      const claimed = await audit("DELIVERY_INTENT"); // Commit before every send.
      if (!claimed) fail("CHECKOUT_RECOVERY_DELIVERY_UNCERTAIN");
      ensureRetained(entry);
      // Revalidate current SUPER_ADMIN, destination and access after the audit sink.
      await preflight(actor, scope, request);
      await withCheckoutAuthorization(prisma, scope, entry.key!.toString("utf8"), async () => undefined, clock);
      ensureRetained(entry);
      entry.state = "SENDING"; handoff = true;
      const controller = new AbortController(); entry.controller = controller;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          Promise.resolve().then(() => options.sendEmail({ ...scope, operationId: request.operationId,
            accessId: receipt!.accessId, recipientEmail: request.verifiedEmail,
            credential: entry.key!.toString("utf8"), expiresAt: receipt!.expiresAt }, controller.signal)),
          new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort();
            reject(new Error("CHECKOUT_RECOVERY_DELIVERY_UNCERTAIN")); }, Math.min(options.deliveryTimeoutMs, entry.deadline - clock().getTime())); })
        ]);
        const parsed = referenceSchema.safeParse(result.receiptReference);
        if (!parsed.success || controller.signal.aborted) fail("CHECKOUT_RECOVERY_DELIVERY_UNCERTAIN");
        providerReceipt = parsed.data;
      } finally { if (timer) clearTimeout(timer); delete entry.controller; }
      await audit("DELIVERY_ACCEPTED");
      entry.state = "ACCEPTED"; purge(entry);
      return entry.result = { ...receipt, delivery: "ACCEPTED", receiptReference: providerReceipt! };
    } catch (error) {
      if (handoff) {
        entry.state = "UNCERTAIN"; purge(entry);
        try { await audit("DELIVERY_UNCERTAIN"); } catch { /* Intent + recovery audit remain; never resend. */ }
        fail("CHECKOUT_RECOVERY_DELIVERY_UNCERTAIN");
      }
      // An ambiguous DB commit keeps the SAME retained key for an explicit retry.
      // No automatic reissue, renewal, email fallback or financial reconciliation.
      if (error instanceof Error && safeErrors.has(error.message)) throw new Error(error.message);
      fail("CHECKOUT_RECOVERY_RETRY_REQUIRED");
    }
  }

  return {
    async execute(actorValue: unknown, scopeValue: CheckoutScope, value: unknown): Promise<Result> {
      const actorResult = checkoutRecoveryActorSchema.safeParse(actorValue), scopeResult = checkoutScopeSchema.safeParse(scopeValue);
      if (!actorResult.success || !scopeResult.success || actorResult.data.churchId !== scopeResult.data.churchId) fail("CHECKOUT_RECOVERY_FORBIDDEN");
      const actor = actorResult.data, scope = scopeResult.data, input = requestSchema.safeParse(value);
      if (!input.success) fail("CHECKOUT_RECOVERY_INPUT_INVALID");
      if (disposed) unavailable();
      const request = input.data, id = identity(actor, request.operationId);
      const c = context(actor, scope, request), digest = c.requestFingerprint;
      try {
        const committed = await preflight(actor, scope, request);
        let entry = entries.get(id);
        if (entry && entry.digest !== digest) fail("CHECKOUT_RECOVERY_CONFLICT");
        if (entry?.running) return await entry.running;
        if (committed) {
          const history = await store.read(c), last = history.at(-1);
          if (last && ["DELIVERY_ACCEPTED", "DELIVERY_RECONCILED_ACCEPTED"].includes(last.stage)) {
            return { ...await loadReceipt(scope, committed.accessId, request.operationId), delivery: "ACCEPTED", receiptReference: last.receiptReference! };
          }
          if (history.some(e => e.stage === "DELIVERY_INTENT")) { if (entry) purge(entry); fail("CHECKOUT_RECOVERY_DELIVERY_UNCERTAIN"); }
        }
        if (entry?.state === "UNCERTAIN") fail("CHECKOUT_RECOVERY_DELIVERY_UNCERTAIN");
        if (!entry) {
          // Restart/expiry cannot recreate a committed operation's lost secret.
          if (committed) unavailable();
          const timer = setTimeout(() => {
            const current = entries.get(id); if (!current) return;
            current.controller?.abort(); purge(current); entries.delete(id);
          }, options.retentionMs); timer.unref();
          entry = { digest, key: Buffer.from(generateCheckoutCredential(), "utf8"), deadline: clock().getTime() + options.retentionMs,
            timer, state: "READY" }; entries.set(id, entry);
        }
        ensureRetained(entry);
        const running = perform(actor, scope, request, entry); entry.running = running;
        try { return await running; } finally { delete entry.running; }
      } catch (error) {
        if (error instanceof Error && safeErrors.has(error.message)) throw new Error(error.message);
        if (error instanceof Error && error.message === "CHECKOUT_RECOVERY_RETRY_REQUIRED") throw new Error(error.message);
        fail("CHECKOUT_RECOVERY_RETRY_REQUIRED");
      }
    },
    // Safe backend query: original actor + immutable request, no credential.
    async inspect(actorValue: unknown, scopeValue: CheckoutScope, value: unknown) {
      try {
        const actor = checkoutRecoveryActorSchema.parse(actorValue), scope = checkoutScopeSchema.parse(scopeValue), request = requestSchema.parse(value);
        if (disposed) unavailable();
        if (actor.churchId !== scope.churchId) fail("CHECKOUT_RECOVERY_FORBIDDEN");
        const committed = await preflight(actor, scope, request, false);
        if (!committed) fail("CHECKOUT_RECOVERY_NOT_FOUND");
        const history = await store.read(context(actor, scope, request)), last = history.at(-1);
        if (!last) unavailable();
        return { ...await loadReceipt(scope, committed.accessId, request.operationId),
          delivery: last.stage === "PREPARED" ? "PREPARED" : ["DELIVERY_ACCEPTED", "DELIVERY_RECONCILED_ACCEPTED"].includes(last.stage) ? "ACCEPTED" : "UNCERTAIN",
          receiptReference: last.receiptReference };
      } catch (error) {
        if (error instanceof Error && safeErrors.has(error.message)) throw new Error(error.message);
        fail("CHECKOUT_RECOVERY_RETRY_REQUIRED");
      }
    },
    // Backend-only, explicit evidence-based reconciliation. No route or resend.
    async reconcile(actorValue: unknown, scopeValue: CheckoutScope, value: unknown, evidenceValue: unknown): Promise<Result> {
      try {
        const actor = checkoutRecoveryActorSchema.parse(actorValue), scope = checkoutScopeSchema.parse(scopeValue);
        const request = requestSchema.parse(value);
        const evidence = z.object({ receiptReference: referenceSchema, evidenceReference: referenceSchema }).strict().parse(evidenceValue);
        if (disposed) unavailable();
        if (actor.churchId !== scope.churchId) fail("CHECKOUT_RECOVERY_FORBIDDEN");
        if (!options.readEmail) fail("CHECKOUT_RECOVERY_DELIVERY_UNCERTAIN");
        const committed = await preflight(actor, scope, request, false);
        if (!committed) fail("CHECKOUT_RECOVERY_NOT_FOUND");
        const c = context(actor, scope, request), history = await store.read(c), last = history.at(-1);
        if (!history.some(e => e.stage === "DELIVERY_INTENT")) fail("CHECKOUT_RECOVERY_CONFLICT");
        if (last?.receiptReference && last.receiptReference !== evidence.receiptReference) fail("CHECKOUT_RECOVERY_CONFLICT");
        if (last?.stage === "DELIVERY_RECONCILED_ACCEPTED" && last.evidenceReference !== evidence.evidenceReference) fail("CHECKOUT_RECOVERY_CONFLICT");
        const receipt = await loadReceipt(scope, committed.accessId, request.operationId);
        if (last && ["DELIVERY_ACCEPTED", "DELIVERY_RECONCILED_ACCEPTED"].includes(last.stage)) {
          return { ...receipt, delivery: "ACCEPTED", receiptReference: last.receiptReference! };
        }
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let found: Awaited<ReturnType<NonNullable<AssistedCheckoutRecoveryOptions["readEmail"]>>>;
        try {
          found = await Promise.race([options.readEmail(evidence.receiptReference, controller.signal),
            new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("CHECKOUT_RECOVERY_DELIVERY_UNCERTAIN")); }, options.deliveryTimeoutMs); })]);
          if (controller.signal.aborted || found.receiptReference !== evidence.receiptReference ||
            found.operationId !== request.operationId || found.recipientEmail !== request.verifiedEmail ||
            found.deliveryId !== checkoutRecoveryDeliveryId({ ...scope, operationId: request.operationId, accessId: receipt.accessId })) fail("CHECKOUT_RECOVERY_CONFLICT");
        } finally { if (timer) clearTimeout(timer); }
        await preflight(actor, scope, request, false);
        await store.append(c, "DELIVERY_RECONCILED_ACCEPTED", clock(), evidence.receiptReference, evidence.evidenceReference);
        return { ...receipt, delivery: "ACCEPTED", receiptReference: evidence.receiptReference };
      } catch (error) {
        if (error instanceof Error && safeErrors.has(error.message)) throw new Error(error.message);
        fail("CHECKOUT_RECOVERY_DELIVERY_UNCERTAIN");
      }
    },
    dispose() { disposed = true; for (const entry of entries.values()) { clearTimeout(entry.timer); entry.controller?.abort(); purge(entry); } entries.clear(); }
  };
}
