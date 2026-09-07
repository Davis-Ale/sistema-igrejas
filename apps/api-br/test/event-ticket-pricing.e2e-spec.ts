import { Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@sistema-igrejas/database";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { buildApp } from "../src/app.js";

describe("Event ticket listing pricing E2E", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient | null = null;
  let pastorToken = "";
  let otherTenantToken = "";
  let churchId = "";
  let campusId = "";
  let personId = "";
  const createdEventIds: string[] = [];
  let storedOriginalFee: Prisma.Decimal | null = null;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const loginResponse = await request(app.server)
      .post("/auth/login")
      .send({
        email: "pastor@sistemaigrejas.local",
        password: "12345678"
      });

    expect(loginResponse.status).toBe(200);

    pastorToken = loginResponse.body.token as string;
    churchId = loginResponse.body.church.id as string;

    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required.");
    }

    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: databaseUrl
      })
    });

    const church = await prisma.church.findFirst({
      where: {
        id: churchId
      },
      select: {
        platformFeePercent: true
      }
    });

    storedOriginalFee = church?.platformFeePercent ?? null;

    const campus = await prisma.campus.findFirst({
      where: {
        churchId
      },
      select: {
        id: true
      }
    });

    expect(campus).not.toBeNull();
    campusId = campus!.id;

    const person = await prisma.person.findFirst({
      where: {
        churchId
      },
      select: {
        id: true
      }
    });

    expect(person).not.toBeNull();
    personId = person!.id;

    otherTenantToken = await app.jwt.sign({
      userId: personId,
      churchId: "other-church",
      role: "SUPER_ADMIN"
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.church.update({
        where: {
          id: churchId
        },
        data: {
          platformFeePercent: storedOriginalFee
        }
      });

      if (createdEventIds.length > 0) {
        await prisma.event.deleteMany({
          where: {
            id: {
              in: createdEventIds
            }
          }
        });
      }

      await prisma.$disconnect();
    }

    await app.close();
  });

  async function createTicketFixture(input: {
    suffix: string;
    price: number;
    isFree?: boolean;
  }) {
    const event = await prisma!.event.create({
      data: {
        churchId,
        campusId,
        title: `Ticket Pricing ${input.suffix}`,
        slug: `ticket-pricing-${input.suffix}`,
        date: new Date("2026-10-01T20:00:00.000Z"),
        capacity: 200,
        price: input.price,
        isPublic: true,
        isPaid: !input.isFree,
        publicRegistrationEnabled: true
      }
    });

    createdEventIds.push(event.id);

    const ticket = await prisma!.eventTicket.create({
      data: {
        churchId,
        eventId: event.id,
        name: `Ingresso ${input.suffix}`,
        isFree: input.isFree ?? false,
        isVisible: true
      }
    });

    const now = Date.now();
    const batch = await prisma!.ticketBatch.create({
      data: {
        churchId,
        eventId: event.id,
        ticketId: ticket.id,
        name: `Lote ${input.suffix}`,
        quantity: 200,
        price: input.price,
        salesStart: new Date(now - 60_000),
        salesEnd: new Date(now + 86_400_000),
        isVisible: true
      }
    });

    return {
      event,
      ticket,
      batch
    };
  }

  function findListedBatch(
    body: Array<{
      id: string;
      batches: Array<{
        id: string;
        buyerAmount: string | number;
        platformFeeAmount: string | number;
        netReceivableAmount: string | number;
      }>;
    }>,
    ticketId: string,
    batchId: string
  ) {
    const ticket = body.find((item) => item.id === ticketId);
    return ticket?.batches.find((batch) => batch.id === batchId);
  }

  it("projects R$100 ticket with default 10% as 100 / 10 / 90", async () => {
    await prisma!.church.update({
      where: {
        id: churchId
      },
      data: {
        platformFeePercent: null
      }
    });

    const fixture = await createTicketFixture({
      suffix: `default-${Date.now()}`,
      price: 100
    });

    const response = await request(app.server)
      .get(`/api/events/${fixture.event.id}/tickets`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(response.status).toBe(200);

    const batch = findListedBatch(
      response.body,
      fixture.ticket.id,
      fixture.batch.id
    );

    expect(batch).toBeDefined();
    expect(Number(batch!.buyerAmount)).toBe(100);
    expect(Number(batch!.platformFeeAmount)).toBe(10);
    expect(Number(batch!.netReceivableAmount)).toBe(90);
  });

  it("projects R$100 ticket with 7.9% override as 100 / 7.90 / 92.10", async () => {
    await prisma!.church.update({
      where: {
        id: churchId
      },
      data: {
        platformFeePercent: new Prisma.Decimal("7.9")
      }
    });

    const fixture = await createTicketFixture({
      suffix: `override-${Date.now()}`,
      price: 100
    });

    const response = await request(app.server)
      .get(`/api/events/${fixture.event.id}/tickets`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(response.status).toBe(200);

    const batch = findListedBatch(
      response.body,
      fixture.ticket.id,
      fixture.batch.id
    );

    expect(batch).toBeDefined();
    expect(Number(batch!.buyerAmount)).toBe(100);
    expect(Number(batch!.platformFeeAmount)).toBe(7.9);
    expect(Number(batch!.netReceivableAmount)).toBe(92.1);
  });

  it("projects free ticket as 0 / 0 / 0", async () => {
    await prisma!.church.update({
      where: {
        id: churchId
      },
      data: {
        platformFeePercent: null
      }
    });

    const fixture = await createTicketFixture({
      suffix: `free-${Date.now()}`,
      price: 0,
      isFree: true
    });

    const response = await request(app.server)
      .get(`/api/events/${fixture.event.id}/tickets`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(response.status).toBe(200);

    const batch = findListedBatch(
      response.body,
      fixture.ticket.id,
      fixture.batch.id
    );

    expect(batch).toBeDefined();
    expect(Number(batch!.buyerAmount)).toBe(0);
    expect(Number(batch!.platformFeeAmount)).toBe(0);
    expect(Number(batch!.netReceivableAmount)).toBe(0);
  });

  it("isolates ticket listing by churchId and eventId", async () => {
    await prisma!.church.update({
      where: {
        id: churchId
      },
      data: {
        platformFeePercent: null
      }
    });

    const first = await createTicketFixture({
      suffix: `iso-a-${Date.now()}`,
      price: 100
    });
    const second = await createTicketFixture({
      suffix: `iso-b-${Date.now()}`,
      price: 50
    });

    const otherTenant = await request(app.server)
      .get(`/api/events/${first.event.id}/tickets`)
      .set("Authorization", `Bearer ${otherTenantToken}`);

    expect(otherTenant.status).toBe(404);
    expect(otherTenant.body.error).toBe("EVENT_NOT_FOUND");

    const firstList = await request(app.server)
      .get(`/api/events/${first.event.id}/tickets`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(firstList.status).toBe(200);
    expect(
      firstList.body.some(
        (ticket: { id: string }) => ticket.id === first.ticket.id
      )
    ).toBe(true);
    expect(
      firstList.body.some(
        (ticket: { id: string }) => ticket.id === second.ticket.id
      )
    ).toBe(false);

    const secondList = await request(app.server)
      .get(`/api/events/${second.event.id}/tickets`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(secondList.status).toBe(200);
    expect(
      secondList.body.some(
        (ticket: { id: string }) => ticket.id === second.ticket.id
      )
    ).toBe(true);
    expect(
      secondList.body.some(
        (ticket: { id: string }) => ticket.id === first.ticket.id
      )
    ).toBe(false);
  });
});
