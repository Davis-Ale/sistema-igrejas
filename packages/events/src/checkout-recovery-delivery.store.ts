import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { checkoutRecoveryActorSchema, checkoutScopeSchema, type CheckoutRecoveryActor, type CheckoutScope } from "./checkout-access.schema.js";
import { z } from "zod";

export const recoveryReferenceSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{2,119}$/)
  .refine(value => !/^(ec2_|sik_)/.test(value));
export type DeliveryStage = "PREPARED" | "DELIVERY_INTENT" | "DELIVERY_ACCEPTED" | "DELIVERY_UNCERTAIN" | "DELIVERY_RECONCILED_ACCEPTED";
export type DeliveryEvent = {
  id: string; churchId: string; operationId: string; stage: DeliveryStage; requestFingerprint: string;
  actorUserId: string; receiptReference: string | null; evidenceReference: string | null; createdAt: Date;
};
export type DeliveryContext = { actor: CheckoutRecoveryActor; scope: CheckoutScope; operationId: string; requestFingerprint: string };
type Tx = Prisma.TransactionClient;
type Database = Pick<PrismaClient, "$transaction">;
const fail = (code: string): never => { throw new Error(code); };

export interface CheckoutRecoveryDeliveryStore {
  prepare(tx: Tx, context: DeliveryContext, at: Date): Promise<void>;
  read(context: DeliveryContext): Promise<DeliveryEvent[]>;
  append(context: DeliveryContext, stage: Exclude<DeliveryStage, "PREPARED">, at: Date,
    receiptReference?: string | null, evidenceReference?: string | null): Promise<boolean>;
}

// No provider call belongs in a transaction/retry. All methods use the same
// tenant-wide operation lock as recovery; the SQL trigger also serializes inserts.
export function createPostgresRecoveryDeliveryStore(database: Database): CheckoutRecoveryDeliveryStore {
  async function transaction<T>(body: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await database.$transaction(body, { isolationLevel: "Serializable" }); }
      catch (error) {
        const e = error as { code?: string; meta?: { code?: string; message?: string; driverAdapterError?: { cause?: { originalCode?: string; originalMessage?: string } } } };
        const code = e.meta?.code ?? e.meta?.driverAdapterError?.cause?.originalCode;
        const message = e.meta?.message ?? e.meta?.driverAdapterError?.cause?.originalMessage ?? "";
        const retryable = e.code === "P2034" || (["40001", "40P01"].includes(code ?? "") ||
          (code === "23505" && message.includes("checkout_delivery_operation_stage_key")));
        if (attempt >= 5 || !retryable) throw error;
        await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)));
      }
    }
  }
  async function lock(tx: Tx, c: DeliveryContext) {
    checkoutRecoveryActorSchema.parse(c.actor); checkoutScopeSchema.parse(c.scope);
    z.string().uuid().parse(c.operationId); z.string().regex(/^[a-f0-9]{64}$/).parse(c.requestFingerprint);
    if (c.actor.churchId !== c.scope.churchId) fail("CHECKOUT_RECOVERY_FORBIDDEN");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`checkout-recovery:${c.scope.churchId}:${c.operationId}`}, 0))::text`;
    const actors = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "UserAccount"
      WHERE "churchId" = ${c.scope.churchId} AND "id" = ${c.actor.userId} AND "role" = 'SUPER_ADMIN' AND "status" = 'ACTIVE' FOR SHARE`;
    if (!actors.length) fail("CHECKOUT_RECOVERY_FORBIDDEN");
    const parents = await tx.$queryRaw<{ eventId: string; registrationId: string; actorUserId: string; action: string }[]>`
      SELECT "eventId", "registrationId", "actorUserId", "action" FROM "EventCheckoutRecoveryAudit"
      WHERE "churchId" = ${c.scope.churchId} AND "operationId" = ${c.operationId}::uuid FOR UPDATE`;
    const parent = parents[0];
    if (!parent || parent.eventId !== c.scope.eventId || parent.registrationId !== c.scope.registrationId ||
      parent.actorUserId !== c.actor.userId || !["RECOVER", "REISSUE"].includes(parent.action)) fail("CHECKOUT_RECOVERY_CONFLICT");
  }
  async function events(tx: Tx, c: DeliveryContext) {
    const rows = await tx.$queryRaw<DeliveryEvent[]>`SELECT "id", "churchId", "operationId", "stage", "requestFingerprint",
      "actorUserId", "receiptReference", "evidenceReference", "createdAt" FROM "EventCheckoutRecoveryDeliveryEvent"
      WHERE "churchId" = ${c.scope.churchId} AND "operationId" = ${c.operationId}::uuid ORDER BY "sequence"`;
    if (rows.some(row => row.requestFingerprint !== c.requestFingerprint)) fail("CHECKOUT_RECOVERY_CONFLICT");
    return rows;
  }
  async function insert(tx: Tx, c: DeliveryContext, stage: DeliveryStage, at: Date, receipt: string | null, evidence: string | null) {
    if (receipt !== null) recoveryReferenceSchema.parse(receipt);
    if (evidence !== null) recoveryReferenceSchema.parse(evidence);
    await tx.$executeRaw`INSERT INTO "EventCheckoutRecoveryDeliveryEvent"
      ("id", "churchId", "operationId", "stage", "requestFingerprint", "actorUserId", "receiptReference", "evidenceReference", "createdAt")
      VALUES (${randomUUID()}, ${c.scope.churchId}, ${c.operationId}::uuid, ${stage}::"EventCheckoutRecoveryDeliveryStage",
        ${c.requestFingerprint}, ${c.actor.userId}, ${receipt}, ${evidence}, ${at})`;
  }
  return {
    async prepare(tx, c, at) {
      await lock(tx, c);
      const rows = await events(tx, c);
      if (!rows.length) await insert(tx, c, "PREPARED", at, null, null);
    },
    async read(c) { return transaction(async tx => { await lock(tx, c); return events(tx, c); }); },
    async append(c, stage, at, receipt = null, evidence = null) {
      return transaction(async tx => {
        await lock(tx, c);
        const rows = await events(tx, c), last = rows.at(-1);
        const same = rows.find(row => row.stage === stage);
        if (same) {
          if (same.receiptReference !== receipt || same.evidenceReference !== evidence) fail("CHECKOUT_RECOVERY_CONFLICT");
          return false;
        }
        if (!last) return fail("CHECKOUT_RECOVERY_CONFLICT");
        // An ambiguous ACCEPTED commit must never be downgraded to UNCERTAIN.
        if (stage === "DELIVERY_UNCERTAIN" && ["DELIVERY_ACCEPTED", "DELIVERY_RECONCILED_ACCEPTED"].includes(last.stage)) return false;
        const allowed = stage === "DELIVERY_INTENT" ? last.stage === "PREPARED" :
          stage === "DELIVERY_RECONCILED_ACCEPTED" ? ["DELIVERY_INTENT", "DELIVERY_UNCERTAIN"].includes(last.stage) : last.stage === "DELIVERY_INTENT";
        if (!allowed) fail("CHECKOUT_RECOVERY_CONFLICT");
        await insert(tx, c, stage, at, receipt, evidence);
        return true;
      });
    }
  };
}
