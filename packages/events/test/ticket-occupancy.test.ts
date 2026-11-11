import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  listEventTickets,
  occupancyFromCounts,
  summarizeEventOccupancy
} from "../src/ticket.service.ts";

const vip = occupancyFromCounts({
  hasBatches: true,
  capacity: 10,
  registered: 4,
  sold: 2,
  pending: 1
});

test("occupancy treats pending as registered, not sold, and does not invent capacity without batches", () => {
  assert.deepEqual(vip, {
    registered: 4,
    sold: 2,
    pending: 1,
    total: 10,
    remaining: 6
  });
  assert.deepEqual(
    occupancyFromCounts({
      hasBatches: false,
      capacity: 0,
      registered: 1,
      sold: 0,
      pending: 1
    }),
    {
      registered: 1,
      sold: 0,
      pending: 1,
      total: null,
      remaining: null
    }
  );
});

test("event occupancy includes ticketId null without subtracting it from lot remaining", () => {
  assert.deepEqual(
    summarizeEventOccupancy([{ occupancy: vip }], {
      registered: 2,
      sold: 1,
      pending: 1
    }),
    {
      registered: 6,
      sold: 3,
      pending: 2,
      total: 10,
      remaining: 6
    }
  );
});

test("event occupancy stays undefined when any ticket has no batch", () => {
  assert.deepEqual(
    summarizeEventOccupancy(
      [
        { occupancy: vip },
        {
          occupancy: occupancyFromCounts({
            hasBatches: false,
            capacity: 0,
            registered: 1,
            sold: 0,
            pending: 1
          })
        }
      ],
      { registered: 2, sold: 1, pending: 0 }
    ),
    {
      registered: 7,
      sold: 3,
      pending: 2,
      total: null,
      remaining: null
    }
  );
});

test("event without tickets does not invent vacancies for unassigned registrations", () => {
  assert.deepEqual(
    summarizeEventOccupancy([], {
      registered: 2,
      sold: 1,
      pending: 1
    }),
    {
      registered: 2,
      sold: 1,
      pending: 1,
      total: 0,
      remaining: 0
    }
  );
});

test("listEventTickets keeps Admin _count and aggregates occupancy in SQL groupBy", async () => {
  const groupByWhere: unknown[] = [];
  const prisma = {
    event: {
      async findFirst() {
        return { id: "event-test" };
      }
    },
    church: {
      async findFirst() {
        return { platformFeePercent: null };
      }
    },
    eventTicket: {
      async findMany() {
        return [
          {
            id: "ticket-vip",
            name: "VIP",
            batches: [
              {
                id: "batch-1",
                quantity: 10,
                price: 100,
                salesStart: new Date("2026-01-01T00:00:00.000Z"),
                salesEnd: new Date("2026-12-01T00:00:00.000Z"),
                _count: { registrations: 4 }
              }
            ],
            _count: { registrations: 4 }
          },
          {
            id: "ticket-open",
            name: "Sem lote",
            batches: [],
            _count: { registrations: 1 }
          }
        ];
      }
    },
    registration: {
      async groupBy({ where }: { where: unknown }) {
        groupByWhere.push(where);
        const filter = where as {
          status?: { not?: string; in?: string[] };
          paymentStatus?: { in?: string[] };
          waitlistedAt?: null;
        };
        if (filter.status?.in) {
          assert.deepEqual(filter.status.in, ["CONFIRMED", "CHECKED_IN"]);
          assert.deepEqual(filter.paymentStatus?.in, ["PAID", "NOT_REQUIRED"]);
          assert.equal(filter.waitlistedAt, null);
          return [
            { ticketId: "ticket-vip", _count: { _all: 2 } },
            { ticketId: null, _count: { _all: 1 } }
          ];
        }
        if (filter.paymentStatus?.in?.includes("PENDING")) {
          assert.deepEqual(filter.paymentStatus.in, [
            "PENDING",
            "WAITING_PAYMENT"
          ]);
          return [
            { ticketId: "ticket-vip", _count: { _all: 1 } },
            { ticketId: "ticket-open", _count: { _all: 1 } },
            { ticketId: null, _count: { _all: 1 } }
          ];
        }
        assert.equal(filter.status?.not, "CANCELLED");
        return [
          { ticketId: "ticket-vip", _count: { _all: 4 } },
          { ticketId: "ticket-open", _count: { _all: 1 } },
          { ticketId: null, _count: { _all: 2 } }
        ];
      }
    }
  } as unknown as PrismaClient;

  const listed = await listEventTickets(prisma, "church-test", "event-test");

  assert.equal(groupByWhere.length, 3);
  assert.equal(listed.tickets[0]?._count.registrations, 4);
  assert.deepEqual(listed.tickets[0]?.occupancy, {
    registered: 4,
    sold: 2,
    pending: 1,
    total: 10,
    remaining: 6
  });
  assert.equal(listed.tickets[1]?._count.registrations, 1);
  assert.deepEqual(listed.tickets[1]?.occupancy, {
    registered: 1,
    sold: 0,
    pending: 1,
    total: null,
    remaining: null
  });
  assert.deepEqual(listed.occupancy, {
    registered: 7,
    sold: 3,
    pending: 3,
    total: null,
    remaining: null
  });
});

test("listEventTickets remaining ignores unassigned registrations when every ticket has lots", async () => {
  const prisma = {
    event: {
      async findFirst() {
        return { id: "event-test" };
      }
    },
    church: {
      async findFirst() {
        return { platformFeePercent: null };
      }
    },
    eventTicket: {
      async findMany() {
        return [
          {
            id: "ticket-vip",
            name: "VIP",
            batches: [
              {
                id: "batch-1",
                quantity: 10,
                price: 0,
                salesStart: new Date("2026-01-01T00:00:00.000Z"),
                salesEnd: new Date("2026-12-01T00:00:00.000Z"),
                _count: { registrations: 4 }
              }
            ],
            _count: { registrations: 4 }
          }
        ];
      }
    },
    registration: {
      async groupBy({ where }: { where: unknown }) {
        const filter = where as {
          status?: { in?: string[] };
          paymentStatus?: { in?: string[] };
        };
        if (filter.status?.in) {
          return [
            { ticketId: "ticket-vip", _count: { _all: 2 } },
            { ticketId: null, _count: { _all: 1 } }
          ];
        }
        if (filter.paymentStatus?.in?.includes("PENDING")) {
          return [
            { ticketId: "ticket-vip", _count: { _all: 1 } },
            { ticketId: null, _count: { _all: 1 } }
          ];
        }
        return [
          { ticketId: "ticket-vip", _count: { _all: 4 } },
          { ticketId: null, _count: { _all: 2 } }
        ];
      }
    }
  } as unknown as PrismaClient;

  const listed = await listEventTickets(prisma, "church-test", "event-test");

  assert.deepEqual(listed.tickets.map((ticket) => ticket.id), ["ticket-vip"]);
  assert.deepEqual(listed.occupancy, {
    registered: 6,
    sold: 3,
    pending: 2,
    total: 10,
    remaining: 6
  });
});
