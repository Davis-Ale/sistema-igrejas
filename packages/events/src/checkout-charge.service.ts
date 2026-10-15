import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  checkoutAccessRecordSchema, checkoutChargeAttemptStateSchema, checkoutChargeAttemptTransitionSchema,
  checkoutPaymentMethodSchema, createPublicRegistrationV2Schema, publicCheckoutResumeV2Schema,
  type CheckoutAccessRecord, type CheckoutScope
} from "./checkout-access.schema.js";
import { withCheckoutAuthorization } from "./checkout-access.service.js";

type Database = Pick<PrismaClient, "$transaction">;
type EventScope = Pick<CheckoutScope, "churchId" | "eventId">;
type Method = z.infer<typeof checkoutPaymentMethodSchema>;
type Attempt = EventScope & { id: string; eventPaymentId: string; transactionId: string;
  requestedMethod: Method; state: z.infer<typeof checkoutChargeAttemptStateSchema>; providerPaymentId: string | null };
type Graph = CheckoutScope & { eventPaymentId: string; transactionId: string; orderId: string; amount: string;
  provider: string; providerPaymentId: string | null; asaasId: string | null; method: string;
  registrationStatus: string; registrationPaymentStatus: string; waitlistedAt: Date | null;
  paymentStatus: string; transactionStatus: string; orderStatus: string; checkoutEmail: string | null;
  name: string | null; phone: string | null; linkedPersonId: string | null; linkedVisitorId: string | null;
  personId: string | null; visitorId: string | null };
type Plan = { graph: Graph; attempt: Attempt };

export type CheckoutFirstChargeCommand = {
  churchId: string; eventId: string; eventPaymentId: string; transactionId: string;
  attemptId: string; method: Method; amount: number; externalReference: string; idempotencyKey: string;
  customer: { name: string; email: string; cpf: string; phone?: string };
};
const providerReceiptSchema = z.object({
  id: z.string().trim().min(1), externalReference: z.string().min(1),
  method: z.enum(["PIX", "CARD"]), amount: z.number().finite().positive()
});
export type CheckoutFirstChargeReceipt = z.infer<typeof providerReceiptSchema>;
export type CheckoutFirstChargeProvider = {
  create(command: CheckoutFirstChargeCommand, signal: AbortSignal): Promise<CheckoutFirstChargeReceipt>;
  read(id: string, signal: AbortSignal): Promise<CheckoutFirstChargeReceipt>;
};
type Options = { timeoutMs?: number };
const denied = () => new Error("CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED");
const reference = (graph: Graph) => `${graph.churchId}:${graph.eventPaymentId}:payment`;

function isRetryable(error: unknown, uniqueness = false) {
  const failure = error as { code?: string; meta?: { code?: string; message?: string;
    driverAdapterError?: { cause?: { originalCode?: string; originalMessage?: string } } } } | null;
  // Prisma's pg adapter wraps raw SQL errors; older clients expose code/message directly.
  const cause = failure?.meta?.driverAdapterError?.cause;
  const code = failure?.meta?.code ?? cause?.originalCode;
  const message = failure?.meta?.message ?? cause?.originalMessage;
  return failure?.code === "P2034" || (failure?.code === "P2010" &&
    (["40001", "40P01"].includes(code ?? "") || (uniqueness && code === "23505" &&
      ["EventCheckoutChargeAttempt_eventPaymentId_key", "EventCheckoutChargeAttempt_transactionId_key", "checkout_charge_payment_scope_key"]
        .some(name => typeof message === "string" && (message === name || message.includes(`"${name}"`))))));
}

async function databaseOnly<T>(database: Database, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let retry = 0; ; retry++) {
    try { return await database.$transaction(operation, { isolationLevel: "Serializable" }); }
    catch (error) { if (retry >= 2 || !isRetryable(error)) throw error; }
  }
}

async function lockGraph(tx: Prisma.TransactionClient, scope: CheckoutScope): Promise<Graph> {
  // Key/event/registration locking is acquired by the caller before this helper.
  await tx.$queryRaw`SELECT "id" FROM "Registration" WHERE "churchId" = ${scope.churchId}
    AND "eventId" = ${scope.eventId} AND "id" = ${scope.registrationId} FOR UPDATE`;
  const payment = await tx.registration.findFirst({
    where: { id: scope.registrationId, churchId: scope.churchId, eventId: scope.eventId, registrationSource: "PUBLIC" },
    select: { paymentId: true, orderId: true }
  });
  if (!payment?.paymentId || !payment.orderId) throw denied();
  const binding = await tx.eventPayment.findFirst({
    where: { id: payment.paymentId, churchId: scope.churchId, eventId: scope.eventId, orderId: payment.orderId },
    select: { transactionId: true }
  });
  if (!binding) throw denied();
  // Same official-transaction mutex as the existing financial adapter. Exclusive
  // coordinated v2 activation is still mandatory: legacy ignores the durable guard.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`event-charge:${scope.churchId}:${binding.transactionId}`}, 0))::text`;
  const rows = await tx.$queryRaw<Graph[]>`
    SELECT r."churchId", r."eventId", r."id" AS "registrationId", p."id" AS "eventPaymentId", p."transactionId", p."orderId",
      p."amount"::text AS "amount", p."provider", p."providerPaymentId", t."asaasId", t."method",
      r."status" AS "registrationStatus", r."paymentStatus" AS "registrationPaymentStatus", r."waitlistedAt",
      p."status" AS "paymentStatus", t."status" AS "transactionStatus", o."status" AS "orderStatus", r."checkoutEmail",
      coalesce(person."name", visitor."name") AS "name", coalesce(person."phone", visitor."phone") AS "phone",
      r."personId" AS "linkedPersonId", r."visitorId" AS "linkedVisitorId", person."id" AS "personId", visitor."id" AS "visitorId"
    FROM "Registration" r
    JOIN "EventPayment" p ON p."id" = r."paymentId" AND p."orderId" = r."orderId" AND p."churchId" = r."churchId" AND p."eventId" = r."eventId"
    JOIN "Transaction" t ON t."id" = p."transactionId" AND t."churchId" = p."churchId" AND t."eventId" = p."eventId"
    JOIN "EventOrder" o ON o."id" = p."orderId" AND o."churchId" = p."churchId" AND o."eventId" = p."eventId"
    LEFT JOIN "Person" person ON person."id" = r."personId" AND person."churchId" = r."churchId"
    LEFT JOIN "Visitor" visitor ON visitor."id" = r."visitorId" AND visitor."churchId" = r."churchId"
    WHERE r."churchId" = ${scope.churchId} AND r."eventId" = ${scope.eventId} AND r."id" = ${scope.registrationId}
      AND r."registrationSource" = 'PUBLIC' AND t."type" = 'EVENT' AND t."direction" = 'IN'
      AND p."amount" = t."amount" AND p."amount" = o."totalAmount"
    FOR UPDATE OF p, t, o`;
  const graph = rows[0];
  if (rows.length !== 1 || !graph || graph.provider !== "ASAAS" || graph.churchId !== scope.churchId ||
      graph.eventId !== scope.eventId || graph.registrationId !== scope.registrationId ||
      graph.eventPaymentId !== payment.paymentId || graph.orderId !== payment.orderId || graph.transactionId !== binding.transactionId) throw denied();
  return graph;
}

async function originalMethod(tx: Prisma.TransactionClient, scope: CheckoutScope): Promise<Method> {
  const rows = await tx.$queryRaw<CheckoutAccessRecord[]>`
    SELECT "id", "churchId", "eventId", "registrationId", "credentialHash", "source", "requestFingerprint",
      "requestedPaymentMethod", "createdAt", "expiresAt", "revokedAt"
    FROM "EventCheckoutAccess" WHERE "churchId" = ${scope.churchId} AND "eventId" = ${scope.eventId}
      AND "registrationId" = ${scope.registrationId} AND "source" = 'PUBLIC_ATTEMPT'`;
  // An absent legacy reference is NOT proof of a safe first creation. Only a
  // genuine v2 initial attempt supplies the immutable semantic method.
  if (rows.length !== 1) throw denied();
  const initial = checkoutAccessRecordSchema.safeParse(rows[0]);
  if (!initial.success || !initial.data.requestedPaymentMethod) throw denied();
  return initial.data.requestedPaymentMethod;
}

async function loadAttempt(tx: Prisma.TransactionClient, graph: Graph): Promise<Attempt | null> {
  const rows = await tx.$queryRaw<Attempt[]>`
    SELECT "id", "churchId", "eventId", "eventPaymentId", "transactionId", "requestedMethod", "state", "providerPaymentId"
    FROM "EventCheckoutChargeAttempt" WHERE "churchId" = ${graph.churchId} AND "eventId" = ${graph.eventId}
      AND "eventPaymentId" = ${graph.eventPaymentId} AND "transactionId" = ${graph.transactionId} FOR UPDATE`;
  const attempt = rows[0];
  if (rows.length > 1 || (attempt && (attempt.churchId !== graph.churchId || attempt.eventId !== graph.eventId ||
      attempt.eventPaymentId !== graph.eventPaymentId || attempt.transactionId !== graph.transactionId ||
      !checkoutChargeAttemptStateSchema.safeParse(attempt.state).success ||
      !checkoutPaymentMethodSchema.safeParse(attempt.requestedMethod).success))) throw denied();
  return attempt ?? null;
}

function assertMethod(graph: Graph, method: Method) {
  if (graph.method !== (method === "PIX" ? "PIX" : "CARD")) throw denied();
}
function validateReceipt(graph: Graph, method: Method, value: unknown): CheckoutFirstChargeReceipt {
  const result = providerReceiptSchema.safeParse(value);
  if (!result.success || result.data.externalReference !== reference(graph) ||
      result.data.method !== (method === "PIX" ? "PIX" : "CARD") ||
      !new Prisma.Decimal(result.data.amount).equals(graph.amount)) throw denied();
  return result.data;
}

async function withDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(denied()); }, timeoutMs);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
function deadline(options: Options) {
  return z.number().int().min(1).max(120_000).parse(options.timeoutMs ?? 30_000);
}
function output(graph: Graph, attemptId: string | null, providerPaymentId: string, wasExisting: boolean) {
  // Internal receipt only. Never returns QR/app/participant eligibility or secrets.
  return { churchId: graph.churchId, eventId: graph.eventId, registrationId: graph.registrationId,
    eventPaymentId: graph.eventPaymentId, transactionId: graph.transactionId, attemptId, providerPaymentId, wasExisting };
}

async function finish(database: Database, plan: Plan, receipt: CheckoutFirstChargeReceipt) {
  return databaseOnly(database, async tx => {
    const graph = await lockGraph(tx, plan.graph);
    const attempt = await loadAttempt(tx, graph);
    if (!attempt || attempt.id !== plan.attempt.id || attempt.requestedMethod !== plan.attempt.requestedMethod ||
        graph.eventPaymentId !== plan.graph.eventPaymentId || graph.transactionId !== plan.graph.transactionId ||
        graph.orderId !== plan.graph.orderId || !new Prisma.Decimal(graph.amount).equals(plan.graph.amount)) throw denied();
    assertMethod(graph, attempt.requestedMethod);
    validateReceipt(graph, attempt.requestedMethod, receipt);
    if ([graph.providerPaymentId, graph.asaasId, attempt.providerPaymentId].some(id => id !== null && id !== receipt.id)) throw denied();
    if (attempt.state === "SUCCEEDED") {
      if (graph.providerPaymentId !== receipt.id || graph.asaasId !== receipt.id) throw denied();
      return output(graph, attempt.id, receipt.id, true);
    }
    checkoutChargeAttemptTransitionSchema.parse({ from: attempt.state, to: "SUCCEEDED", providerPaymentId: receipt.id });
    // Guard against reuse of this external reference in another official ledger.
    const duplicates = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Transaction" WHERE "asaasId" = ${receipt.id} AND "id" <> ${graph.transactionId}`;
    if (duplicates.length) throw denied();
    const transactionUpdated = await tx.$executeRaw`UPDATE "Transaction" SET "asaasId" = ${receipt.id}
      WHERE "churchId" = ${graph.churchId} AND "eventId" = ${graph.eventId} AND "id" = ${graph.transactionId}
        AND ("asaasId" IS NULL OR "asaasId" = ${receipt.id})`;
    const paymentUpdated = await tx.$executeRaw`UPDATE "EventPayment" SET "providerPaymentId" = ${receipt.id}
      WHERE "churchId" = ${graph.churchId} AND "eventId" = ${graph.eventId} AND "id" = ${graph.eventPaymentId}
        AND "transactionId" = ${graph.transactionId} AND ("providerPaymentId" IS NULL OR "providerPaymentId" = ${receipt.id})`;
    const attemptUpdated = await tx.$executeRaw`UPDATE "EventCheckoutChargeAttempt" SET "state" = 'SUCCEEDED', "providerPaymentId" = ${receipt.id}, "updatedAt" = ${new Date()}
      WHERE "churchId" = ${graph.churchId} AND "eventId" = ${graph.eventId} AND "id" = ${attempt.id}
        AND "eventPaymentId" = ${graph.eventPaymentId} AND "transactionId" = ${graph.transactionId}
        AND "state" IN ('STARTED', 'UNCERTAIN')`;
    if (transactionUpdated !== 1 || paymentUpdated !== 1 || attemptUpdated !== 1) throw denied();
    return output(graph, attempt.id, receipt.id, false);
  });
}

async function uncertain(database: Database, plan: Plan, knownId: string | null) {
  await databaseOnly(database, async tx => {
    const graph = await lockGraph(tx, plan.graph), attempt = await loadAttempt(tx, graph);
    if (!attempt || attempt.id !== plan.attempt.id || attempt.state !== "STARTED") return;
    checkoutChargeAttemptTransitionSchema.parse({ from: "STARTED", to: "UNCERTAIN", providerPaymentId: knownId });
    await tx.$executeRaw`UPDATE "EventCheckoutChargeAttempt" SET "state" = 'UNCERTAIN', "providerPaymentId" = ${knownId}, "updatedAt" = ${new Date()}
      WHERE "churchId" = ${graph.churchId} AND "eventId" = ${graph.eventId} AND "id" = ${attempt.id}
        AND "eventPaymentId" = ${graph.eventPaymentId} AND "transactionId" = ${graph.transactionId} AND "state" = 'STARTED'`;
  });
}

/** Dormant guard. Only the freshly committed STARTED owner can invoke create.
 * No provider request is inside a transaction/retry. STARTED and UNCERTAIN never
 * reset or automatically create again, even after process crash/timeout.
 */
export async function createFirstCheckoutCharge(database: Database, scope: EventScope, credential: string,
  value: unknown, provider: CheckoutFirstChargeProvider, options: Options = {}) {
  const input = publicCheckoutResumeV2Schema.parse(value), timeoutMs = deadline(options);
  let claimed: { plan: Plan; command: CheckoutFirstChargeCommand } | ReturnType<typeof output>;
  for (let retry = 0; ; retry++) {
    try {
      claimed = await withCheckoutAuthorization(database, scope, credential, async (tx, authorized) => {
        const graph = await lockGraph(tx, authorized), method = await originalMethod(tx, authorized);
        assertMethod(graph, method);
        const attempt = await loadAttempt(tx, graph);
        if (attempt) {
          if (attempt.requestedMethod !== method || attempt.state !== "SUCCEEDED" || !attempt.providerPaymentId ||
              graph.providerPaymentId !== attempt.providerPaymentId || graph.asaasId !== attempt.providerPaymentId) throw denied();
          return output(graph, attempt.id, attempt.providerPaymentId, true);
        }
        if (graph.providerPaymentId || graph.asaasId) {
          if (!graph.providerPaymentId || graph.asaasId !== graph.providerPaymentId) throw denied();
          return output(graph, null, graph.providerPaymentId, true); // Do not fabricate a historical guard.
        }
        const event = await tx.event.findFirst({
          where: { id: graph.eventId, churchId: graph.churchId, deletedAt: null }, select: { id: true }
        });
        if (!event) throw denied();
        if (graph.registrationStatus !== "PENDING" || graph.registrationPaymentStatus !== "PENDING" || graph.waitlistedAt !== null ||
            graph.paymentStatus !== "PENDING" || graph.orderStatus !== "PENDING" || graph.transactionStatus !== "ACTIVE" ||
            (graph.linkedPersonId && graph.personId !== graph.linkedPersonId) || (graph.linkedVisitorId && graph.visitorId !== graph.linkedVisitorId)) throw denied();
        if (!input.cpf) throw new Error("PAYMENT_CUSTOMER_CPF_REQUIRED");
        const email = createPublicRegistrationV2Schema.shape.email.safeParse(graph.checkoutEmail);
        const name = z.string().trim().min(2).safeParse(graph.name);
        const amount = Number(graph.amount);
        if (!email.success || !name.success || !Number.isFinite(amount) || amount <= 0 || !new Prisma.Decimal(amount).equals(graph.amount)) throw denied();
        const createdAt = new Date(), id = randomUUID();
        const newAttempt: Attempt = { ...authorized, id, eventPaymentId: graph.eventPaymentId, transactionId: graph.transactionId,
          requestedMethod: method, state: "STARTED", providerPaymentId: null };
        const inserted = await tx.$executeRaw`INSERT INTO "EventCheckoutChargeAttempt"
          ("id", "churchId", "eventId", "eventPaymentId", "transactionId", "requestedMethod", "state", "providerPaymentId", "createdAt", "updatedAt")
          VALUES (${id}, ${graph.churchId}, ${graph.eventId}, ${graph.eventPaymentId}, ${graph.transactionId},
            ${method}::"EventCheckoutPaymentMethod", 'STARTED', NULL, ${createdAt}, ${createdAt})`;
        if (inserted !== 1) throw denied();
        const idempotencyKey = createHash("sha256").update(JSON.stringify([
          "event-checkout-charge-v2", graph.churchId, graph.eventId, graph.eventPaymentId, graph.transactionId, id
        ])).digest("hex");
        return { plan: { graph, attempt: newAttempt }, command: {
          churchId: graph.churchId, eventId: graph.eventId, eventPaymentId: graph.eventPaymentId, transactionId: graph.transactionId,
          attemptId: id, method, amount, externalReference: reference(graph), idempotencyKey,
          customer: { name: name.data, email: email.data.toLowerCase(), cpf: input.cpf.replace(/\D/g, ""),
            ...(graph.phone ? { phone: graph.phone } : {}) }
        } };
      });
      break;
    } catch (error) {
      // The access service already bounded its serialization/deadlock retries.
      // Exhaustion requires reconciliation; never restart that retry budget or POST.
      if (isRetryable(error)) throw denied();
      // Only a charge-specific stale-snapshot uniqueness race retries here.
      if (!isRetryable(error, true)) throw error;
      if (retry >= 2) throw denied();
    }
  }
  if (!("plan" in claimed)) return claimed;
  let receipt: CheckoutFirstChargeReceipt | null = null;
  try {
    const result = await withDeadline(signal => provider.create(claimed.command, signal), timeoutMs);
    receipt = validateReceipt(claimed.plan.graph, claimed.plan.attempt.requestedMethod, result);
    // Successful charge creation is not payment confirmation. Record references
    // even if access expires/revokes meanwhile; no participant/status/email write.
    return await finish(database, claimed.plan, receipt);
  } catch {
    try { await uncertain(database, claimed.plan, receipt?.id ?? null); } catch { /* Durable STARTED still blocks creation. */ }
    throw denied(); // Do not expose/log provider errors, credentials, CPF or responses.
  }
}

/** Separate explicit, authenticated-capability reconciliation, never automatic
 * retry or a public body. Known provider ID comes from trusted backend evidence.
 * GET validates reference/method/value before atomically completing the SAME
 * attempt. No POST, new ledger, method change or proof-by-absence restart.
 */
export async function reconcileFirstCheckoutCharge(database: Database, scope: EventScope, credential: string,
  knownProviderId: string, provider: CheckoutFirstChargeProvider, options: Options = {}) {
  const id = z.string().trim().min(1).parse(knownProviderId), timeoutMs = deadline(options);
  const plan = await withCheckoutAuthorization(database, scope, credential, async (tx, authorized): Promise<Plan> => {
    const graph = await lockGraph(tx, authorized), method = await originalMethod(tx, authorized), attempt = await loadAttempt(tx, graph);
    if (!attempt || attempt.requestedMethod !== method ||
        [graph.providerPaymentId, graph.asaasId, attempt.providerPaymentId].some(existing => existing !== null && existing !== id)) throw denied();
    assertMethod(graph, method); return { graph, attempt };
  });
  try {
    const receipt = validateReceipt(plan.graph, plan.attempt.requestedMethod, await withDeadline(signal => provider.read(id, signal), timeoutMs));
    if (receipt.id !== id) throw denied();
    return await finish(database, plan, receipt);
  } catch { throw denied(); }
}
