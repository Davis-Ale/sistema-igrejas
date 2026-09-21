import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ApiError, checkIn, listEvents, login, readSession, SESSION_KEY } from "../app/lib/api.ts";

const originalFetch = globalThis.fetch;
const originalBase = process.env.NEXT_PUBLIC_API_BASE_URL;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = originalBase;
});

function respond(data, status = 200) {
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://events.example.test";
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, ...init });
    return new Response(JSON.stringify(data), { status });
  };
  return requests;
}

test("login uses the existing contract without a bearer or tenant supplied by the client", async () => {
  const session = { token: "test-token", user: { email: "operator@example.test", role: "LEADER" }, church: { name: "Test", status: "ACTIVE" } };
  const requests = respond(session);
  assert.deepEqual(await login("operator@example.test", "test-password"), session);
  assert.equal(requests[0].url, "https://events.example.test/auth/login");
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].headers.has("Authorization"), false);
  assert.deepEqual(JSON.parse(requests[0].body), { email: "operator@example.test", password: "test-password" });
});

test("event listing forwards pagination, search, bearer and cancellation, never churchId", async () => {
  const requests = respond({ items: [], pagination: { page: 2, totalPages: 3, total: 42 } });
  const signal = new AbortController().signal;
  await listEvents("test-token", 2, " Encontro & família ", signal);
  const request = requests[0];
  const url = new URL(request.url);
  assert.equal(url.pathname, "/api/events");
  assert.deepEqual(Object.fromEntries(url.searchParams), { page: "2", limit: "20", search: "Encontro & família" });
  assert.equal(request.headers.get("Authorization"), "Bearer test-token");
  assert.equal(request.signal, signal);
  assert.equal(request.cache, "no-store");
});

test("check-in sends only selected event and credential, and returns the server participant", async () => {
  const result = { id: "registration-test", status: "CHECKED_IN", event: { id: "event-test", title: "Test" }, person: null, visitor: { name: "Test participant" } };
  const requests = respond(result);
  assert.deepEqual(await checkIn("test-token", "event-test", " credential-test "), result);
  assert.equal(requests[0].url, "https://events.example.test/api/events/registrations/check-in-token");
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].headers.get("Authorization"), "Bearer test-token");
  assert.deepEqual(JSON.parse(requests[0].body), { eventId: "event-test", checkInToken: "credential-test" });
});

for (const [status, code] of [[401, "UNAUTHORIZED"], [403, "FORBIDDEN"],
  [404, "REGISTRATION_NOT_FOUND"], [409, "PAYMENT_NOT_CONFIRMED"],
  [409, "REGISTRATION_ALREADY_CHECKED_IN"], [409, "REGISTRATION_CANCELLED"],
  [409, "REGISTRATION_WAITLISTED"]]) {
  test(`server rejection ${code} remains an error, with no automatic retry`, async () => {
    const requests = respond({ error: code, message: "Server rejection" }, status);
    await assert.rejects(checkIn("test-token", "event-test", "credential-test"),
      (error) => error instanceof ApiError && error.status === status && error.code === code);
    assert.equal(requests.length, 1);
  });
}

test("a response for a different event or without CHECKED_IN cannot confirm entry", async () => {
  respond({ id: "registration-test", status: "CHECKED_IN", event: { id: "other-event" } });
  await assert.rejects(checkIn("test-token", "event-test", "credential-test"));
  respond({ id: "registration-test", status: "PENDING", event: { id: "event-test" } });
  await assert.rejects(checkIn("test-token", "event-test", "credential-test"));
});

test("malformed or tokenless stored data does not restore access", () => {
  const storage = { getItem: (key) => { assert.equal(key, SESSION_KEY); return "{"; }, removeItem() {} };
  assert.equal(readSession(storage), null);
  assert.equal(readSession({ ...storage, getItem: () => JSON.stringify({ user: { email: "test" }, church: { name: "test" } }) }), null);
  assert.equal(readSession({ ...storage, getItem() { throw new Error("Storage blocked"); } }), null);
});

test("a valid existing session is restored without a second authentication scheme", () => {
  const session = { token: "test-token", user: { email: "operator@example.test", role: "LEADER" }, church: { name: "Test", status: "ACTIVE" } };
  assert.deepEqual(readSession({ getItem: () => JSON.stringify(session), removeItem() {} }), session);
});
