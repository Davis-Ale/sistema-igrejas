import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { getJwtSecret, hashPassword, registerAuthRoutes } from "../src/index.ts";
import { AUTH_LOGIN_IP_RATE_LIMIT } from "../src/ip-rate-limit.ts";

const secret = "login-rate-limit-test-secret-at-least-32";
const password = "test-password-123";

test("login route uses IP rate limit preHandler", async () => {
  const source = await readFile(
    new URL("../src/auth.routes.ts", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /app\.post\(\s*"\/auth\/login",\s*\{\s*preHandler: createFixedWindowIpRateLimit\(AUTH_LOGIN_IP_RATE_LIMIT\)/
  );
});

test("login returns 429 after the IP window is exhausted", async () => {
  const passwordHash = await hashPassword(password);
  const lookups: string[] = [];
  const prisma = {
    userAccount: {
      async findUnique({ where }: { where: { email: string } }) {
        lookups.push(where.email);
        return {
          id: "user-a",
          email: "a@example.test",
          churchId: "church-a",
          role: "PASTOR",
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
        };
      },
      async update() {
        return {};
      }
    }
  } as unknown as PrismaClient;

  const app = Fastify();
  await app.register(jwt, { secret: getJwtSecret({ JWT_SECRET: secret }) });
  await registerAuthRoutes(app, prisma);
  await app.ready();

  try {
    const payload = { email: "a@example.test", password };
    const allowed = AUTH_LOGIN_IP_RATE_LIMIT.limit;

    for (let index = 0; index < allowed; index += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload
      });
      assert.equal(response.statusCode, 200);
    }

    const limited = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload
    });
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().error, "RATE_LIMITED");
    assert.equal(Boolean(limited.headers["retry-after"]), true);
    assert.equal(lookups.length, allowed);
  } finally {
    await app.close();
  }
});
