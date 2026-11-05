import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { checkoutScopeSchema } from "./checkout-access.schema.js";

export type ConfirmationDeliveryStage = "DELIVERY_INTENT" | "DELIVERY_ACCEPTED" | "DELIVERY_UNCERTAIN";
export type ConfirmationDeliveryScope = { churchId: string; eventId: string; registrationId: string };
export type ConfirmationDeliveryEvent = {
  id: string;
  churchId: string;
  eventId: string;
  registrationId: string;
  stage: ConfirmationDeliveryStage;
  createdAt: Date;
};
type Tx = Prisma.TransactionClient;
type Database = Pick<PrismaClient, "$transaction">;
type ClaimDecision<T> = { proceed: false } | { proceed: true; payload: T };

// No provider call belongs in a transaction or in its retry. Claim, accept and
// uncertain each commit on their own. The POST stays in the caller.
export function createPostgresRegistrationConfirmationDeliveryStore(database: Database) {
  async function transaction<T>(body: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await database.$transaction(body, { isolationLevel: "Serializable", timeout: 5_000 });
      } catch (error) {
        const e = error as {
          code?: string;
          meta?: { code?: string; message?: string; driverAdapterError?: { cause?: { originalCode?: string; originalMessage?: string } } };
        };
        const code = e.meta?.code ?? e.meta?.driverAdapterError?.cause?.originalCode;
        const message = e.meta?.message ?? e.meta?.driverAdapterError?.cause?.originalMessage ?? "";
        const retryable = e.code === "P2034" || ["40001", "40P01"].includes(code ?? "") ||
          (code === "23505" && message.includes("registration_confirmation_delivery_stage_key"));
        if (attempt >= 5 || !retryable) throw error;
        await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)));
      }
    }
  }
  async function lock(tx: Tx, scope: ConfirmationDeliveryScope) {
    const parsed = checkoutScopeSchema.parse(scope);
    const key = `registration-confirmation:${parsed.churchId}:${parsed.eventId}:${parsed.registrationId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
    return parsed;
  }
  async function history(tx: Tx, scope: ConfirmationDeliveryScope) {
    return tx.$queryRaw<ConfirmationDeliveryEvent[]>`SELECT "id", "churchId", "eventId", "registrationId", "stage", "createdAt"
      FROM "EventRegistrationConfirmationDeliveryEvent"
      WHERE "churchId" = ${scope.churchId} AND "eventId" = ${scope.eventId} AND "registrationId" = ${scope.registrationId}
      ORDER BY "sequence"`;
  }
  async function insert(tx: Tx, scope: ConfirmationDeliveryScope, stage: ConfirmationDeliveryStage, at: Date) {
    await tx.$executeRaw`INSERT INTO "EventRegistrationConfirmationDeliveryEvent"
      ("id", "churchId", "eventId", "registrationId", "stage", "createdAt")
      VALUES (${randomUUID()}, ${scope.churchId}, ${scope.eventId}, ${scope.registrationId},
        ${stage}::"EventRegistrationConfirmationDeliveryStage", ${at})`;
  }
  async function marker(tx: Tx, scope: ConfirmationDeliveryScope) {
    const rows = await tx.$queryRaw<{ id: string; confirmationEmailSentAt: Date | null }[]>`
      SELECT "id", "confirmationEmailSentAt" FROM "Registration"
      WHERE "id" = ${scope.registrationId} AND "churchId" = ${scope.churchId} AND "eventId" = ${scope.eventId}
      FOR UPDATE`;
    return rows[0] ?? null;
  }
  return {
    async claim<T>(scope: ConfirmationDeliveryScope, decide: (tx: Tx) => Promise<ClaimDecision<T>>) {
      return transaction(async tx => {
        const parsed = await lock(tx, scope);
        const decision = await decide(tx);
        if (!decision.proceed) return { claimed: false as const };
        const rows = await history(tx, parsed);
        if (rows.length) return { claimed: false as const };
        await insert(tx, parsed, "DELIVERY_INTENT", new Date());
        return { claimed: true as const, payload: decision.payload };
      });
    },
    async accept(scope: ConfirmationDeliveryScope, at: Date) {
      return transaction(async tx => {
        const parsed = await lock(tx, scope);
        const row = await marker(tx, parsed);
        const rows = await history(tx, parsed);
        const last = rows.at(-1);
        // Marker and ACCEPTED are written together. An existing marker is left unchanged.
        if (!row || row.confirmationEmailSentAt || last?.stage !== "DELIVERY_INTENT") return false;
        await insert(tx, parsed, "DELIVERY_ACCEPTED", at);
        await tx.registration.update({
          where: { id: parsed.registrationId, churchId: parsed.churchId, eventId: parsed.eventId },
          data: { confirmationEmailSentAt: at }
        });
        return true;
      });
    },
    async uncertain(scope: ConfirmationDeliveryScope, at: Date) {
      return transaction(async tx => {
        const parsed = await lock(tx, scope);
        await marker(tx, parsed);
        const rows = await history(tx, parsed);
        const last = rows.at(-1);
        // A committed ACCEPTED is never downgraded. A terminal UNCERTAIN is not repeated.
        if (last?.stage !== "DELIVERY_INTENT") return false;
        await insert(tx, parsed, "DELIVERY_UNCERTAIN", at);
        return true;
      });
    }
  };
}
