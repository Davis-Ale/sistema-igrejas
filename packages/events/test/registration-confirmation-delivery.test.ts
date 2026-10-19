import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import { sendPendingRegistrationConfirmationEmail as deliver } from "../src/registration-confirmation-delivery.service.ts";

const scope = { churchId: "church-a", eventId: "event-a", registrationId: "registration-a" };
const shared = { churchId: scope.churchId, name: "Participante", email: "shared@example.invalid" };
function harness() {
  const registrations: any[] = ["registration-a", "registration-b"].map((id, i) => ({
    id, churchId: scope.churchId, eventId: scope.eventId, checkoutEmail: i ? "second@example.invalid" : "specific@example.invalid",
    status: "CONFIRMED", paymentStatus: "PAID", waitlistedAt: null, confirmationEmailSentAt: null,
    checkInToken: "check-in-" + id, person: null, visitor: { ...shared },
    event: { id: scope.eventId, churchId: scope.churchId, title: "Evento", date: new Date("2026-10-14T12:00:00Z"),
      isPaid: true, slug: "event", publicSlug: "public-event", church: { slug: "church" } }
  }));
  const calls: any[] = [], queries: any[] = [], writes: any[] = [], trace: string[] = [];
  let tail = Promise.resolve(), response: boolean | Error = true, commitFailure = false;
  let beforeLock: (() => void) | undefined;
  const database = { async $transaction(action: (tx: any) => Promise<boolean>, options: any) {
    assert.deepEqual(options, { timeout: 30000 });
    const previous = tail; let release!: () => void; tail = new Promise(resolve => { release = resolve; });
    await previous;
    const markers = registrations.map(r => r.confirmationEmailSentAt);
    let locked: any;
    try {
      const tx = {
        async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
          beforeLock?.(); beforeLock = undefined;
          const sql = strings.join("?"); queries.push({ sql, values }); trace.push("lock");
          assert.ok(sql.includes("to_jsonb(r)->>'checkoutEmail'")); assert.match(sql, /FOR UPDATE/);
          assert.ok(sql.includes('"churchId" = ?')); assert.ok(sql.includes('"eventId" = ?'));
          assert.equal(values.length, 3);
          locked = registrations.find(r => r.id === values[0] && r.churchId === values[1] && r.eventId === values[2]);
          return locked ? [{ id: locked.id, checkoutEmail: locked.checkoutEmail ?? null }] : [];
        },
        registration: {
          async findFirst({ where }: any) {
            assert.ok(trace.at(-1) === "lock");
            return registrations.find(r => r.id === where.id && r.churchId === where.churchId && r.eventId === where.eventId) ?? null;
          },
          async update({ where, data }: any) {
            assert.ok(locked); assert.deepEqual(where, { id: locked.id, churchId: scope.churchId, eventId: scope.eventId });
            assert.deepEqual(Object.keys(data), ["confirmationEmailSentAt"]); assert.ok(data.confirmationEmailSentAt instanceof Date);
            trace.push("marker"); writes.push({ where, data }); locked.confirmationEmailSentAt = data.confirmationEmailSentAt;
          }
        }
      };
      const result = await action(tx);
      if (commitFailure) { commitFailure = false; throw new Error("COMMIT_FAILURE"); }
      trace.push("commit"); return result;
    } catch (error) {
      registrations.forEach((r, i) => { r.confirmationEmailSentAt = markers[i]; }); trace.push("rollback"); throw error;
    } finally { release(); }
  } } as unknown as PrismaClient;
  const send = async (input: any) => {
    assert.equal(input.registrationStatus, "CONFIRMED"); assert.equal(input.paymentStatus, "PAID");
    trace.push("send"); calls.push(structuredClone(input)); if (response instanceof Error) throw response; return response;
  };
  return { database, registrations, calls, queries, writes, trace, send,
    deliver: (input = { registrationId: scope.registrationId, eventId: scope.eventId }, churchId = scope.churchId) => deliver(database, churchId, input, send),
    response: (value: boolean | Error) => { response = value; }, failCommit: () => { commitFailure = true; },
    beforeLock: (action: () => void) => { beforeLock = action; }
  };
}

test("local recipient overrides shared Visitor and Person without mutating contacts or other registrations", async () => {
  for (const person of [false, true]) {
    const h = harness(), r = h.registrations[0]!; if (person) { r.person = r.visitor; r.visitor = null; }
    const before = structuredClone(h.registrations);
    assert.equal(await h.deliver(), true); assert.equal(h.calls[0].recipientEmail, r.checkoutEmail);
    assert.equal(h.calls[0].participantName, shared.name); assert.equal(h.calls[0].checkInToken, r.checkInToken);
    assert.deepEqual(h.registrations, [{ ...before[0], confirmationEmailSentAt: r.confirmationEmailSentAt }, before[1]]);
    assert.deepEqual(h.trace, ["lock", "send", "marker", "commit"]);
  }
});

test("two registrations with one contact deliver independently to their own recipient and credential", async () => {
  const h = harness(); await h.deliver(); await h.deliver({ registrationId: "registration-b", eventId: scope.eventId });
  assert.deepEqual(h.calls.map(c => [c.registrationId, c.recipientEmail, c.checkInToken]), [
    ["registration-a", "specific@example.invalid", "check-in-registration-a"],
    ["registration-b", "second@example.invalid", "check-in-registration-b"]]);
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
    assert.equal(await h.deliver(), false); assert.equal(h.calls.length, 0); assert.equal(h.writes.length, 0);
  }
});

test("PENDING, cancelled, waitlisted and NOT_REQUIRED remain ineligible", async () => {
  for (const change of [{ paymentStatus: "PENDING" }, { paymentStatus: "CANCELLED" }, { paymentStatus: "NOT_REQUIRED" },
    { status: "PENDING" }, { status: "CANCELLED" }, { status: "CHECKED_IN" }, { waitlistedAt: new Date() }]) {
    const h = harness(); Object.assign(h.registrations[0], change);
    assert.equal(await h.deliver(), false); assert.equal(h.calls.length, 0); assert.equal(h.writes.length, 0);
  }
});

test("existing marker is preserved and repeated delivery never calls provider", async () => {
  const h = harness(), marker = new Date("2026-10-13T10:00:00Z"); h.registrations[0].confirmationEmailSentAt = marker;
  assert.equal(await h.deliver(), false); assert.equal(h.calls.length, 0); assert.equal(h.registrations[0].confirmationEmailSentAt, marker);
});

test("wrong tenant or event and cross-tenant relationships cannot deliver", async () => {
  for (const change of ["church", "event", "person", "visitor", "eventChurch", "eventId"]) {
    const h = harness(), r = h.registrations[0];
    if (change === "church") assert.equal(await h.deliver(undefined, "church-other"), false);
    else if (change === "event") assert.equal(await h.deliver({ registrationId: r.id, eventId: "event-other" }), false);
    else { if (change === "person") r.person = { ...shared, churchId: "church-other" };
      if (change === "visitor") r.visitor.churchId = "church-other";
      if (change === "eventChurch") r.event.churchId = "church-other";
      if (change === "eventId") r.event.id = "event-other";
      assert.equal(await h.deliver(), false);
    }
    assert.equal(h.calls.length, 0); assert.equal(h.writes.length, 0);
  }
});

test("concurrent attempts serialize and only one delivers and marks", async () => {
  const h = harness(); const results = await Promise.all(Array.from({ length: 20 }, () => h.deliver()));
  assert.equal(results.filter(Boolean).length, 1); assert.equal(h.calls.length, 1); assert.equal(h.writes.length, 1);
  const marker = h.registrations[0].confirmationEmailSentAt;
  assert.equal(await h.deliver(), false); assert.equal(h.registrations[0].confirmationEmailSentAt, marker);
});

test("provider rejection or exception does not mark; explicit retry uses same recipient and registration", async () => {
  for (const failure of [false, new Error("MOCK_PROVIDER_FAILURE")]) {
    const h = harness(); h.response(failure);
    if (failure instanceof Error) await assert.rejects(h.deliver(), /MOCK_PROVIDER_FAILURE/);
    else assert.equal(await h.deliver(), false);
    assert.equal(h.registrations[0].confirmationEmailSentAt, null); assert.equal(h.writes.length, 0);
    h.response(true); assert.equal(await h.deliver(), true); assert.deepEqual(h.calls[0], h.calls[1]);
  }
});

test("failed marker commit keeps retry payload stable for existing provider idempotency", async () => {
  const h = harness(); h.failCommit(); await assert.rejects(h.deliver(), /COMMIT_FAILURE/);
  assert.equal(h.registrations[0].confirmationEmailSentAt, null);
  assert.equal(await h.deliver(), true); assert.deepEqual(h.calls[0], h.calls[1]);
});

test("eligibility and destination are reread under lock", async () => {
  const h = harness(); h.beforeLock(() => { h.registrations[0].checkoutEmail = "locked@example.invalid"; });
  assert.equal(await h.deliver(), true); assert.equal(h.calls[0].recipientEmail, "locked@example.invalid");
  const pending = harness(); pending.beforeLock(() => { pending.registrations[0].paymentStatus = "PENDING"; });
  assert.equal(await pending.deliver(), false); assert.equal(pending.calls.length, 0);
});

test("missing participant or any recipient never marks confirmation", async () => {
  for (const missingParticipant of [true, false]) {
    const h = harness(); if (missingParticipant) h.registrations[0].visitor = null;
    else { h.registrations[0].checkoutEmail = null; h.registrations[0].visitor.email = null; }
    assert.equal(await h.deliver(), false); assert.equal(h.calls.length, 0); assert.equal(h.writes.length, 0);
  }
});

test("all existing confirmation consumers reuse delivery and provider key remains unchanged", async () => {
  const source = await readFile(new URL("../src/event.service.ts", import.meta.url), "utf8");
  assert.match(source, /import { sendPendingRegistrationConfirmationEmail } from/);
  // The guarded webhook confirmation helper is an additional shared consumer.
  assert.equal(source.split("await sendPendingRegistrationConfirmationEmail(").length - 1, 5);
  const adapter = await readFile(new URL("../src/registration-confirmation-email.service.ts", import.meta.url), "utf8");
  assert.ok(adapter.includes("event-registration/")); assert.ok(adapter.includes("input.registrationId"));
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
    assert.equal(await deliver(h.database, scope.churchId, { registrationId: scope.registrationId, eventId: scope.eventId }), false);
    assert.equal(requests.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = originalKey;
  }
});
