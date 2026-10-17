import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { createCheckoutRecoveryResendReader, createCheckoutRecoveryResendSender } from "../src/checkout-recovery-email.service.ts";
import { generateCheckoutCredential } from "../src/checkout-access.service.ts";

globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_RECOVERY_TEST"); };
test("Resend sends the key only to the verified email with fixed idempotency and secret-free metadata/receipt", async t => {
  const receipt = randomUUID(), calls: any[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    assert.equal(String(url), "https://api.resend.com/emails"); calls.push(init);
    return new Response(JSON.stringify({ id: receipt }), { status: 200 });
  });
  const sender = createCheckoutRecoveryResendSender({ apiKey: "controlled-isolated-test-key", from: "events@example.invalid" });
  const input = { churchId: "church-a", eventId: "event-a", registrationId: "registration-a", accessId: "access-a",
    operationId: randomUUID(), recipientEmail: "verified@example.invalid", credential: generateCheckoutCredential(), expiresAt: new Date(Date.now() + 86400_000) };
  const result = await sender(input, new AbortController().signal), body = JSON.parse(calls[0].body);
  assert.deepEqual(body.to, [input.recipientEmail]); assert.equal(body.cc, undefined); assert.equal(body.bcc, undefined);
  assert.ok(body.text.includes(input.credential)); assert.ok(body.text.includes(input.expiresAt.toISOString()));
  assert.equal(JSON.stringify([body.tags, body.subject, result]).includes(input.credential), false);
  assert.equal(result.receiptReference, `resend_${receipt}`);
  const deliveryId = createHash("sha256").update(JSON.stringify(["checkout-recovery-email-v1", input.churchId, input.eventId,
    input.registrationId, input.accessId, input.operationId])).digest("hex");
  assert.equal(new Headers(calls[0].headers).get("Idempotency-Key"), `event-checkout-recovery/${deliveryId}`);
  await sender({ ...input, churchId: "church-other" }, new AbortController().signal);
  assert.notEqual(new Headers(calls[0].headers).get("Idempotency-Key"), new Headers(calls[1].headers).get("Idempotency-Key"));
});

test("Resend failures, absent receipt, pre-abort and late response never expose provider bodies or credentials", async t => {
  const logs = t.mock.method(console, "error", () => undefined);
  const input = { churchId: "church-a", eventId: "event-a", registrationId: "registration-a", accessId: "access-a",
    operationId: randomUUID(), recipientEmail: "verified@example.invalid", credential: generateCheckoutCredential(), expiresAt: new Date(Date.now() + 86400_000) };
  for (const failure of ["rejected", "no-receipt", "late"]) {
    const controller = new AbortController();
    const mock = t.mock.method(globalThis, "fetch", async () => {
      if (failure === "late") controller.abort();
      return new Response(JSON.stringify(failure === "rejected" ? { message: input.credential } : failure === "no-receipt" ? {} : { id: randomUUID() }),
        { status: failure === "rejected" ? 400 : 200 });
    });
    try {
      const sender = createCheckoutRecoveryResendSender({ apiKey: "controlled-isolated-test-key", from: "events@example.invalid" });
      await assert.rejects(sender(input, controller.signal), error => error instanceof Error && error.message === "CHECKOUT_RECOVERY_DELIVERY_UNCERTAIN" && !("cause" in error));
      controller.abort(); await assert.rejects(sender(input, controller.signal)); assert.equal(mock.mock.callCount(), 1);
    } finally { mock.mock.restore(); }
  }
  assert.equal(logs.mock.callCount(), 0);
});

test("configuration has no fallback sender or real credentials", () => {
  assert.throws(() => createCheckoutRecoveryResendSender({ apiKey: "", from: "events@example.invalid" }), /NOT_CONFIGURED/);
  assert.throws(() => createCheckoutRecoveryResendSender({ apiKey: "test", from: "" }), /NOT_CONFIGURED/);
});


test("Resend reconciliation uses GET only and strips private email bodies from its result", async t => {
  const id = randomUUID(), operationId = randomUUID(), secret = generateCheckoutCredential();
  const mock = t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    assert.equal(String(url), "https://api.resend.com/emails/" + id); assert.equal(init?.method, "GET");
    assert.equal(init?.body, undefined);
    return new Response(JSON.stringify({ id, to: ["verified@example.invalid"], text: secret, html: secret,
      last_event: "bounced", tags: [{ name: "checkout_recovery_operation", value: operationId },
        { name: "checkout_recovery_delivery", value: "a".repeat(64) }] }));
  });
  const reader = createCheckoutRecoveryResendReader({ apiKey: "synthetic-only" });
  const result = await reader("resend_" + id, new AbortController().signal);
  assert.deepEqual(result, { receiptReference: "resend_" + id, operationId, deliveryId: "a".repeat(64), recipientEmail: "verified@example.invalid" });
  assert.equal(JSON.stringify(result).includes(secret), false);
  await assert.rejects(reader("resend_invalid", new AbortController().signal), /DELIVERY_UNCERTAIN/);
  assert.equal(mock.mock.callCount(), 1);
});

test("Resend reader fails closed on errors, missing/duplicate correlation, mismatched id and abort", async t => {
  const id = randomUUID(), operationId = randomUUID();
  const tags = [{ name: "checkout_recovery_operation", value: operationId }, { name: "checkout_recovery_delivery", value: "a".repeat(64) }];
  const logs = t.mock.method(console, "error", () => undefined);
  for (const mode of ["error", "missing", "duplicate", "id", "abort"]) {
    const controller = new AbortController();
    const mock = t.mock.method(globalThis, "fetch", async () => {
      if (mode === "abort") controller.abort();
      return new Response(JSON.stringify({ id: mode === "id" ? randomUUID() : id, to: ["verified@example.invalid"],
        text: "ec2_private-body", tags: mode === "missing" ? [] : mode === "duplicate" ? [...tags, tags[0]] : tags }), { status: mode === "error" ? 500 : 200 });
    });
    try { await assert.rejects(createCheckoutRecoveryResendReader({ apiKey: "synthetic-only" })("resend_" + id, controller.signal),
      error => error instanceof Error && error.message === "CHECKOUT_RECOVERY_DELIVERY_UNCERTAIN" && !("cause" in error)); }
    finally { mock.mock.restore(); }
  }
  assert.equal(logs.mock.callCount(), 0);
});
