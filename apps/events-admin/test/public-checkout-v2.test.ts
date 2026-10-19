import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPublicCheckoutV2Client, CheckoutV2Error, type CheckoutRegistrationInput } from "../app/eventos/_components/public-checkout-v2.client.js";
import { createPublicRegistrationV2Schema, publicCheckoutStatusV2Schema, publicCheckoutResumeV2Schema, checkoutCredentialSchema } from "../../../packages/events/src/checkout-access.schema.js";

globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_FRONTEND_TEST"); };
const target = { eventId: "event-a", churchSlug: "church-a", eventSlug: "event-slug" };
const epoch = Date.parse("2026-10-17T12:00:00Z"), ttl = 86400_000;
const body = (): CheckoutRegistrationInput => ({ name: "Participante", phone: "(41) 99999-0001", email: " Person@Example.invalid ",
  cpf: "529.982.247-25", paymentMethod: "PIX", ticketId: "ticket-a", ticketBatchId: "batch-a", answers: [] });
const registration = (patch: Record<string, unknown> = {}) => ({ id: "registration-a", status: "PENDING", paymentStatus: "PENDING",
  waitlistedAt: null, checkInToken: null, event: { id: target.eventId, slug: target.eventSlug, title: "Synthetic event", date: "2026-12-01T12:00:00Z",
    publicSlug: "public-slug", isPaid: true, church: { slug: target.churchSlug, name: "Synthetic church" } }, ...patch });
const pix = { method: "PIX", pix: { encodedImage: "image", payload: "synthetic-pix", expirationDate: "2026-10-18T12:00:00Z" } };
function harness() {
  let now = epoch;
  const saved = new Map<string, string>(), calls: Array<{ url: string; init: RequestInit }> = [];
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); }, removeItem: (key: string) => { saved.delete(key); } };
  let send = async (url: string, init: RequestInit): Promise<Response> => new Response(JSON.stringify(registration(url.endsWith("/register") ? { expiresAt: new Date(epoch + ttl).toISOString() } : url.endsWith("/resume") ? { paymentCheckout: pix } : {})));
  const options = { target, apiBaseUrl: "https://api.example.invalid", storage, clock: () => now, timeoutMs: 1000,
    fetch: (async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init! }); return send(String(url), init!); }) as typeof fetch };
  const client = createPublicCheckoutV2Client(options);
  return { client, options, calls, saved, storage, advance(ms: number) { now += ms; }, onFetch(fn: typeof send) { send = fn; } };
}

test("register uses canonical Web Crypto key in header only, matching the real v2 contract", async () => {
  const h = harness();
  try {
    const result = await h.client.register({ ...body(), checkoutToken: "legacy", amount: 1, credential: "forged" } as any);
    const { url, init } = h.calls[0]!, key = new Headers(init.headers).get("x-event-checkout-key")!;
    assert.ok(checkoutCredentialSchema.safeParse(key).success); assert.equal(url.endsWith("/register"), true);
    assert.equal(JSON.stringify([url, init.body, result, h.client.getSnapshot()]).includes(key), false);
    const sent = JSON.parse(String(init.body)); createPublicRegistrationV2Schema.parse(sent);
    assert.equal(sent.email, "person@example.invalid"); assert.equal(sent.phone, "41999990001");
    assert.equal(sent.cpf, "52998224725"); assert.equal(sent.checkoutToken, undefined); assert.equal(sent.amount, undefined);
    assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "error"); assert.equal(init.credentials, "omit"); assert.equal(init.referrerPolicy, "no-referrer");
    const persisted = [...h.saved.values()][0]!;
    for (const value of ["52998224725", "person@example.invalid", "Participante", "paymentCheckout", "synthetic-pix"]) assert.equal(persisted.includes(value), false);
  } finally { h.client.dispose(); }
});

test("PIX, credit and debit survive register/resume without method overrides or automatic payment creation", async () => {
  for (const method of ["PIX", "CREDIT_CARD", "DEBIT_CARD"] as const) {
    const h = harness();
    h.onFetch(async url => new Response(JSON.stringify(registration(url.endsWith("/register") ? { expiresAt: new Date(epoch + ttl).toISOString() } :
      { paymentCheckout: method === "PIX" ? pix : { method, redirectUrl: "https://payments.example.invalid/invoice" } }))));
    try {
      await h.client.register({ ...body(), paymentMethod: method }); assert.equal(h.calls.length, 1);
      const result = await h.client.resume({ cpf: body().cpf, paymentMethod: "forged", knownProviderId: "forged" } as any);
      assert.equal(result.paymentCheckout?.method, method);
      publicCheckoutResumeV2Schema.parse(JSON.parse(String(h.calls[1]!.init.body)));
      assert.deepEqual(JSON.parse(String(h.calls[1]!.init.body)), { cpf: "52998224725" });
      assert.equal(new Headers(h.calls[1]!.init.headers).get("x-event-checkout-key"), new Headers(h.calls[0]!.init.headers).get("x-event-checkout-key"));
    } finally { h.client.dispose(); }
  }
});

test("reload restores only the same scoped key, status sends {}, and never auto-registers or resumes", async () => {
  const h = harness(); let restored: ReturnType<typeof createPublicCheckoutV2Client> | undefined;
  try {
    await h.client.register(body()); await h.client.resume(); h.client.dispose(); h.advance(3600_000);
    restored = createPublicCheckoutV2Client(h.options); assert.equal(restored.getSnapshot().registration, null);
    await restored.status(); assert.deepEqual(JSON.parse(String(h.calls.at(-1)!.init.body)), {});
    publicCheckoutStatusV2Schema.parse(JSON.parse(String(h.calls.at(-1)!.init.body)));
    assert.equal(h.calls.filter(c => c.url.endsWith("/resume")).length, 1); assert.equal(h.calls.filter(c => c.url.endsWith("/register")).length, 1);
    assert.equal(restored.getSnapshot().registration?.paymentCheckout, undefined); assert.equal(Date.parse(restored.getSnapshot().expiresAt!), epoch + ttl);
    await assert.rejects(restored.register(body()), /Os dados desta tentativa/);
    const other = createPublicCheckoutV2Client({ ...h.options, target: { ...target, churchSlug: "other-church" } });
    assert.equal(other.getSnapshot().hasSession, false); other.dispose();
  } finally { restored?.dispose(); h.client.dispose(); }
});

test("concurrent equivalent register clicks share a key/request and changed payload is blocked", async () => {
  const h = harness(); let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  h.onFetch(async () => { await hold; return new Response(JSON.stringify(registration({ expiresAt: new Date(epoch + ttl).toISOString() }))); });
  try {
    const a = h.client.register(body()), b = h.client.register(body());
    await assert.rejects(h.client.register({ ...body(), paymentMethod: "DEBIT_CARD" }), /Os dados desta tentativa/);
    release(); assert.deepEqual(await a, await b); assert.equal(h.calls.length, 1);
  } finally { release?.(); h.client.dispose(); }
});

test("lost registration response retains immutable payload/key for explicit retry without renewal", async () => {
  const h = harness(); let lost = true;
  h.onFetch(async () => { if (lost) throw new Error("synthetic sensitive network body");
    return new Response(JSON.stringify(registration({ expiresAt: new Date(epoch + ttl).toISOString() }))); });
  try {
    await assert.rejects(h.client.register(body()), error => error instanceof CheckoutV2Error && error.code === "REGISTRATION_UNCERTAIN");
    assert.equal(h.client.getSnapshot().phase, "REGISTRATION_UNCERTAIN");
    await assert.rejects(h.client.register({ ...body(), email: "changed@example.invalid" }), /Os dados desta tentativa/);
    lost = false; h.advance(1000); await h.client.register(body());
    assert.equal(h.calls.length, 2); assert.equal(h.calls[0]!.init.body, h.calls[1]!.init.body);
    assert.deepEqual(h.calls[0]!.init.headers, h.calls[1]!.init.headers);
    assert.equal(Date.parse(h.client.getSnapshot().expiresAt!), epoch + ttl);
  } finally { h.client.dispose(); }
});

test("absolute expiry and denied/revoked access clear checkout and persist a non-secret block across reload", async () => {
  for (const reason of ["expiry", "denied"] as const) {
    const h = harness(); let restored: ReturnType<typeof createPublicCheckoutV2Client> | undefined;
    try {
      await h.client.register(body()); await h.client.resume();
      const key = new Headers(h.calls[0]!.init.headers).get("x-event-checkout-key")!;
      if (reason === "expiry") { h.advance(ttl); await assert.rejects(h.client.status(), /expirou/); }
      else { h.onFetch(async () => new Response("not-json private body", { status: 403 })); await assert.rejects(h.client.status(), /revogado/); }
      assert.equal(h.client.getSnapshot().registration, null); assert.equal([...h.saved.values()].some(v => v.includes(key)), false);
      const calls = h.calls.length; await assert.rejects(h.client.register(body())); await assert.rejects(h.client.resume());
      h.client.dispose(); restored = createPublicCheckoutV2Client(h.options); await assert.rejects(restored.register(body()));
      assert.equal(h.calls.length, calls);
    } finally { restored?.dispose(); h.client.dispose(); }
  }
});

test("reconciliation blocks resume across reload; status cannot clear a pending uncertain payment", async () => {
  const h = harness(); let restored: ReturnType<typeof createPublicCheckoutV2Client> | undefined;
  try {
    await h.client.register(body());
    h.onFetch(async url => new Response(JSON.stringify(url.endsWith("/resume") ? { error: "CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED", message: "ec2_private-body" } : registration()), { status: url.endsWith("/resume") ? 409 : 200 }));
    await assert.rejects(h.client.resume(), error => error instanceof CheckoutV2Error && error.code === "RECONCILIATION_REQUIRED" && !error.message.includes("ec2_"));
    await h.client.status(); assert.equal(h.client.getSnapshot().phase, "RECONCILIATION_REQUIRED"); h.client.dispose();
    restored = createPublicCheckoutV2Client(h.options); const calls = h.calls.length; await assert.rejects(restored.resume()); assert.equal(h.calls.length, calls);
    h.onFetch(async () => new Response(JSON.stringify(registration({ status: "CONFIRMED", paymentStatus: "PAID", checkInToken: "participant-token" }))));
    await restored.status(); assert.equal(restored.getSnapshot().phase, "READY"); assert.equal(restored.getSnapshot().registration?.checkInToken, "participant-token");
  } finally { restored?.dispose(); h.client.dispose(); }
});

test("provider failures never leak messages or permit automatic reconciliation POSTs", async () => {
  const h = harness();
  try {
    await h.client.register(body()); h.onFetch(async () => { throw new Error("private cpf token provider response"); });
    await assert.rejects(h.client.resume(), error => error instanceof CheckoutV2Error && error.code === "RECONCILIATION_REQUIRED" && !error.message.includes("provider"));
    assert.equal(h.client.getSnapshot().phase, "RECONCILIATION_REQUIRED");
    const n = h.calls.length; await assert.rejects(h.client.resume()); assert.equal(h.calls.length, n);
    assert.equal(h.calls.some(c => c.url.endsWith("/reconcile")), false);
  } finally { h.client.dispose(); }
});

test("timeout bounds transports ignoring AbortSignal and suppresses late responses", async () => {
  const h = harness(); let late!: (response: Response) => void;
  const client = createPublicCheckoutV2Client({ ...h.options, timeoutMs: 15 });
  h.onFetch(async () => new Promise(resolve => { late = resolve; }));
  try {
    await assert.rejects(client.register(body()), /Não foi possível confirmar/);
    late(new Response(JSON.stringify(registration({ expiresAt: new Date(epoch + ttl).toISOString() }))));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(client.getSnapshot().registration, null); assert.equal(client.getSnapshot().phase, "REGISTRATION_UNCERTAIN");
  } finally { client.dispose(); h.client.dispose(); }
});

test("an uncertain resume timeout blocks further payment attempts across reload", async () => {
  const h = harness();
  const client = createPublicCheckoutV2Client({ ...h.options, timeoutMs: 15 });
  let restored: ReturnType<typeof createPublicCheckoutV2Client> | undefined;
  let late!: (response: Response) => void;
  try {
    await client.register(body());
    h.onFetch(async () => new Promise(resolve => { late = resolve; }));
    await assert.rejects(client.resume(), error => error instanceof CheckoutV2Error && error.code === "RECONCILIATION_REQUIRED");
    late(new Response(JSON.stringify(registration({ paymentCheckout: pix }))));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(client.getSnapshot().registration?.paymentCheckout, undefined);
    assert.equal(client.getSnapshot().phase, "RECONCILIATION_REQUIRED");
    const calls = h.calls.length;
    await assert.rejects(client.resume());
    client.dispose();
    restored = createPublicCheckoutV2Client(h.options);
    await assert.rejects(restored.resume());
    assert.equal(h.calls.length, calls);
  } finally { restored?.dispose(); client.dispose(); h.client.dispose(); }
});

test("storage failure or corrupt sessions fail before transport without legacy fallback", async () => {
  for (const corrupt of [false, true]) {
    const h = harness();
    if (corrupt) await h.client.register(body()); h.client.dispose();
    if (corrupt) for (const key of h.saved.keys()) h.saved.set(key, '{"checkoutToken":"legacy"}');
    const client = createPublicCheckoutV2Client({ ...h.options, storage: corrupt ? h.storage : { ...h.storage, setItem() { throw new Error("synthetic quota failure"); } } });
    try { const n = h.calls.length; await assert.rejects(client.register(body()), /armazenamento/); assert.equal(h.calls.length, n); }
    finally { client.dispose(); }
  }
});

test("only backend eligibility exposes participant credentials; cancelled/waitlisted/free outcomes cannot resume", async () => {
  for (const patch of [{}, { waitlistedAt: "2026-10-17T12:00:00Z" }, { status: "CANCELLED" }, { status: "CONFIRMED", paymentStatus: "NOT_REQUIRED" }]) {
    const h = harness(); h.onFetch(async () => new Response(JSON.stringify(registration({ ...patch, checkInToken: "forged-pending-token", expiresAt: new Date(epoch + ttl).toISOString() }))));
    try { const result = await h.client.register(body());
      assert.equal(result.checkInToken, patch.paymentStatus === "NOT_REQUIRED" ? "forged-pending-token" : null);
      assert.equal(result.paymentCheckout, undefined);
      if (patch.status || patch.waitlistedAt) await assert.rejects(h.client.resume());
    } finally { h.client.dispose(); }
  }
});

test("response allowlist rejects cross-event/registration changes, unsafe redirects and server-provided key fields", async () => {
  for (const mode of ["scope", "registration", "url", "secret-url"] as const) {
    const h = harness();
    try {
      await h.client.register(body());
      h.onFetch(async () => new Response(JSON.stringify(registration(mode === "scope" ? { event: { ...registration().event, id: "other" } } :
        mode === "registration" ? { id: "other-registration" } : { paymentCheckout: { method: "CREDIT_CARD", redirectUrl: mode === "url" ? "javascript:alert(1)" : "https://payments.example.invalid/?key=ec2_secret" } }))));
      await assert.rejects(h.client.resume()); assert.equal(h.client.getSnapshot().registration?.paymentCheckout, undefined);
    } finally { h.client.dispose(); }
  }
});

test("CPF requirement survives safe status polling and resume never persists CPF", async () => {
  const h = harness();
  try {
    await h.client.register(body()); h.onFetch(async url => new Response(JSON.stringify(url.endsWith("/resume") ? { error: "PAYMENT_CUSTOMER_CPF_REQUIRED" } : registration()), { status: url.endsWith("/resume") ? 400 : 200 }));
    await assert.rejects(h.client.resume()); assert.equal(h.client.getSnapshot().needsCpf, true);
    await h.client.status(); assert.equal(h.client.getSnapshot().needsCpf, true);
    assert.equal([...h.saved.values()].some(v => v.includes("52998224725")), false);
  } finally { h.client.dispose(); }
});

test("active public page stays legacy; prepared wrapper has no route/env activation or automatic resume", async () => {
  const page = await readFile(new URL("../app/eventos/[eventId]/page.tsx", import.meta.url), "utf8");
  assert.equal(page.includes("prepareCheckoutV2"), false); assert.equal(page.includes("PreparedPublicEventV2"), false);
  const wrapper = await readFile(new URL("../app/eventos/_components/public-event-v2.prepared.tsx", import.meta.url), "utf8");
  assert.equal(wrapper.includes("NEXT_PUBLIC_CHECKOUT_V2"), false);
  const hook = await readFile(new URL("../app/eventos/_components/use-prepared-checkout-v2.ts", import.meta.url), "utf8");
  assert.equal(hook.includes(".resume("), false); assert.equal(hook.includes(".register("), false);
  const source = await readFile(new URL("../app/eventos/_components/public-event-view.tsx", import.meta.url), "utf8");
  assert.ok(source.includes('if (prepareCheckoutV2 || isPreview || !event) return;'));
  for (const label of ["Pix Copia e Cola", "Cartão de crédito", "Cartão de débito"]) assert.ok(source.includes(label));
});


test("expiry while a status response is in flight cannot restore credentials or overwrite the terminal state", async () => {
  const h = harness(); let finish!: (response: Response) => void;
  try {
    await h.client.register(body());
    h.onFetch(async () => new Promise(resolve => { finish = resolve; }));
    const result = h.client.status(); h.advance(ttl); assert.equal(h.client.getSnapshot().phase, "EXPIRED");
    finish(new Response(JSON.stringify(registration({ status: "CONFIRMED", paymentStatus: "PAID", checkInToken: "participant-token" }))));
    await assert.rejects(result); assert.equal(h.client.getSnapshot().phase, "EXPIRED"); assert.equal(h.client.getSnapshot().registration, null);
  } finally { h.client.dispose(); }
});

test("a lost registration response followed by reload queries status with the original key and cannot re-register", async () => {
  const h = harness(); let restored: ReturnType<typeof createPublicCheckoutV2Client> | undefined;
  try {
    h.onFetch(async () => { throw new Error("synthetic commit acknowledgement lost"); });
    await assert.rejects(h.client.register(body())); const key = new Headers(h.calls[0]!.init.headers).get("x-event-checkout-key");
    h.client.dispose(); restored = createPublicCheckoutV2Client(h.options);
    await assert.rejects(restored.register(body())); assert.equal(h.calls.length, 1);
    h.onFetch(async () => new Response(JSON.stringify(registration()))); await restored.status();
    assert.equal(new Headers(h.calls[1]!.init.headers).get("x-event-checkout-key"), key); assert.equal(h.calls[1]!.init.body, "{}");
  } finally { restored?.dispose(); h.client.dispose(); }
});

test("server expiry can only shorten the local bound and raw key/legacy fields are not returned", async () => {
  const h = harness();
  h.onFetch(async (_url, init) => new Response(JSON.stringify(registration({ expiresAt: new Date(epoch + 3600_000).toISOString(),
    credential: new Headers(init.headers).get("x-event-checkout-key"), checkoutToken: "legacy-sensitive", cpf: "52998224725", credentialHash: "private-hash" }))));
  try {
    const result = await h.client.register(body()); assert.equal(Date.parse(h.client.getSnapshot().expiresAt!), epoch + 3600_000);
    assert.equal(JSON.stringify(result).includes("legacy-sensitive"), false); assert.equal(JSON.stringify(result).includes("private-hash"), false);
    assert.equal(JSON.stringify(result).includes("52998224725"), false);
    h.advance(3600_000); await assert.rejects(h.client.status(), /expirou/);
  } finally { h.client.dispose(); }
});

test("future activation cannot use remote HTTP endpoints or a browser legacy token as the v2 key", () => {
  const h = harness();
  try {
    for (const apiBaseUrl of ["http://remote.example.invalid", "https://user:password@api.example.invalid", "https://api.example.invalid?key=secret"])
      assert.throws(() => createPublicCheckoutV2Client({ ...h.options, apiBaseUrl }));
    const other = createPublicCheckoutV2Client({ ...h.options, storage: { ...h.storage, getItem: () => null } });
    assert.equal(other.getSnapshot().hasSession, false); other.dispose();
  } finally { h.client.dispose(); }
});


test("a definitive validation rejection permits manual correction with the same key, never a new attempt", async () => {
  const h = harness(); let rejected = true;
  h.onFetch(async () => rejected ? new Response(JSON.stringify({ error: "VALIDATION_ERROR", message: "private body" }), { status: 400 }) :
    new Response(JSON.stringify(registration({ expiresAt: new Date(epoch + ttl).toISOString() }))));
  try {
    await assert.rejects(h.client.register(body()), error => error instanceof CheckoutV2Error && error.code === "VALIDATION_FAILED");
    assert.equal(h.client.getSnapshot().phase, "VALIDATION_FAILED");
    rejected = false; await h.client.register({ ...body(), cpf: "11144477735" });
    assert.equal(h.calls.length, 2); assert.deepEqual(h.calls[0]!.init.headers, h.calls[1]!.init.headers);
    assert.equal(JSON.parse(String(h.calls[1]!.init.body)).cpf, "11144477735");
    assert.equal([...h.saved.values()].some(v => v.includes("11144477735")), false);
  } finally { h.client.dispose(); }
});
