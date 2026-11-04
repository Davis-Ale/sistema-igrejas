import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { createAuthPreHandler } from "@sistema-igrejas/auth";
import { registerTicketRoutes } from "../src/ticket.routes.ts";

const churchA = "church-a";
const churchB = "church-b";
const eventA = "event-a";
const ticketA = "ticket-a";
const batchA = "batch-a";

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
  },
  other: {
    id: "user-other",
    churchId: churchB,
    status: "ACTIVE",
    role: "SUPER_ADMIN",
    person: null
  }
} as const;

const writeRoutes = [
  {
    method: "POST" as const,
    url: `/api/events/${eventA}/tickets`,
    payload: {
      name: "Ingresso",
      isFree: false,
      isVisible: true
    }
  },
  {
    method: "POST" as const,
    url: `/api/events/${eventA}/ticket-batches`,
    payload: {
      ticketId: ticketA,
      name: "Lote",
      quantity: 10,
      price: 50,
      salesStart: "2026-01-01T00:00:00.000Z",
      salesEnd: "2026-11-20T20:00:00.000Z",
      isVisible: true
    }
  },
  {
    method: "PATCH" as const,
    url: `/api/events/${eventA}/tickets/${ticketA}`,
    payload: {
      name: "Ingresso atualizado"
    }
  },
  {
    method: "PATCH" as const,
    url: `/api/events/${eventA}/ticket-batches/${batchA}`,
    payload: {
      name: "Lote atualizado"
    }
  }
];

async function harness() {
  const writes: Array<{ op: string; churchId: string }> = [];
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
      },
      async findFirst() {
        return {
          platformFeePercent: null
        };
      }
    },
    event: {
      async findFirst({ where }: { where: { churchId: string; id: string } }) {
        return where.churchId === churchA && where.id === eventA
          ? { id: eventA }
          : null;
      }
    },
    eventTicket: {
      async findMany() {
        return [];
      },
      async findFirst({
        where
      }: {
        where: { churchId: string; eventId: string; id?: string };
      }) {
        return where.churchId === churchA &&
          where.eventId === eventA &&
          (!where.id || where.id === ticketA)
          ? { id: ticketA, isFree: false }
          : null;
      },
      async create({ data }: { data: { churchId: string } }) {
        writes.push({ op: "createTicket", churchId: data.churchId });
        return {
          ...data,
          id: "ticket-new",
          batches: [],
          _count: { registrations: 0 }
        };
      },
      async update() {
        writes.push({ op: "updateTicket", churchId: churchA });
        return {
          id: ticketA,
          batches: [],
          _count: { registrations: 0 }
        };
      }
    },
    ticketBatch: {
      async findFirst({
        where
      }: {
        where: { churchId: string; eventId: string; id?: string };
      }) {
        return where.churchId === churchA &&
          where.eventId === eventA &&
          (!where.id || where.id === batchA)
          ? {
              id: batchA,
              ticketId: ticketA,
              quantity: 10,
              price: 50,
              salesStart: new Date("2026-01-01T00:00:00.000Z"),
              salesEnd: new Date("2026-11-20T20:00:00.000Z"),
              _count: { registrations: 0 }
            }
          : null;
      },
      async create({ data }: { data: { churchId: string } }) {
        writes.push({ op: "createBatch", churchId: data.churchId });
        return {
          ...data,
          id: "batch-new",
          _count: { registrations: 0 }
        };
      },
      async update() {
        writes.push({ op: "updateBatch", churchId: churchA });
        return {
          id: batchA,
          _count: { registrations: 0 }
        };
      }
    }
  } as unknown as PrismaClient;

  const app = Fastify();
  await app.register(jwt, { secret: "ticket-write-rbac-test-secret" });
  await app.register(
    async (instance) => {
      instance.addHook("preHandler", createAuthPreHandler(prisma));
      await registerTicketRoutes(instance, prisma);
    },
    { prefix: "/api" }
  );
  await app.ready();

  return {
    app,
    writes,
    token(account: (typeof accounts)[keyof typeof accounts]) {
      return app.jwt.sign({
        userId: account.id,
        churchId: account.churchId,
        role: account.role
      });
    }
  };
}

test("ticket and batch writes reuse SUPER_ADMIN|PASTOR; GET stays readable", async () => {
  const source = await readFile(
    new URL("../src/ticket.routes.ts", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /app\.get\(\s*"\/events\/:eventId\/tickets",\s*async/
  );
  assert.match(
    source,
    /app\.post\(\s*"\/events\/:eventId\/tickets",\s*\{\s*preHandler: requireRole\(\["SUPER_ADMIN", "PASTOR"\]\)/
  );
  assert.match(
    source,
    /app\.post\(\s*"\/events\/:eventId\/ticket-batches",\s*\{\s*preHandler: requireRole\(\["SUPER_ADMIN", "PASTOR"\]\)/
  );
  assert.match(
    source,
    /app\.patch\(\s*"\/events\/:eventId\/tickets\/:ticketId",\s*\{\s*preHandler: requireRole\(\["SUPER_ADMIN", "PASTOR"\]\)/
  );
  assert.match(
    source,
    /app\.patch\(\s*"\/events\/:eventId\/ticket-batches\/:batchId",\s*\{\s*preHandler: requireRole\(\["SUPER_ADMIN", "PASTOR"\]\)/
  );
});

test("LEADER is denied ticket writes and cannot mutate another church", async () => {
  const h = await harness();

  try {
    const list = await h.app.inject({
      method: "GET",
      url: `/api/events/${eventA}/tickets`,
      headers: { authorization: `Bearer ${h.token(accounts.leader)}` }
    });
    assert.equal(list.statusCode, 200);

    for (const route of writeRoutes) {
      const denied = await h.app.inject({
        method: route.method,
        url: route.url,
        payload: route.payload,
        headers: { authorization: `Bearer ${h.token(accounts.leader)}` }
      });
      assert.equal(denied.statusCode, 403);
      assert.equal(denied.json().error, "FORBIDDEN");
    }

    assert.equal(h.writes.length, 0);
  } finally {
    await h.app.close();
  }
});

test("ticket writes stay isolated by churchId from the token", async () => {
  const h = await harness();

  try {
    const unauthorized = await h.app.inject({
      method: "POST",
      url: `/api/events/${eventA}/tickets`,
      payload: writeRoutes[0]!.payload
    });
    assert.equal(unauthorized.statusCode, 401);

    for (const route of writeRoutes) {
      const crossTenant = await h.app.inject({
        method: route.method,
        url: route.url,
        payload: route.payload,
        headers: { authorization: `Bearer ${h.token(accounts.other)}` }
      });
      assert.equal(crossTenant.statusCode, 404);
      assert.equal(
        crossTenant.json().error,
        route.url.includes("ticket-batches") && route.method === "POST"
          ? "EVENT_TICKET_NOT_FOUND"
          : "EVENT_NOT_FOUND"
      );
    }

    assert.equal(h.writes.length, 0);

    for (const route of writeRoutes) {
      const allowed = await h.app.inject({
        method: route.method,
        url: route.url,
        payload: route.payload,
        headers: { authorization: `Bearer ${h.token(accounts.pastor)}` }
      });
      assert.equal(allowed.statusCode === 200 || allowed.statusCode === 201, true);
    }

    assert.equal(h.writes.length, 4);
    assert.equal(
      h.writes.every((write) => write.churchId === churchA),
      true
    );
  } finally {
    await h.app.close();
  }
});
