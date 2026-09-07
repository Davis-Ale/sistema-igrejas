import { Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@sistema-igrejas/database";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { buildApp } from "../src/app.js";

describe("Event platform fee E2E", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient | null = null;
  let pastorToken = "";
  let otherTenantToken = "";
  let churchId = "";
  let churchSlug = "";
  let campusId = "";
  let personId = "";
  const createdEventIds: string[] = [];
  const createdTransactionIds: string[] = [];
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
        const payments = await prisma.eventPayment.findMany({
          where: {
            eventId: {
              in: createdEventIds
            }
          },
          select: {
            transactionId: true
          }
        });

        const paymentTransactionIds = payments.map(
          (payment) => payment.transactionId
        );

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
            OR: [
              {
                id: {
                  in: [
                    ...createdTransactionIds,
                    ...paymentTransactionIds
                  ]
                }
              },
              {
                eventId: {
                  in: createdEventIds
                }
              }
            ]
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

  async function createPaidEventFixture(suffix: string) {
    const event = await prisma!.event.create({
      data: {
        churchId,
        campusId,
        title: `Fee Event ${suffix}`,
        slug: `fee-event-${suffix}`,
        date: new Date("2026-10-01T20:00:00.000Z"),
        capacity: 200,
        price: 100,
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

    const now = Date.now();
    const batch = await prisma!.ticketBatch.create({
      data: {
        churchId,
        eventId: event.id,
        ticketId: ticket.id,
        name: `Lote ${suffix}`,
        quantity: 200,
        price: 100,
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

  it("charges list price with default 10% fee and matching transaction amount", async () => {
    await prisma!.church.update({
      where: {
        id: churchId
      },
      data: {
        platformFeePercent: null
      }
    });

    const fixture = await createPaidEventFixture(
      `default-${Date.now()}`
    );

    const response = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Participante Default",
      phone: `4199${Date.now().toString().slice(-7)}`
    });

    expect(response.status).toBe(201);
    expect(response.body.paymentId).toBeTruthy();

    const payment = await prisma!.eventPayment.findFirst({
      where: {
        id: response.body.paymentId as string,
        churchId,
        eventId: fixture.event.id
      },
      include: {
        transaction: true,
        order: true
      }
    });

    expect(payment).not.toBeNull();
    expect(Number(payment!.amount)).toBe(100);
    expect(Number(payment!.platformFeePercent)).toBe(10);
    expect(Number(payment!.platformFeeAmount)).toBe(10);
    expect(Number(payment!.netAmount)).toBe(90);
    expect(Number(payment!.transaction.amount)).toBe(100);
    expect(Number(payment!.order.totalAmount)).toBe(100);
    expect(Number(payment!.transaction.amount)).toBe(
      Number(payment!.amount)
    );
    expect(payment!.discountId).toBeNull();
  });

  it("uses church override 7% on new sales and keeps previous 10% snapshot", async () => {
    const fixture = await createPaidEventFixture(
      `override-${Date.now()}`
    );

    await prisma!.church.update({
      where: {
        id: churchId
      },
      data: {
        platformFeePercent: null
      }
    });

    const first = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Participante Dez",
      phone: `4188${Date.now().toString().slice(-7)}`
    });

    expect(first.status).toBe(201);

    await prisma!.church.update({
      where: {
        id: churchId
      },
      data: {
        platformFeePercent: new Prisma.Decimal("7.00")
      }
    });

    const second = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Participante Sete",
      phone: `4177${Date.now().toString().slice(-7)}`
    });

    expect(second.status).toBe(201);

    const [firstPayment, secondPayment] = await Promise.all([
      prisma!.eventPayment.findUnique({
        where: {
          id: first.body.paymentId as string
        }
      }),
      prisma!.eventPayment.findUnique({
        where: {
          id: second.body.paymentId as string
        }
      })
    ]);

    expect(Number(firstPayment!.platformFeePercent)).toBe(10);
    expect(Number(firstPayment!.platformFeeAmount)).toBe(10);
    expect(Number(firstPayment!.netAmount)).toBe(90);
    expect(Number(secondPayment!.platformFeePercent)).toBe(7);
    expect(Number(secondPayment!.platformFeeAmount)).toBe(7);
    expect(Number(secondPayment!.netAmount)).toBe(93);
  });

  it("summary currentPlatformFeePercent uses 7.9% override without rewriting snapshots", async () => {
    await prisma!.church.update({
      where: {
        id: churchId
      },
      data: {
        platformFeePercent: null
      }
    });

    const fixture = await createPaidEventFixture(
      `current-fee-${Date.now()}`
    );

    const response = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Participante Atual",
      phone: `4133${Date.now().toString().slice(-7)}`
    });

    expect(response.status).toBe(201);

    await prisma!.eventPayment.update({
      where: {
        id: response.body.paymentId as string
      },
      data: {
        status: "PAID"
      }
    });

    const beforeOverride = await request(app.server)
      .get(`/api/financial/summary?eventId=${fixture.event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(beforeOverride.status).toBe(200);
    expect(Number(beforeOverride.body.eventSales.grossAmount)).toBe(100);
    expect(Number(beforeOverride.body.eventSales.platformFeeAmount)).toBe(10);
    expect(Number(beforeOverride.body.eventSales.netAmount)).toBe(90);
    expect(
      Number(beforeOverride.body.eventSales.currentPlatformFeePercent)
    ).toBe(10);

    await prisma!.church.update({
      where: {
        id: churchId
      },
      data: {
        platformFeePercent: new Prisma.Decimal("7.9")
      }
    });

    const afterOverride = await request(app.server)
      .get(`/api/financial/summary?eventId=${fixture.event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(afterOverride.status).toBe(200);
    expect(Number(afterOverride.body.eventSales.grossAmount)).toBe(100);
    expect(Number(afterOverride.body.eventSales.platformFeeAmount)).toBe(10);
    expect(Number(afterOverride.body.eventSales.netAmount)).toBe(90);
    expect(
      Number(afterOverride.body.eventSales.currentPlatformFeePercent)
    ).toBe(7.9);

    const payment = await prisma!.eventPayment.findUnique({
      where: {
        id: response.body.paymentId as string
      }
    });

    expect(Number(payment!.platformFeePercent)).toBe(10);
    expect(Number(payment!.platformFeeAmount)).toBe(10);
    expect(Number(payment!.netAmount)).toBe(90);
  });

  it("uses default 10% when church platformFeePercent is null", async () => {
    await prisma!.church.update({
      where: {
        id: churchId
      },
      data: {
        platformFeePercent: null
      }
    });

    const fixture = await createPaidEventFixture(
      `null-${Date.now()}`
    );

    const response = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Participante Nulo",
      phone: `4166${Date.now().toString().slice(-7)}`
    });

    expect(response.status).toBe(201);

    const payment = await prisma!.eventPayment.findUnique({
      where: {
        id: response.body.paymentId as string
      }
    });

    expect(Number(payment!.platformFeePercent)).toBe(10);
    expect(Number(payment!.platformFeeAmount)).toBe(10);
    expect(Number(payment!.netAmount)).toBe(90);
  });

  it("summary eventSales ignores pending, null snapshot and event transactions without payment", async () => {
    await prisma!.church.update({
      where: {
        id: churchId
      },
      data: {
        platformFeePercent: null
      }
    });

    const fixture = await createPaidEventFixture(
      `summary-${Date.now()}`
    );

    const paidRegistration = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Pago Summary",
      phone: `4155${Date.now().toString().slice(-7)}`
    });

    expect(paidRegistration.status).toBe(201);

    await prisma!.eventPayment.update({
      where: {
        id: paidRegistration.body.paymentId as string
      },
      data: {
        status: "PAID"
      }
    });

    const pendingRegistration = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Pendente Summary",
      phone: `4144${Date.now().toString().slice(-7)}`
    });

    expect(pendingRegistration.status).toBe(201);

    const nullSnapshotOrder = await prisma!.eventOrder.create({
      data: {
        churchId,
        eventId: fixture.event.id,
        status: "PAID",
        totalAmount: 50
      }
    });

    const nullSnapshotTransaction = await prisma!.transaction.create({
      data: {
        churchId,
        campusId,
        eventId: fixture.event.id,
        type: "EVENT",
        direction: "IN",
        amount: 50,
        method: "PIX",
        costCenter: "EVENTOS",
        status: "ACTIVE"
      }
    });

    createdTransactionIds.push(nullSnapshotTransaction.id);

    await prisma!.eventPayment.create({
      data: {
        churchId,
        eventId: fixture.event.id,
        orderId: nullSnapshotOrder.id,
        transactionId: nullSnapshotTransaction.id,
        provider: "TEST",
        status: "PAID",
        amount: 50
      }
    });

    const orphanTransaction = await prisma!.transaction.create({
      data: {
        churchId,
        campusId,
        eventId: fixture.event.id,
        type: "EVENT",
        direction: "IN",
        amount: 25,
        method: "PIX",
        costCenter: "EVENTOS",
        status: "ACTIVE"
      }
    });

    createdTransactionIds.push(orphanTransaction.id);

    const summaryResponse = await request(app.server)
      .get(`/api/financial/summary?eventId=${fixture.event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body).toHaveProperty("income");
    expect(summaryResponse.body).toHaveProperty("expense");
    expect(summaryResponse.body.eventSales).toEqual({
      grossAmount: expect.anything(),
      platformFeeAmount: expect.anything(),
      netAmount: expect.anything(),
      currentPlatformFeePercent: expect.anything()
    });
    expect(Number(summaryResponse.body.eventSales.grossAmount)).toBe(100);
    expect(Number(summaryResponse.body.eventSales.platformFeeAmount)).toBe(10);
    expect(Number(summaryResponse.body.eventSales.netAmount)).toBe(90);
    expect(
      Number(summaryResponse.body.eventSales.currentPlatformFeePercent)
    ).toBe(10);
    expect(Number(summaryResponse.body.income)).toBeGreaterThanOrEqual(0);
    expect(Number(summaryResponse.body.expense)).toBeGreaterThanOrEqual(0);
  });

  it("keeps FINANCEIRO-2 listing contract for page, limit, filters, search and recency", async () => {
    const fixture = await createPaidEventFixture(
      `list-${Date.now()}`
    );
    const suffix = Date.now().toString();

    const firstAt = new Date("2026-08-01T10:00:00.000Z");
    const secondAt = new Date("2026-08-02T10:00:00.000Z");

    const older = await prisma!.transaction.create({
      data: {
        churchId,
        campusId,
        eventId: fixture.event.id,
        type: "EVENT",
        direction: "IN",
        amount: 40,
        method: "PIX",
        costCenter: "EVENTOS",
        status: "ACTIVE",
        at: firstAt
      }
    });

    const newer = await prisma!.transaction.create({
      data: {
        churchId,
        campusId,
        personId,
        eventId: fixture.event.id,
        type: "EVENT",
        direction: "IN",
        amount: 80,
        method: "CARD",
        costCenter: "EVENTOS",
        status: "ACTIVE",
        at: secondAt
      }
    });

    createdTransactionIds.push(older.id, newer.id);

    const extraIds: string[] = [];

    for (let index = 0; index < 51; index += 1) {
      const created = await prisma!.transaction.create({
        data: {
          churchId,
          campusId,
          eventId: fixture.event.id,
          type: "EVENT",
          direction: "IN",
          amount: 1,
          method: "PIX",
          costCenter: "EVENTOS",
          status: "ACTIVE",
          at: new Date(firstAt.getTime() - (index + 1) * 1000)
        }
      });

      extraIds.push(created.id);
    }

    createdTransactionIds.push(...extraIds);

    const page50 = await request(app.server)
      .get(
        `/api/financial/transactions?eventId=${fixture.event.id}&page=1&limit=50`
      )
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(page50.status).toBe(200);
    expect(page50.body.items).toHaveLength(50);
    expect(page50.body.pagination).toMatchObject({
      page: 1,
      currentPage: 1,
      limit: 50
    });
    expect(page50.body.pagination.total).toBeGreaterThanOrEqual(53);

    const page100 = await request(app.server)
      .get(
        `/api/financial/transactions?eventId=${fixture.event.id}&page=1&limit=100`
      )
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(page100.status).toBe(200);
    expect(page100.body.items.length).toBeGreaterThan(50);
    expect(page100.body.pagination.limit).toBe(100);
    expect(page100.body.items[0].id).toBe(newer.id);

    const methodFilter = await request(app.server)
      .get(
        `/api/financial/transactions?eventId=${fixture.event.id}&page=1&limit=50&method=CARD`
      )
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(methodFilter.status).toBe(200);
    expect(
      methodFilter.body.items.every(
        (item: { method: string }) => item.method === "CARD"
      )
    ).toBe(true);

    const search = await request(app.server)
      .get(
        `/api/financial/transactions?eventId=${fixture.event.id}&page=1&limit=50&search=${suffix}`
      )
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(search.status).toBe(200);

    const paymentStatus = await request(app.server)
      .get(
        `/api/financial/transactions?eventId=${fixture.event.id}&page=1&limit=50&paymentStatus=NO_CHARGE`
      )
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(paymentStatus.status).toBe(200);
    expect(
      paymentStatus.body.items.every(
        (item: { eventPayment: unknown }) => item.eventPayment === null
      )
    ).toBe(true);
  });

  it("does not rewrite snapshot on cancel or reverse and excludes them from cards", async () => {
    await prisma!.church.update({
      where: {
        id: churchId
      },
      data: {
        platformFeePercent: null
      }
    });

    const fixture = await createPaidEventFixture(
      `control-${Date.now()}`
    );

    const created = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Controle Snapshot",
      phone: `4133${Date.now().toString().slice(-7)}`
    });

    expect(created.status).toBe(201);

    const paymentId = created.body.paymentId as string;

    await prisma!.eventPayment.update({
      where: {
        id: paymentId
      },
      data: {
        status: "PAID"
      }
    });

    const before = await prisma!.eventPayment.findUnique({
      where: {
        id: paymentId
      }
    });

    const cancelResponse = await request(app.server)
      .post(
        `/api/financial/transactions/${before!.transactionId}/cancel`
      )
      .set("Authorization", `Bearer ${pastorToken}`)
      .send({
        reason: "Cancelamento E2E de taxa."
      });

    expect(cancelResponse.status).toBe(200);

    const afterCancel = await prisma!.eventPayment.findUnique({
      where: {
        id: paymentId
      }
    });

    expect(Number(afterCancel!.platformFeePercent)).toBe(
      Number(before!.platformFeePercent)
    );
    expect(Number(afterCancel!.platformFeeAmount)).toBe(
      Number(before!.platformFeeAmount)
    );
    expect(Number(afterCancel!.netAmount)).toBe(Number(before!.netAmount));
    expect(Number(afterCancel!.amount)).toBe(Number(before!.amount));

    const reverseFixture = await createPaidEventFixture(
      `reverse-${Date.now()}`
    );

    const reverseCreated = await registerPublic({
      eventSlug: reverseFixture.event.slug,
      ticketId: reverseFixture.ticket.id,
      ticketBatchId: reverseFixture.batch.id,
      name: "Reverse Snapshot",
      phone: `4122${Date.now().toString().slice(-7)}`
    });

    expect(reverseCreated.status).toBe(201);

    const reversePaymentId = reverseCreated.body.paymentId as string;

    await prisma!.eventPayment.update({
      where: {
        id: reversePaymentId
      },
      data: {
        status: "PAID"
      }
    });

    const reverseBefore = await prisma!.eventPayment.findUnique({
      where: {
        id: reversePaymentId
      }
    });

    const reverseResponse = await request(app.server)
      .post(
        `/api/financial/transactions/${reverseBefore!.transactionId}/reverse`
      )
      .set("Authorization", `Bearer ${pastorToken}`)
      .send({
        reason: "Estorno E2E de taxa."
      });

    expect(reverseResponse.status).toBe(200);

    const reverseAfter = await prisma!.eventPayment.findUnique({
      where: {
        id: reversePaymentId
      }
    });

    expect(Number(reverseAfter!.platformFeePercent)).toBe(
      Number(reverseBefore!.platformFeePercent)
    );
    expect(Number(reverseAfter!.platformFeeAmount)).toBe(
      Number(reverseBefore!.platformFeeAmount)
    );
    expect(Number(reverseAfter!.netAmount)).toBe(
      Number(reverseBefore!.netAmount)
    );

    const cancelledSummary = await request(app.server)
      .get(`/api/financial/summary?eventId=${fixture.event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(cancelledSummary.status).toBe(200);
    expect(Number(cancelledSummary.body.eventSales.grossAmount)).toBe(0);

    const reversedSummary = await request(app.server)
      .get(`/api/financial/summary?eventId=${reverseFixture.event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(reversedSummary.status).toBe(200);
    expect(Number(reversedSummary.body.eventSales.grossAmount)).toBe(0);
  });

  it("does not leak event sales across tenants", async () => {
    const fixture = await createPaidEventFixture(
      `tenant-${Date.now()}`
    );

    const created = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Tenant Isolation",
      phone: `4111${Date.now().toString().slice(-7)}`
    });

    expect(created.status).toBe(201);

    await prisma!.eventPayment.update({
      where: {
        id: created.body.paymentId as string
      },
      data: {
        status: "PAID"
      }
    });

    const otherSummary = await request(app.server)
      .get(`/api/financial/summary?eventId=${fixture.event.id}`)
      .set("Authorization", `Bearer ${otherTenantToken}`);

    expect(otherSummary.status).toBe(200);
    expect(Number(otherSummary.body.eventSales.grossAmount)).toBe(0);
    expect(Number(otherSummary.body.eventSales.platformFeeAmount)).toBe(0);
    expect(Number(otherSummary.body.eventSales.netAmount)).toBe(0);

    const otherList = await request(app.server)
      .get(
        `/api/financial/transactions?eventId=${fixture.event.id}&page=1&limit=50`
      )
      .set("Authorization", `Bearer ${otherTenantToken}`);

    expect(otherList.status).toBe(200);
    expect(otherList.body.items).toEqual([]);
  });
});
