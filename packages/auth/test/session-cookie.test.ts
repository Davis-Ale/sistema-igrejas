import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { getJwtSecret, hashPassword, registerAuthRoutes } from "../src/index.ts";
import {
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  readSessionCookie,
  serializeExpiredSessionCookie,
  serializeSessionCookie,
  sessionCookieSecure
} from "../src/session-cookie.ts";
import { createAuthPreHandler, requireRole } from "../src/index.ts";

const secret = "session-cookie-test-secret-at-least-32";
const password = "test-password-123";

function setCookieHeader(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

test("session cookie is HttpOnly, Lax, production-Secure, and readable from Cookie", () => {
  const development = serializeSessionCookie("token.a.b", { NODE_ENV: "development" });
  const production = serializeSessionCookie("token.a.b", { NODE_ENV: "production" });
  const expired = serializeExpiredSessionCookie({ NODE_ENV: "production" });

  assert.equal(sessionCookieSecure({ NODE_ENV: "production" }), true);
  assert.equal(sessionCookieSecure({ NODE_ENV: "development" }), false);
  assert.match(development, new RegExp(`^${SESSION_COOKIE_NAME}=`));
  assert.match(development, /HttpOnly/);
  assert.match(development, /SameSite=Lax/);
  assert.match(development, new RegExp(`Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`));
  assert.equal(development.includes("Secure"), false);
  assert.match(production, /Secure/);
  assert.match(expired, /Max-Age=0/);
  assert.equal(
    readSessionCookie(`${SESSION_COOKIE_NAME}=${encodeURIComponent("token.a.b")}`),
    "token.a.b"
  );
});

test("login sets the session cookie and cookie auth preserves 401/403 without Bearer", async () => {
  const passwordHash = await hashPassword(password);
  const accounts = [{
    id: "user-a",
    email: "a@example.test",
    churchId: "church-a",
    role: "PASTOR" as const,
    status: "ACTIVE",
    passwordHash,
    church: {
      id: "church-a",
      name: "Igreja",
      slug: "igreja",
      plan: "TRIAL",
      status: "ACTIVE",
      trialStartedAt: null,
      trialEndsAt: null,
      blockedAt: null,
      blockReason: null
    },
    person: null
  }];
  const prisma = {
    userAccount: {
      async findUnique({ where }: { where: { email?: string; id?: string } }) {
        return accounts.find((account) =>
          (where.email && account.email === where.email) ||
          (where.id && account.id === where.id)
        ) ?? null;
      },
      async update() {
        return {};
      }
    },
    church: {
      async findUnique({ where }: { where: { id: string } }) {
        return accounts.find((account) => account.churchId === where.id)?.church ?? null;
      }
    }
  } as unknown as PrismaClient;

  const app = Fastify();
  await app.register(jwt, { secret: getJwtSecret({ JWT_SECRET: secret }) });
  await registerAuthRoutes(app, prisma);
  await app.register(async (protectedRoutes) => {
    protectedRoutes.addHook("preHandler", createAuthPreHandler(prisma));
    protectedRoutes.get("/ping", async () => ({ ok: true }));
    protectedRoutes.post("/pastor-only", { preHandler: requireRole(["SUPER_ADMIN", "PASTOR"]) }, async () => ({ ok: true }));
    protectedRoutes.delete("/admin-only", { preHandler: requireRole(["SUPER_ADMIN"]) }, async () => ({ ok: true }));
  }, { prefix: "/auth-test" });
  await app.ready();

  try {
    const missing = await app.inject({ url: "/auth-test/ping" });
    assert.equal(missing.statusCode, 401);
    assert.equal(missing.json().error, "UNAUTHORIZED");

    const missingSession = await app.inject({ url: "/auth/session" });
    assert.equal(missingSession.statusCode, 401);
    assert.equal(missingSession.json().error, "UNAUTHORIZED");

    const invalidCookie = await app.inject({
      url: "/auth-test/ping",
      headers: { cookie: `${SESSION_COOKIE_NAME}=not-a-jwt` }
    });
    assert.equal(invalidCookie.statusCode, 401);
    assert.equal(invalidCookie.json().error, "INVALID_TOKEN");

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "a@example.test", password }
    });
    assert.equal(login.statusCode, 200);
    const cookie = setCookieHeader(login.headers["set-cookie"]);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.equal(cookie.includes("Secure"), false);
    const token = readSessionCookie(cookie);
    assert.equal(typeof token, "string");
    assert.equal(login.json().token, token);

    const cookieSession = await app.inject({
      url: "/auth/session",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token!)}` }
    });
    assert.equal(cookieSession.statusCode, 200);
    assert.equal(cookieSession.json().user.email, "a@example.test");
    assert.equal(cookieSession.json().token, undefined);

    const cookiePing = await app.inject({
      url: "/auth-test/ping",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token!)}` }
    });
    assert.equal(cookiePing.statusCode, 200);

    const bearerPing = await app.inject({
      url: "/auth-test/ping",
      headers: { authorization: `Bearer ${login.json().token}` }
    });
    assert.equal(bearerPing.statusCode, 200);

    const pastor = await app.inject({
      method: "POST",
      url: "/auth-test/pastor-only",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token!)}` }
    });
    assert.equal(pastor.statusCode, 200);

    const forbidden = await app.inject({
      method: "DELETE",
      url: "/auth-test/admin-only",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token!)}` }
    });
    assert.equal(forbidden.statusCode, 403);
    assert.equal(forbidden.json().error, "FORBIDDEN");

    accounts[0]!.status = "DISABLED";
    const disabled = await app.inject({
      url: "/auth-test/ping",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token!)}` }
    });
    assert.equal(disabled.statusCode, 403);
    assert.equal(disabled.json().error, "ACCOUNT_DISABLED");

    const logout = await app.inject({ method: "POST", url: "/auth/logout" });
    assert.equal(logout.statusCode, 204);
    assert.match(setCookieHeader(logout.headers["set-cookie"]), /Max-Age=0/);
  } finally {
    await app.close();
  }
});
