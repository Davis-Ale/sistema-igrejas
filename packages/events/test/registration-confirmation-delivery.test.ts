import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import { sendPendingRegistrationConfirmationEmail as deliver } from "../src/registration-confirmation-delivery.service.ts";

const scope = { churchId: "church-a", eventId: "event-a", registrationId: "registration-a" };
const shared = { churchId: scope.churchId, name: "Participante", email: "shared@example.invalid" };
type Stage = "DELIVERY_INTENT" | "DELIVERY_ACCEPTED" | "DELIVERY_UNCERTAIN";
type DeliveryRow = {
  id: string; churchId: string; eventId: string; registrationId: string;
  stage: Stage; createdAt: Date; sequence: number;
};

function harness() {
  const registrations: any[] = ["registration-a", "registration-b"].map((id, i) => ({
    id, churchId: scope.churchId, eventId: scope.eventId, checkoutEmail: i ? "second@example.invalid" : "specific@example.invalid",
    status: "CONFIRMED", paymentStatus: "PAID", waitlistedAt: null, confirmationEmailSentAt: null,
    checkInToken: "check-in-" + id, person: null, visitor: { ...shared },
    event: { id: scope.eventId, churchId: scope.churchId, title: "Evento", date: new Date("2026-10-14T12:00:00Z"),
      isPaid: true, slug: "event", publicSlug: "public-event", church: { slug: "church" } }
  }));
  const events: DeliveryRow[] = [];
  const calls: any[] = [], queries: any[] = [], writes: any[] = [], trace: string[] = [];
  let sequence = 0, claimConflicts = 0, tail = Promise.resolve();
  let response: boolean | Error | Promise<boolean> = true, failAccept = false, failUncertain = false;
  let beforeLock: (() => void) | undefined;
  const database = { async $transaction(action: (tx: any) => Promise<unknown>, options: any) {
    assert.equal(options.isolationLevel, "Serializable");
    assert.equal(options.timeout, 5000);
    assert.notEqual(options.timeout, 30000);
    const previous = tail; let release!: () => void; tail = new Promise(resolve => { release = resolve; });
    await previous;
    const markers = registrations.map(row => row.confirmationEmailSentAt);
    const staged: DeliveryRow[] = [];
    let locked: any;
    try {
      const tx = {
        async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
          const sql = strings.join("?"); queries.push({ sql, values });
          if (sql.includes("pg_advisory_xact_lock")) {
            assert.match(sql, /::text/); assert.equal(values.length, 1);
            assert.match(String(values[0]), /^registration-confirmation:[^:]+:[^:]+:[^:]+$/);
            trace.push("advisory"); return [{ pg_advisory_xact_lock: "" }];
          }
          if (sql.includes("to_jsonb")) {
            beforeLock?.(); beforeLock = undefined; trace.push("lock");
            assert.ok(sql.includes("to_jsonb(r)->>'checkoutEmail'")); assert.match(sql, /FOR UPDATE/);
            assert.ok(sql.includes('"churchId" = ?')); assert.ok(sql.includes('"eventId" = ?'));
            assert.equal(values.length, 3);
            locked = registrations.find(row => row.id === values[0] && row.churchId === values[1] && row.eventId === values[2]);
            return locked ? [{ id: locked.id, checkoutEmail: locked.checkoutEmail ?? null }] : [];
          }
          if (sql.includes('"confirmationEmailSentAt"')) {
            trace.push("marker-lock"); assert.match(sql, /FOR UPDATE/); assert.equal(values.length, 3);
            locked = registrations.find(row => row.id === values[0] && row.churchId === values[1] && row.eventId === values[2]);
            return locked ? [{ id: locked.id, confirmationEmailSentAt: locked.confirmationEmailSentAt }] : [];
          }
          if (sql.includes("EventRegistrationConfirmationDeliveryEvent")) {
            trace.push("history"); assert.equal(values.length, 3);
            return [...events, ...staged].filter(row => row.churchId === values[0] && row.eventId === values[1] && row.registrationId === values[2])
              .sort((a, b) => a.sequence - b.sequence);
          }
          throw new Error("UNEXPECTED_QUERY");
        },
        async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
          const sql = strings.join("?");
          assert.match(sql, /INSERT INTO "EventRegistrationConfirmationDeliveryEvent"/);
          assert.match(sql, /"id", "churchId", "eventId", "registrationId", "stage", "createdAt"/);
          assert.equal(/email|checkInToken|apiKey|body/i.test(sql), false);
          for (const value of values) if (typeof value === "string") {
            assert.equal(value.includes("@"), false); assert.equal(value.includes("check-in-"), false);
          }
          const [id, churchId, eventId, registrationId, stage, createdAt] = values as [string, string, string, string, Stage, Date];
          if (stage === "DELIVERY_ACCEPTED" && failAccept) throw new Error("COMMIT_FAILURE");
          if (stage === "DELIVERY_UNCERTAIN" && failUncertain) throw new Error("COMMIT_FAILURE");
          const prior = [...events, ...staged].filter(row => row.churchId === churchId && row.eventId === eventId && row.registrationId === registrationId)
            .sort((a, b) => a.sequence - b.sequence);
          const last = prior.at(-1);
          if (prior.some(row => row.stage === stage)) throw new Error("DUPLICATE_STAGE");
          if (!last && stage !== "DELIVERY_INTENT") throw new Error("INTENT_REQUIRED");
          if (last && (last.stage !== "DELIVERY_INTENT" || (stage !== "DELIVERY_ACCEPTED" && stage !== "DELIVERY_UNCERTAIN"))) throw new Error("TRANSITION_INVALID");
          if (last && createdAt < last.createdAt) throw new Error("ORDER_INVALID");
          staged.push({ id, churchId, eventId, registrationId, stage, createdAt, sequence: ++sequence });
          trace.push("insert:" + stage);
        },
        registration: {
          async findFirst({ where }: any) {
            assert.equal(trace.at(-1), "lock");
            return registrations.find(row => row.id === where.id && row.churchId === where.churchId && row.eventId === where.eventId) ?? null;
          },
          async update({ where, data }: any) {
            assert.ok(locked); assert.equal(locked.confirmationEmailSentAt, null);
            assert.deepEqual(where, { id: locked.id, churchId: locked.churchId, eventId: locked.eventId });
            assert.deepEqual(Object.keys(data), ["confirmationEmailSentAt"]); assert.ok(data.confirmationEmailSentAt instanceof Date);
            trace.push("marker"); writes.push({ where, data }); locked.confirmationEmailSentAt = data.confirmationEmailSentAt;
          }
        }
      };
      const result = await action(tx);
      if (claimConflicts > 0 && staged.some(row => row.stage === "DELIVERY_INTENT")) {
        claimConflicts--; throw Object.assign(new Error("could not serialize access"), { code: "P2034" });
      }
      events.push(...staged); trace.push("commit"); return result;
    } catch (error) {
      registrations.forEach((row, index) => { row.confirmationEmailSentAt = markers[index]; });
      trace.push("rollback"); throw error;
    } finally { release(); }
  } } as unknown as PrismaClient;
  const send = async (input: any, ...extra: unknown[]) => {
    assert.equal(extra.length, 0);
    assert.equal(input.registrationStatus, "CONFIRMED"); assert.equal(input.paymentStatus, "PAID");
    assert.deepEqual(events.filter(row => row.registrationId === input.registrationId).map(row => row.stage), ["DELIVERY_INTENT"]);
    assert.equal(registrations.find(row => row.id === input.registrationId).confirmationEmailSentAt, null);
    trace.push("send"); calls.push(structuredClone(input));
    if (response instanceof Error) throw response; return await response;
  };
  return { database, registrations, events, calls, queries, writes, trace, send,
    deliver: (input = { registrationId: scope.registrationId, eventId: scope.eventId }, churchId = scope.churchId, options?: { deliveryTimeoutMs?: number }) =>
      options ? deliver(database, churchId, input, send, options) : deliver(database, churchId, input, send),
    response: (value: boolean | Error | Promise<boolean>) => { response = value; },
    failAccept: () => { failAccept = true; }, failUncertain: () => { failUncertain = true; },
    conflictOnce: () => { claimConflicts = 1; }, beforeLock: (action: () => void) => { beforeLock = action; }
  };
}

const successTrace = ["advisory", "lock", "history", "insert:DELIVERY_INTENT", "commit", "send", "advisory", "marker-lock", "history", "insert:DELIVERY_ACCEPTED", "marker", "commit"];

test("local recipient overrides shared Visitor and Person without mutating contacts or other registrations", async () => {
  for (const person of [false, true]) {
    const h = harness(), row = h.registrations[0]!; if (person) { row.person = row.visitor; row.visitor = null; }
    const before = structuredClone(h.registrations);
    assert.equal(await h.deliver(), true); assert.equal(h.calls[0].recipientEmail, row.checkoutEmail);
    assert.equal(h.calls[0].participantName, shared.name); assert.equal(h.calls[0].checkInToken, row.checkInToken);
    assert.deepEqual(h.registrations, [{ ...before[0], confirmationEmailSentAt: row.confirmationEmailSentAt }, before[1]]);
    assert.deepEqual(h.events.map(event => event.stage), ["DELIVERY_INTENT", "DELIVERY_ACCEPTED"]);
    assert.deepEqual(h.trace, successTrace);
    assert.ok(h.queries.some(query => query.sql.includes("pg_advisory_xact_lock") && query.sql.includes("::text") &&
      query.values[0] === "registration-confirmation:church-a:event-a:registration-a"));
  }
});

test("two registrations with one contact deliver independently to their own recipient and credential", async () => {
  const h = harness(); await h.deliver(); await h.deliver({ registrationId: "registration-b", eventId: scope.eventId });
  assert.deepEqual(h.calls.map(call => [call.registrationId, call.recipientEmail, call.checkInToken]), [
    ["registration-a", "specific@example.invalid", "check-in-registration-a"],
    ["registration-b", "second@example.invalid", "check-in-registration-b"]]);
  assert.deepEqual(h.events.map(event => [event.registrationId, event.stage]), [
    ["registration-a", "DELIVERY_INTENT"], ["registration-a", "DELIVERY_ACCEPTED"],
    ["registration-b", "DELIVERY_INTENT"], ["registration-b", "DELIVERY_ACCEPTED"]]);
});

test("local recipient works when the shared contact has no email", async () => {
  const h = harness(); h.registrations[0].visitor.email = null;
  assert.equal(await h.deliver(), true); assert.equal(h.calls[0].recipientEmail, "specific@example.invalid");
});

test("absent column, null and blank local destinations retain scoped legacy fallback", async () => {
  for (const value of [undefined, null, "  "]) {
    const h = harness(); h.registrations[0].checkoutEmail = value;
    assert.equal(await h.deliver(), true); assert.equal(h.calls[0].recipientEmail, shared.email);
  }
});

test("invalid nonblank local destination fails closed without contact fallback", async () => {
  for (const value of ["invalid", "victim@example.invalid\r\nBcc:other@example.invalid", "x".repeat(255) + "@example.invalid"]) {
    const h = harness(); h.registrations[0].checkoutEmail = value;
    assert.equal(await h.deliver(), false); assert.equal(h.calls.length, 0); assert.equal(h.writes.length, 0); assert.equal(h.events.length, 0);
  }
});

test("PENDING, cancelled, waitlisted and NOT_REQUIRED remain ineligible", async () => {
  for (const change of [{ paymentStatus: "PENDING" }, { paymentStatus: "CANCELLED" }, { paymentStatus: "NOT_REQUIRED" },
    { status: "PENDING" }, { status: "CANCELLED" }, { status: "CHECKED_IN" }, { waitlistedAt: new Date() }]) {
    const h = harness(); Object.assign(h.registrations[0], change);
    assert.equal(await h.deliver(), false); assert.equal(h.calls.length, 0); assert.equal(h.writes.length, 0); assert.equal(h.events.length, 0);
  }
});

test("existing marker is preserved and repeated delivery never calls provider", async () => {
  const h = harness(), marker = new Date("2026-10-13T10:00:00Z"); h.registrations[0].confirmationEmailSentAt = marker;
  assert.equal(await h.deliver(), false); assert.equal(h.calls.length, 0); assert.equal(h.events.length, 0);
  assert.equal(h.registrations[0].confirmationEmailSentAt, marker);
});

test("wrong tenant or event and cross-tenant relationships cannot deliver", async () => {
  for (const change of ["church", "event", "person", "visitor", "eventChurch", "eventId"]) {
    const h = harness(), row = h.registrations[0];
    if (change === "church") assert.equal(await h.deliver(undefined, "church-other"), false);
    else if (change === "event") assert.equal(await h.deliver({ registrationId: row.id, eventId: "event-other" }), false);
    else { if (change === "person") row.person = { ...shared, churchId: "church-other" };
      if (change === "visitor") row.visitor.churchId = "church-other";
      if (change === "eventChurch") row.event.churchId = "church-other";
      if (change === "eventId") row.event.id = "event-other";
      assert.equal(await h.deliver(), false);
    }
    assert.equal(h.calls.length, 0); assert.equal(h.writes.length, 0); assert.equal(h.events.length, 0);
  }
});

test("INTENT is committed and visible before send, and the marker exists only with ACCEPTED", async () => {
  const h = harness();
  assert.equal(await h.deliver(), true);
  assert.ok(h.trace.indexOf("commit") < h.trace.indexOf("send"));
  assert.ok(h.trace.indexOf("send") < h.trace.indexOf("marker"));
  assert.ok(h.registrations[0].confirmationEmailSentAt instanceof Date);
  assert.deepEqual(h.events.map(event => event.stage), ["DELIVERY_INTENT", "DELIVERY_ACCEPTED"]);
  assert.equal(h.writes.length, 1);
});

test("concurrent attempts serialize and only one delivers and marks", async () => {
  const h = harness(); const results = await Promise.all(Array.from({ length: 20 }, () => h.deliver()));
  assert.equal(results.filter(Boolean).length, 1); assert.equal(h.calls.length, 1); assert.equal(h.writes.length, 1);
  assert.deepEqual(h.events.map(event => event.stage), ["DELIVERY_INTENT", "DELIVERY_ACCEPTED"]);
  const marker = h.registrations[0].confirmationEmailSentAt;
  assert.equal(await h.deliver(), false); assert.equal(h.registrations[0].confirmationEmailSentAt, marker); assert.equal(h.calls.length, 1);
});

test("timeout, false and throw become UNCERTAIN without a second POST or a late ACCEPTED", async () => {
  const h = harness(); let resolveLate!: (value: boolean) => void;
  h.response(new Promise<boolean>(resolve => { resolveLate = resolve; }));
  assert.equal(await h.deliver(undefined, scope.churchId, { deliveryTimeoutMs: 20 }), false);
  assert.equal(h.calls.length, 1); assert.equal(h.registrations[0].confirmationEmailSentAt, null);
  assert.deepEqual(h.events.map(event => event.stage), ["DELIVERY_INTENT", "DELIVERY_UNCERTAIN"]);
  resolveLate(true); await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(h.events.map(event => event.stage), ["DELIVERY_INTENT", "DELIVERY_UNCERTAIN"]);
  assert.equal(await h.deliver(), false); assert.equal(h.calls.length, 1);
  for (const failure of [false, new Error("MOCK_PROVIDER_FAILURE")] as const) {
    const next = harness(); next.response(failure);
    assert.equal(await next.deliver(), false);
    assert.equal(next.calls.length, 1); assert.equal(next.writes.length, 0); assert.equal(next.registrations[0].confirmationEmailSentAt, null);
    assert.deepEqual(next.events.map(event => event.stage), ["DELIVERY_INTENT", "DELIVERY_UNCERTAIN"]);
    assert.equal(await next.deliver(), false); assert.equal(next.calls.length, 1);
  }
});

test("failed ACCEPTED commit does not resend and leaves INTENT or UNCERTAIN without a marker", async () => {
  const h = harness(); h.failAccept();
  assert.equal(await h.deliver(), false); assert.equal(h.calls.length, 1); assert.equal(h.writes.length, 0);
  assert.equal(h.registrations[0].confirmationEmailSentAt, null);
  assert.deepEqual(h.events.map(event => event.stage), ["DELIVERY_INTENT", "DELIVERY_UNCERTAIN"]);
  assert.equal(await h.deliver(), false); assert.equal(h.calls.length, 1);
  const stuck = harness(); stuck.failAccept(); stuck.failUncertain();
  assert.equal(await stuck.deliver(), false); assert.deepEqual(stuck.events.map(event => event.stage), ["DELIVERY_INTENT"]);
  assert.equal(stuck.registrations[0].confirmationEmailSentAt, null);
  assert.equal(await stuck.deliver(), false); assert.equal(stuck.calls.length, 1);
});

test("a serialization conflict retries only the claim transaction and still sends once", async () => {
  const h = harness(); h.conflictOnce();
  assert.equal(await h.deliver(), true); assert.equal(h.calls.length, 1); assert.equal(h.writes.length, 1);
  assert.ok(h.trace.includes("rollback")); assert.deepEqual(h.events.map(event => event.stage), ["DELIVERY_INTENT", "DELIVERY_ACCEPTED"]);
});

test("delivery deadline is an integer from 1 to 30000", async () => {
  const h = harness();
  for (const deliveryTimeoutMs of [0, 30_001, 1.5, Number.NaN]) {
    await assert.rejects(h.deliver(undefined, scope.churchId, { deliveryTimeoutMs }), /REGISTRATION_CONFIRMATION_DELIVERY_TIMEOUT_INVALID/);
  }
  assert.equal(h.calls.length, 0); assert.equal(h.events.length, 0); assert.equal(h.queries.length, 0);
  assert.equal(await h.deliver(undefined, scope.churchId, { deliveryTimeoutMs: 1 }), true);
});

test("eligibility and destination are reread under lock", async () => {
  const h = harness(); h.beforeLock(() => { h.registrations[0].checkoutEmail = "locked@example.invalid"; });
  assert.equal(await h.deliver(), true); assert.equal(h.calls[0].recipientEmail, "locked@example.invalid");
  const pending = harness(); pending.beforeLock(() => { pending.registrations[0].paymentStatus = "PENDING"; });
  assert.equal(await pending.deliver(), false); assert.equal(pending.calls.length, 0); assert.equal(pending.events.length, 0);
});

test("missing participant or any recipient never marks confirmation", async () => {
  for (const missingParticipant of [true, false]) {
    const h = harness(); if (missingParticipant) h.registrations[0].visitor = null;
    else { h.registrations[0].checkoutEmail = null; h.registrations[0].visitor.email = null; }
    assert.equal(await h.deliver(), false); assert.equal(h.calls.length, 0); assert.equal(h.writes.length, 0); assert.equal(h.events.length, 0);
  }
});

test("all existing confirmation consumers reuse delivery and provider key remains unchanged", async () => {
  const source = await readFile(new URL("../src/event.service.ts", import.meta.url), "utf8");
  const adapter = await readFile(new URL("../src/registration-confirmation-email.service.ts", import.meta.url), "utf8");
  const consumer = await readFile(new URL("../src/registration-confirmation-delivery.service.ts", import.meta.url), "utf8");
  assert.match(source, /import { sendPendingRegistrationConfirmationEmail } from/);
  assert.equal(source.split("await sendPendingRegistrationConfirmationEmail(").length - 1, 5);
  assert.equal(source.includes("deliveryTimeoutMs"), false);
  assert.equal(adapter.includes("AbortSignal"), false);
  assert.ok(adapter.includes("`event-registration/${input.registrationId}`"));
  assert.match(consumer, /options\?: \{ deliveryTimeoutMs\?: number \}/);
  assert.equal(consumer.includes("AbortSignal"), false);
});

test("real confirmation adapter receives local recipient, QR and stable key with fetch fully mocked", async () => {
  const originalFetch = globalThis.fetch, originalKey = process.env.RESEND_API_KEY;
  const requests: { url: string; body: any; key: string | null }[] = [];
  process.env.RESEND_API_KEY = "controlled-isolated-test-key";
  globalThis.fetch = async (input, options) => {
    const url = String(input); assert.equal(url, "https://api.resend.com/emails");
    const headers = new Headers(options?.headers);
    requests.push({ url, body: JSON.parse(String(options?.body)), key: headers.get("idempotency-key") });
    return new Response(JSON.stringify({ id: "simulated-email" }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const h = harness();
    assert.equal(await deliver(h.database, scope.churchId, { registrationId: scope.registrationId, eventId: scope.eventId }), true);
    assert.equal(requests.length, 1); assert.deepEqual(requests[0]!.body.to, ["specific@example.invalid"]);
    assert.equal(requests[0]!.key, "event-registration/registration-a");
    assert.equal(requests[0]!.body.attachments[0].filename, "credencial-evento.png");
    assert.ok(requests[0]!.body.attachments[0].content.length > 0);
    assert.ok(h.registrations[0].confirmationEmailSentAt instanceof Date);
    assert.deepEqual(h.events.map(event => event.stage), ["DELIVERY_INTENT", "DELIVERY_ACCEPTED"]);
    assert.equal(await deliver(h.database, scope.churchId, { registrationId: scope.registrationId, eventId: scope.eventId }), false);
    assert.equal(requests.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = originalKey;
  }
});
