import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createAsaasCheckoutChargeProvider } from "../../financial/src/asaas-checkout-charge.provider.ts";
import { createAsaasClient, type AsaasRequestOptions } from "../../financial/src/asaas.client.ts";
import type { CheckoutFirstChargeCommand } from "../src/checkout-charge.service.ts";

const command: CheckoutFirstChargeCommand = { churchId: "church-a", eventId: "event-a", eventPaymentId: "payment-a",
  transactionId: "transaction-a", attemptId: "attempt-a", method: "PIX", amount: 100,
  externalReference: "church-a:payment-a:payment", idempotencyKey: "a".repeat(64),
  customer: { name: "Participante", email: "specific@example.invalid", cpf: "52998224725", phone: "41999990001" } };

test("dormant Asaas adapter sends stable idempotency keys/signal and keeps credit/debit semantics in the guard", async () => {
  for (const method of ["PIX", "CREDIT_CARD", "DEBIT_CARD"] as const) {
    const calls: AsaasRequestOptions[] = [];
    const provider = createAsaasCheckoutChargeProvider({ environment: "sandbox", async request<T>(options: AsaasRequestOptions) {
      calls.push(options);
      return (options.path === "/customers" ? { id: "customer-a" } : { id: "provider-a", externalReference: command.externalReference,
        value: 100, billingType: method === "PIX" ? "PIX" : "CREDIT_CARD", unexpectedSecret: "must-not-escape" }) as T;
    } });
    const controller = new AbortController(), result = await provider.create({ ...command, method }, controller.signal);
    assert.deepEqual(calls.map(c => [c.method, c.path]), [["POST", "/customers"], ["POST", "/payments"]]);
    assert.equal(calls[0]!.idempotencyKey, `${command.idempotencyKey}:customer`); assert.equal(calls[1]!.idempotencyKey, command.idempotencyKey);
    assert.ok(calls.every(c => c.signal === controller.signal));
    assert.equal((calls[1]!.body as any).billingType, method === "PIX" ? "PIX" : "CREDIT_CARD");
    assert.equal((calls[1]!.body as any).value, command.amount); assert.equal((calls[1]!.body as any).externalReference, command.externalReference);
    assert.deepEqual(Object.keys(result).sort(), ["amount", "externalReference", "id", "method"]);
    await provider.read("provider-a", controller.signal);
    assert.equal(calls[2]!.method, "GET"); assert.equal(calls[2]!.path, "/payments/provider-a");
    assert.equal(calls.filter(c => c.method === "POST" && c.path === "/payments").length, 1);
  }
});

test("abort after customer response prevents a later payment POST; pre-abort prevents all requests", async () => {
  const controller = new AbortController(), calls: AsaasRequestOptions[] = [];
  const provider = createAsaasCheckoutChargeProvider({ environment: "sandbox", async request<T>(options: AsaasRequestOptions) {
    calls.push(options); controller.abort(); return { id: "customer-a" } as T;
  } });
  await assert.rejects(provider.create(command, controller.signal));
  assert.equal(calls.length, 1); assert.equal(calls[0]!.path, "/customers");
  await assert.rejects(provider.create(command, controller.signal)); assert.equal(calls.length, 1);
});

test("transport passes AbortSignal/idempotency headers using simulated fetch, with no network or real secrets", async t => {
  const controller = new AbortController();
  const mock = t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit | undefined) => {
    assert.equal(init?.signal, controller.signal);
    assert.equal((init?.headers as Record<string, string>)["Asaas-Idempotency-Key"], command.idempotencyKey);
    return new Response(JSON.stringify({ id: "provider-a" }), { status: 200 });
  });
  const client = createAsaasClient({ apiKey: "isolated-test-key", environment: "sandbox" });
  await client.request({ method: "POST", path: "/payments", body: { value: 100 }, signal: controller.signal, idempotencyKey: command.idempotencyKey });
  assert.equal(mock.mock.callCount(), 1);
});

test("guard and adapter remain absent from both builders, prepared routes and package entrypoints", async () => {
  for (const relative of ["../../../apps/events-api/src/app.ts", "../../../apps/api-br/src/app.ts",
    "../../../apps/events-api/src/checkout-v2.prepared.ts", "../../../apps/api-br/src/checkout-v2.prepared.ts",
    "../src/checkout-v2.routes.ts", "../src/checkout-v2.integration.ts", "../src/index.ts", "../../financial/src/index.ts"]) {
    const source = await readFile(new URL(relative, import.meta.url), "utf8");
    assert.equal(source.includes("checkout-charge.service"), false); assert.equal(source.includes("asaas-checkout-charge.provider"), false);
  }
});
