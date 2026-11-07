import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { createAuthPreHandler } from "@sistema-igrejas/auth";
import { registerEventApiKeyRoutes } from "../src/api-key.routes.ts";
import { registerEventIntegrationRoutes } from "../src/integration.routes.ts";

const churchA = "church-a";

const accounts = {
  pastor: {
    id: "user-pastor",
    churchId: churchA,
    status: "ACTIVE",
    role: "PASTOR",
    person: null
  },
  leader: {
    id: "user-leader",
    churchId: churchA,
    status: "ACTIVE",
    role: "LEADER",
    person: null
  }
} as const;

async function harness() {
  const prisma = {
    userAccount: {
      async findUnique({ where }: { where: { id: string } }) {
        return Object.values(accounts).find((account) => account.id === where.id) ?? null;
      }
    },
    church: {
      async findUnique() {
        return {
          id: churchA,
          status: "ACTIVE",
          trialEndsAt: null,
          blockReason: null
        };
      }
    },
    eventApiKey: {
      async findMany() {
        return [];
      }
    },
    eventIntegration: {
      async findMany() {
        return [];
      }
    }
  } as unknown as PrismaClient;

  const app = Fastify();
  await app.register(jwt, { secret: "events-sensitive-read-rbac-test-secret" });
  await app.register(
    async (instance) => {
      instance.addHook("preHandler", createAuthPreHandler(prisma));
      await registerEventApiKeyRoutes(instance, prisma);
      await registerEventIntegrationRoutes(instance, prisma);
    },
    { prefix: "/api" }
  );
  await app.ready();

  return {
    app,
    token(account: (typeof accounts)[keyof typeof accounts]) {
      return app.jwt.sign({
        userId: account.id,
        churchId: account.churchId,
        role: account.role
      });
    }
  };
}

test("API key and integration GETs reuse SUPER_ADMIN|PASTOR", async () => {
  const apiKeySource = await readFile(
    new URL("../src/api-key.routes.ts", import.meta.url),
    "utf8"
  );
  const integrationSource = await readFile(
    new URL("../src/integration.routes.ts", import.meta.url),
    "utf8"
  );

  assert.match(
    apiKeySource,
    /app\.get\(\s*"\/events\/api-keys",\s*\{\s*preHandler: requireRole\(\["SUPER_ADMIN", "PASTOR"\]\)/
  );
  assert.match(
    integrationSource,
    /app\.get\(\s*"\/events\/integrations",\s*\{\s*preHandler: requireRole\(\["SUPER_ADMIN", "PASTOR"\]\)/
  );
});

test("LEADER cannot list API keys or integrations; PASTOR can", async () => {
  const h = await harness();

  try {
    for (const url of ["/api/events/api-keys", "/api/events/integrations"]) {
      const denied = await h.app.inject({
        method: "GET",
        url,
        headers: { authorization: `Bearer ${h.token(accounts.leader)}` }
      });
      assert.equal(denied.statusCode, 403);
      assert.equal(denied.json().error, "FORBIDDEN");

      const allowed = await h.app.inject({
        method: "GET",
        url,
        headers: { authorization: `Bearer ${h.token(accounts.pastor)}` }
      });
      assert.equal(allowed.statusCode, 200);
    }
  } finally {
    await h.app.close();
  }
});
