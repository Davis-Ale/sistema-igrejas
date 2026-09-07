import { Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@sistema-igrejas/database";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { buildApp } from "../src/app.js";

describe("Event discount E2E", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient | null = null;
  let pastorToken = "";
  let leaderToken = "";
  let otherTenantToken = "";
  let churchId = "";
  let churchSlug = "";
  let campusId = "";
  let personId = "";
  const createdEventIds: string[] = [];
  let storedOriginalFee: Prisma.Decimal | null = null;

  beforeAll(async () => {
    process.env.EVENTS_TEST_PAYMENT_MODE = "pending";

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
    churchSlug = loginResponse.body.church.slug as string;

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

    await prisma.church.update({
      where: {
        id: churchId
      },
      data: {
        platformFeePercent: null
      }
    });

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

    leaderToken = await app.jwt.sign({
      userId: personId,
      churchId,
      role: "LEADER"
    });

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
        await prisma.eventPayment.deleteMany({
          where: {
            eventId: {
              in: createdEventIds
            }
          }
        });

        await prisma.eventOrder.deleteMany({
          where: {
            eventId: {
              in: createdEventIds
            }
          }
        });

        await prisma.transaction.deleteMany({
          where: {
            eventId: {
              in: createdEventIds
            }
          }
        });

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

  async function createPaidEventFixture(suffix: string, price = 100) {
    const event = await prisma!.event.create({
      data: {
        churchId,
        campusId,
        title: `Discount Event ${suffix}`,
        slug: `discount-event-${suffix}`,
        date: new Date("2026-11-01T20:00:00.000Z"),
        capacity: 200,
        price,
        isPublic: true,
        isPaid: true,
        publicRegistrationEnabled: true
      }
    });

    createdEventIds.push(event.id);

    const ticket = await prisma!.eventTicket.create({
      data: {
        churchId,
        eventId: event.id,
        name: `Ingresso ${suffix}`,
        isFree: false,
        isVisible: true
      }
    });

    const extraTicket = await prisma!.eventTicket.create({
      data: {
        churchId,
        eventId: event.id,
        name: `Outro ${suffix}`,
        isFree: false,
        isVisible: true
      }
    });

    const now = Date.now();
    const batch = await prisma!.ticketBatch.create({
      data: {
        churchId,
        eventId: event.id,
        ticketId: ticket.id,
        name: `Lote ${suffix}`,
        quantity: 200,
        price,
        salesStart: new Date(now - 60_000),
        salesEnd: new Date(now + 86_400_000),
        isVisible: true
      }
    });

    const extraBatch = await prisma!.ticketBatch.create({
      data: {
        churchId,
        eventId: event.id,
        ticketId: extraTicket.id,
        name: `Lote extra ${suffix}`,
        quantity: 200,
        price,
        salesStart: new Date(now - 60_000),
        salesEnd: new Date(now + 86_400_000),
        isVisible: true
      }
    });

    return {
      event,
      ticket,
      extraTicket,
      batch,
      extraBatch
    };
  }

  async function createDiscount(
    eventId: string,
    input: {
      ticketId: string;
      code: string;
      finalPrice: number;
      isActive?: boolean;
      token?: string;
    }
  ) {
    return request(app.server)
      .post(`/api/events/${eventId}/discounts`)
      .set("Authorization", `Bearer ${input.token ?? pastorToken}`)
      .send({
        ticketId: input.ticketId,
        code: input.code,
        finalPrice: input.finalPrice,
        ...(input.isActive === undefined
          ? {}
          : { isActive: input.isActive })
      });
  }

  async function registerPublic(input: {
    eventSlug: string;
    ticketId: string;
    ticketBatchId: string;
    name: string;
    phone: string;
    discountCode?: string;
  }) {
    return request(app.server)
      .post(
        `/public/churches/${churchSlug}/events/${input.eventSlug}/register`
      )
      .send({
        name: input.name,
        phone: input.phone,
        email: `${input.phone}@e2e.local`,
        ticketId: input.ticketId,
        ticketBatchId: input.ticketBatchId,
        paymentMethod: "PIX",
        ...(input.discountCode
          ? { discountCode: input.discountCode }
          : {})
      });
  }

  it("charges finalPrice and calculates fee over the discounted amount", async () => {
    const fixture = await createPaidEventFixture(
      `valid-${Date.now()}`
    );

    const created = await createDiscount(fixture.event.id, {
      ticketId: fixture.ticket.id,
      code: "promo70",
      finalPrice: 70
    });

    expect(created.status).toBe(201);
    expect(created.body.code).toBe("PROMO70");

    const response = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Desconto Valido",
      phone: `4299${Date.now().toString().slice(-7)}`,
      discountCode: "promo70"
    });

    expect(response.status).toBe(201);

    const payment = await prisma!.eventPayment.findUnique({
      where: {
        id: response.body.paymentId as string
      },
      include: {
        transaction: true,
        order: true
      }
    });

    expect(Number(payment!.amount)).toBe(70);
    expect(Number(payment!.platformFeePercent)).toBe(10);
    expect(Number(payment!.platformFeeAmount)).toBe(7);
    expect(Number(payment!.netAmount)).toBe(63);
    expect(Number(payment!.transaction.amount)).toBe(70);
    expect(Number(payment!.order.totalAmount)).toBe(70);
    expect(payment!.discountCode).toBe("PROMO70");
    expect(payment!.discountId).toBe(created.body.id);
  });

  it("rejects invalid, foreign, inactive and non-discounted prices without creating a charge", async () => {
    const fixture = await createPaidEventFixture(
      `invalid-${Date.now()}`
    );
    const other = await createPaidEventFixture(
      `other-${Date.now()}`
    );

    const valid = await createDiscount(fixture.event.id, {
      ticketId: fixture.ticket.id,
      code: "OK70",
      finalPrice: 70
    });

    expect(valid.status).toBe(201);

    const inactive = await createDiscount(fixture.event.id, {
      ticketId: fixture.ticket.id,
      code: "OFF70",
      finalPrice: 70,
      isActive: false
    });

    expect(inactive.status).toBe(201);

    const equalPrice = await createDiscount(fixture.event.id, {
      ticketId: fixture.ticket.id,
      code: "FULL100",
      finalPrice: 100
    });

    expect(equalPrice.status).toBe(201);

    const zeroCreate = await createDiscount(fixture.event.id, {
      ticketId: fixture.ticket.id,
      code: "ZERO",
      finalPrice: 0
    });

    expect(zeroCreate.status).toBe(400);

    await prisma!.eventDiscount.create({
      data: {
        churchId,
        eventId: fixture.event.id,
        ticketId: fixture.ticket.id,
        code: "ZEROED",
        finalPrice: 0,
        isActive: true
      }
    });

    const otherEventDiscount = await createDiscount(other.event.id, {
      ticketId: other.ticket.id,
      code: "OTHER70",
      finalPrice: 70
    });

    expect(otherEventDiscount.status).toBe(201);

    const cases = [
      { discountCode: "INVALID" },
      { discountCode: "OTHER70" },
      {
        discountCode: "OK70",
        ticketId: fixture.extraTicket.id,
        ticketBatchId: fixture.extraBatch.id
      },
      { discountCode: "OFF70" },
      { discountCode: "FULL100" },
      { discountCode: "ZEROED" }
    ];

    for (const testCase of cases) {
      const beforeCount = await prisma!.eventPayment.count({
        where: {
          eventId: fixture.event.id
        }
      });

      const response = await registerPublic({
        eventSlug: fixture.event.slug,
        ticketId: testCase.ticketId ?? fixture.ticket.id,
        ticketBatchId: testCase.ticketBatchId ?? fixture.batch.id,
        name: `Invalido ${testCase.discountCode}`,
        phone: `4288${Date.now().toString().slice(-6)}${testCase.discountCode.length}`,
        discountCode: testCase.discountCode
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(response.body.error).toBe("DISCOUNT_NOT_APPLICABLE");

      const afterCount = await prisma!.eventPayment.count({
        where: {
          eventId: fixture.event.id
        }
      });

      expect(afterCount).toBe(beforeCount);
    }
  });

  it("does not trust preview: tampered register is refused or charged at the correct price", async () => {
    const fixture = await createPaidEventFixture(
      `preview-${Date.now()}`
    );

    const created = await createDiscount(fixture.event.id, {
      ticketId: fixture.ticket.id,
      code: "PREV70",
      finalPrice: 70
    });

    expect(created.status).toBe(201);

    const preview = await request(app.server)
      .post(
        `/public/churches/${churchSlug}/events/${fixture.event.slug}/discounts/validate`
      )
      .send({
        code: "PREV70",
        ticketId: fixture.ticket.id,
        ticketBatchId: fixture.batch.id
      });

    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      code: "PREV70",
      ticketId: fixture.ticket.id
    });
    expect(Number(preview.body.listPrice)).toBe(100);
    expect(Number(preview.body.finalPrice)).toBe(70);

    const beforeCount = await prisma!.eventPayment.count({
      where: {
        eventId: fixture.event.id
      }
    });

    const tampered = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Preview Adulterado",
      phone: `4277${Date.now().toString().slice(-7)}`,
      discountCode: "HACKED"
    });

    expect(tampered.status).toBeGreaterThanOrEqual(400);
    expect(tampered.status).toBeLessThan(500);
    expect(tampered.body.error).toBe("DISCOUNT_NOT_APPLICABLE");

    const afterTampered = await prisma!.eventPayment.count({
      where: {
        eventId: fixture.event.id
      }
    });

    expect(afterTampered).toBe(beforeCount);

    const honest = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Preview Correto",
      phone: `4266${Date.now().toString().slice(-7)}`,
      discountCode: "PREV70"
    });

    expect(honest.status).toBe(201);

    const payment = await prisma!.eventPayment.findUnique({
      where: {
        id: honest.body.paymentId as string
      }
    });

    expect(Number(payment!.amount)).toBe(70);
  });

  it("does not create a second transaction on existing registration resume", async () => {
    const fixture = await createPaidEventFixture(
      `resume-${Date.now()}`
    );

    await createDiscount(fixture.event.id, {
      ticketId: fixture.ticket.id,
      code: "RE70",
      finalPrice: 70
    });

    const name = "Retomada Existente";
    const phone = `4255${Date.now().toString().slice(-7)}`;

    const first = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name,
      phone,
      discountCode: "RE70"
    });

    expect(first.status).toBe(201);

    const beforeCount = await prisma!.transaction.count({
      where: {
        churchId,
        eventId: fixture.event.id
      }
    });

    const second = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name,
      phone,
      discountCode: "RE70"
    });

    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);

    const afterCount = await prisma!.transaction.count({
      where: {
        churchId,
        eventId: fixture.event.id
      }
    });

    expect(afterCount).toBe(beforeCount);
  });

  it("isolates discount endpoints by tenant", async () => {
    const fixture = await createPaidEventFixture(
      `cross-${Date.now()}`
    );

    const created = await createDiscount(fixture.event.id, {
      ticketId: fixture.ticket.id,
      code: "TENANT70",
      finalPrice: 70
    });

    expect(created.status).toBe(201);

    const list = await request(app.server)
      .get(`/api/events/${fixture.event.id}/discounts`)
      .set("Authorization", `Bearer ${otherTenantToken}`);

    expect(list.status).toBe(404);

    const create = await request(app.server)
      .post(`/api/events/${fixture.event.id}/discounts`)
      .set("Authorization", `Bearer ${otherTenantToken}`)
      .send({
        ticketId: fixture.ticket.id,
        code: "HACK70",
        finalPrice: 70
      });

    expect(create.status).toBe(404);

    const patch = await request(app.server)
      .patch(
        `/api/events/${fixture.event.id}/discounts/${created.body.id}`
      )
      .set("Authorization", `Bearer ${otherTenantToken}`)
      .send({
        isActive: false
      });

    expect(patch.status).toBe(404);

    const stillThere = await prisma!.eventDiscount.findUnique({
      where: {
        id: created.body.id as string
      }
    });

    expect(stillThere?.isActive).toBe(true);
  });

  it("allows LEADER to manage discounts and forbids financial summary", async () => {
    const fixture = await createPaidEventFixture(
      `leader-${Date.now()}`
    );

    const created = await createDiscount(fixture.event.id, {
      ticketId: fixture.ticket.id,
      code: "LEAD70",
      finalPrice: 70,
      token: leaderToken
    });

    expect(created.status).toBe(201);

    const list = await request(app.server)
      .get(`/api/events/${fixture.event.id}/discounts`)
      .set("Authorization", `Bearer ${leaderToken}`);

    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const updated = await request(app.server)
      .patch(
        `/api/events/${fixture.event.id}/discounts/${created.body.id}`
      )
      .set("Authorization", `Bearer ${leaderToken}`)
      .send({
        isActive: false
      });

    expect(updated.status).toBe(200);
    expect(updated.body.isActive).toBe(false);

    const summary = await request(app.server)
      .get(`/api/financial/summary?eventId=${fixture.event.id}`)
      .set("Authorization", `Bearer ${leaderToken}`);

    expect(summary.status).toBe(403);
  });

  it("duplicates discounts with remapped tickets and does not copy payments", async () => {
    const fixture = await createPaidEventFixture(
      `dup-${Date.now()}`
    );

    const created = await createDiscount(fixture.event.id, {
      ticketId: fixture.ticket.id,
      code: "DUP70",
      finalPrice: 70
    });

    expect(created.status).toBe(201);

    const paid = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Pagamento Origem",
      phone: `4244${Date.now().toString().slice(-7)}`,
      discountCode: "DUP70"
    });

    expect(paid.status).toBe(201);

    const duplicatedSlug = `discount-copy-${Date.now()}`;

    const duplicated = await request(app.server)
      .post(`/api/events/${fixture.event.id}/duplicate`)
      .set("Authorization", `Bearer ${pastorToken}`)
      .send({
        title: "Evento duplicado desconto",
        slug: duplicatedSlug,
        date: "2026-12-01T20:00:00.000Z"
      });

    expect(duplicated.status).toBe(201);
    createdEventIds.push(duplicated.body.id as string);

    const copiedDiscounts = await prisma!.eventDiscount.findMany({
      where: {
        eventId: duplicated.body.id as string,
        churchId
      }
    });

    expect(copiedDiscounts).toHaveLength(1);
    expect(copiedDiscounts[0]?.id).not.toBe(created.body.id);
    expect(copiedDiscounts[0]?.code).toBe("DUP70");
    expect(copiedDiscounts[0]?.ticketId).not.toBe(fixture.ticket.id);
    expect(Number(copiedDiscounts[0]?.finalPrice)).toBe(70);

    const copiedPayments = await prisma!.eventPayment.findMany({
      where: {
        eventId: duplicated.body.id as string,
        churchId
      }
    });

    expect(copiedPayments).toHaveLength(0);

    const sourcePayments = await prisma!.eventPayment.findMany({
      where: {
        eventId: fixture.event.id,
        churchId
      }
    });

    expect(sourcePayments.length).toBeGreaterThan(0);
  });

  it("rejects duplicate discount codes on the same event with 409", async () => {
    const fixture = await createPaidEventFixture(
      `conflict-${Date.now()}`
    );

    const first = await createDiscount(fixture.event.id, {
      ticketId: fixture.ticket.id,
      code: "SAME70",
      finalPrice: 70
    });

    expect(first.status).toBe(201);

    const second = await createDiscount(fixture.event.id, {
      ticketId: fixture.extraTicket.id,
      code: "same70",
      finalPrice: 60
    });

    expect(second.status).toBe(409);
    expect(second.body.error).toBe("DISCOUNT_CODE_ALREADY_EXISTS");
  });
});
