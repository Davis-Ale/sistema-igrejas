import assert from "node:assert/strict";
import Fastify from "fastify";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { registerEventFinancialRoutes } from "../src/event-financial.routes.ts";
import {
  aggregateOrganizerEventFinancial,
  getOrganizerEventFinancial,
  type OrganizerFinancialSource
} from "../src/organizer-event-financial.ts";

const ticketA = { id: "ticket-a", name: "Pista" };
const ticketB = { id: "ticket-b", name: "Camarote" };

function row(input: Partial<OrganizerFinancialSource> & Pick<OrganizerFinancialSource, "status" | "amount">): OrganizerFinancialSource {
  return {
    platformFeePercent: "10.00",
    platformFeeAmount: "10.00",
    netAmount: "90.00",
    transactionStatus: "ACTIVE",
    tickets: [ticketA],
    ...input
  };
}

test("organizer financial keeps confirmed sales, stored fees and pending apart", () => {
  const summary = aggregateOrganizerEventFinancial("event-a", [
    row({ status: "PAID", amount: "100.00", platformFeeAmount: "7.50", netAmount: "92.50" }),
    row({ status: "PENDING", amount: "40.00", platformFeePercent: null, platformFeeAmount: null, netAmount: null }),
    row({ status: "OVERDUE", amount: "15.00", platformFeePercent: null, platformFeeAmount: null, netAmount: null }),
    row({ status: "PAID", amount: "30.00", transactionStatus: "REVERSED" }),
    row({ status: "REFUNDED", amount: "20.00", transactionStatus: "ACTIVE" }),
    row({ status: "REFUND_PENDING", amount: "12.00", platformFeePercent: null, platformFeeAmount: null, netAmount: null }),
    row({ status: "CANCELLED", amount: "8.00", transactionStatus: "CANCELLED", platformFeePercent: null, platformFeeAmount: null, netAmount: null }),
    row({ status: "NO_CHARGE", amount: "0.00", platformFeePercent: null, platformFeeAmount: null, netAmount: null }),
    row({ status: "PAID", amount: "60.00", platformFeePercent: null, platformFeeAmount: null, netAmount: null }),
    row({
      status: "PAID",
      amount: "80.00",
      platformFeeAmount: "8.00",
      netAmount: "72.00",
      tickets: [ticketA, ticketB]
    })
  ]);

  assert.deepEqual(summary.realized, {
    grossAmount: "180.00",
    platformFeeAmount: "15.50",
    netAmount: "164.50",
    count: 2
  });
  assert.deepEqual(summary.pending, { amount: "55.00", count: 2 });
  assert.deepEqual(summary.reversed, { amount: "50.00", count: 2 });
  assert.deepEqual(summary.refundPending, { amount: "12.00", count: 1 });
  assert.deepEqual(summary.cancelled, { count: 1 });
  assert.deepEqual(summary.noCharge, { count: 1 });
  assert.deepEqual(summary.inconsistent, { count: 1 });
  assert.equal(summary.tickets.find((ticket) => ticket.ticketName === "Vários ingressos")?.realized.grossAmount, "80.00");
  assert.equal(summary.tickets.filter((ticket) => ticket.ticketName === "Pista").length, 1);
  assert.equal(summary.tickets.reduce((total, ticket) => total + Number(ticket.realized.grossAmount), 0), 180);
});

test("organizer financial attributes one payment to a single ticket once", () => {
  const summary = aggregateOrganizerEventFinancial("event-a", [
    row({
      status: "PAID",
      amount: "50.00",
      platformFeeAmount: "5.00",
      netAmount: "45.00",
      tickets: [ticketB, ticketB]
    })
  ]);

  assert.equal(summary.tickets.length, 1);
  assert.equal(summary.tickets[0]?.ticketId, "ticket-b");
  assert.equal(summary.tickets[0]?.realized.grossAmount, "50.00");
  assert.equal(summary.realized.platformFeeAmount, "5.00");
});

test("organizer financial stays inside the authenticated church", async () => {
  const seen: Array<Record<string, unknown>> = [];
  const prisma = {
    event: {
      async findFirst({ where }: { where: Record<string, unknown> }) {
        seen.push(where);
        return where.id === "event-a" && where.churchId === "church-a" && where.deletedAt === null
          ? { id: "event-a" }
          : null;
      }
    },
    eventPayment: {
      async findMany({ where }: { where: Record<string, unknown> }) {
        seen.push(where);
        assert.equal(where.churchId, "church-a");
        assert.equal(where.eventId, "event-a");
        return [];
      }
    }
  } as unknown as PrismaClient;

  await assert.rejects(getOrganizerEventFinancial(prisma, "church-b", "event-a"), /EVENT_NOT_FOUND/);
  assert.deepEqual(seen, [{ id: "event-a", churchId: "church-b", deletedAt: null }]);

  const summary = await getOrganizerEventFinancial(prisma, "church-a", "event-a");
  assert.equal(summary.realized.grossAmount, "0.00");
  assert.equal(summary.pending.amount, "0.00");
  assert.deepEqual(seen[1], { id: "event-a", churchId: "church-a", deletedAt: null });
  assert.deepEqual(seen[2], { churchId: "church-a", eventId: "event-a" });
});

test("organizer financial endpoint is limited to SUPER_ADMIN", async () => {
  const calls: string[] = [];
  const prisma = {
    event: {
      async findFirst() {
        calls.push("event");
        return { id: "event-a" };
      }
    },
    eventPayment: {
      async findMany() {
        calls.push("payments");
        return [{
          status: "PAID",
          amount: "100.00",
          platformFeePercent: "10.00",
          platformFeeAmount: "10.00",
          netAmount: "90.00",
          transaction: { status: "ACTIVE" },
          order: { registrations: [{ ticket: ticketA }] }
        }];
      }
    }
  } as unknown as PrismaClient;

  for (const role of ["PASTOR", "LEADER", "VOLUNTEER", "MEMBER"]) {
    const app = Fastify();
    app.addHook("onRequest", async (request) => {
      request.user = { userId: "user-1", churchId: "church-a", role };
      request.churchId = "church-a";
    });
    await registerEventFinancialRoutes(app, prisma);
    const response = await app.inject({
      method: "GET",
      url: "/events/event-a/organizer-financial"
    });
    assert.equal(response.statusCode, 403, role);
    assert.equal(response.json().error, "FORBIDDEN");
    assert.equal(response.body.includes("100.00"), false);
    await app.close();
  }

  assert.deepEqual(calls, []);

  const app = Fastify();
  app.addHook("onRequest", async (request) => {
    request.user = { userId: "user-1", churchId: "church-a", role: "SUPER_ADMIN" };
    request.churchId = "church-a";
  });
  await registerEventFinancialRoutes(app, prisma);
  const response = await app.inject({
    method: "GET",
    url: "/events/event-a/organizer-financial"
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().realized.grossAmount, "100.00");
  assert.equal(response.json().realized.platformFeeAmount, "10.00");
  assert.equal(response.json().realized.netAmount, "90.00");
  await app.close();
});
