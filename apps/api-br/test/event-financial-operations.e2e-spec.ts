import { Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@sistema-igrejas/database";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { buildApp } from "../src/app.js";

describe("Event financial operations E2E", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient | null = null;
  let pastorToken = "";
  let leaderToken = "";
  let superAdminToken = "";
  let otherTenantToken = "";
  let churchId = "";
  let churchSlug = "";
  let campusId = "";
  let personId = "";
  let actorUserId = "";
  let isolatedChurchId = "";
  const createdEventIds: string[] = [];
  const originalFetch = global.fetch;
  const webhookToken = "e2e-asaas-webhook-token";

  beforeAll(async () => {
    process.env.EVENTS_TEST_PAYMENT_MODE = "pending";
    process.env.ASAAS_API_KEY =
      process.env.ASAAS_API_KEY || "e2e-asaas-test-key";
    process.env.ASAAS_WEBHOOK_TOKEN = webhookToken;

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
    actorUserId = loginResponse.body.user.id as string;
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

    superAdminToken = await app.jwt.sign({
      userId: actorUserId,
      churchId,
      role: "SUPER_ADMIN"
    });

    leaderToken = await app.jwt.sign({
      userId: personId,
      churchId,
      role: "LEADER"
    });

    const isolatedChurch = await prisma.church.create({
      data: {
        name: `E2E Ops Financeiras ${Date.now()}`,
        slug: `e2e-ops-financeiras-${Date.now()}`,
        plan: "TRIAL",
        status: "ACTIVE"
      }
    });
    isolatedChurchId = isolatedChurch.id;

    otherTenantToken = await app.jwt.sign({
      userId: actorUserId,
      churchId: isolatedChurchId,
      role: "SUPER_ADMIN"
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(async () => {
    global.fetch = originalFetch;

    if (prisma) {
      if (createdEventIds.length > 0) {
        const payments = await prisma.eventPayment.findMany({
          where: {
            eventId: {
              in: createdEventIds
            }
          },
          select: {
            id: true,
            transactionId: true
          }
        });
        const paymentIds = payments.map((payment) => payment.id);
        const paymentTransactionIds = payments.map(
          (payment) => payment.transactionId
        );

        if (paymentIds.length > 0) {
          const operations = await prisma.eventsFinancialOperation.findMany({
            where: {
              eventPaymentId: {
                in: paymentIds
              }
            },
            select: {
              id: true
            }
          });
          const operationIds = operations.map((row) => row.id);

          if (operationIds.length > 0) {
            await prisma.eventsFinancialOperationAudit.deleteMany({
              where: {
                operationId: {
                  in: operationIds
                }
              }
            });
            await prisma.eventsFinancialOperation.deleteMany({
              where: {
                id: {
                  in: operationIds
                }
              }
            });
          }
        }

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
                  in: paymentTransactionIds
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

      if (isolatedChurchId) {
        await prisma.church.delete({
          where: {
            id: isolatedChurchId
          }
        });
      }

      await prisma.$disconnect();
    }

    await app.close();
  });

  function mockAsaas(options?: {
    refundStatus?: "REFUNDED" | "PENDING";
    paymentStatus?: "REFUNDED" | "PENDING" | "RECEIVED";
    failRefund?: boolean;
    timeout?: boolean;
  }) {
    const refundStatus = options?.refundStatus ?? "REFUNDED";
    const paymentStatus =
      options?.paymentStatus ??
      (options?.failRefund ? "RECEIVED" : refundStatus);
    let refundCalls = 0;

    const fetchMock = jest.fn(async (input: unknown, init?: RequestInit) => {
        const href = String(input);

        if (options?.timeout) {
          throw new Error("ASAAS_TIMEOUT");
        }

        if (href.includes("/refund")) {
          refundCalls += 1;

          if (options?.failRefund) {
            return new Response(
              JSON.stringify({
                errors: [{ description: "refund failed" }]
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" }
              }
            );
          }

          return new Response(
            JSON.stringify({
              id: "pay_e2e_refund",
              status: refundStatus
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        if (href.includes("/payments/")) {
          return new Response(
            JSON.stringify({
              id: "pay_e2e_refund",
              billingType: "PIX",
              customer: "cus_e2e",
              dueDate: "2026-09-11",
              status: paymentStatus,
              value: 100
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        throw new Error(`Unexpected fetch: ${href} ${init?.method ?? ""}`);
      }
    );

    global.fetch = fetchMock as unknown as typeof fetch;

    return {
      fetchMock,
      getRefundCalls: () => refundCalls
    };
  }

  async function createPaidEventFixture(suffix: string) {
    const event = await prisma!.event.create({
      data: {
        churchId,
        campusId,
        title: `Ops Event ${suffix}`,
        slug: `ops-event-${suffix}`,
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

    return { event, ticket, batch };
  }

  async function registerPublic(input: {
    eventSlug: string;
    ticketId: string;
    ticketBatchId: string;
    name: string;
    phone: string;
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
        paymentMethod: "PIX"
      });
  }

  async function markAsaasPaid(paymentId: string, providerPaymentId: string) {
    const payment = await prisma!.eventPayment.findUnique({
      where: {
        id: paymentId
      },
      select: {
        transactionId: true,
        amount: true,
        platformFeePercent: true,
        platformFeeAmount: true,
        netAmount: true
      }
    });

    expect(payment).not.toBeNull();

    await prisma!.eventPayment.update({
      where: {
        id: paymentId
      },
      data: {
        provider: "ASAAS",
        providerPaymentId,
        status: "PAID"
      }
    });

    await prisma!.transaction.update({
      where: {
        id: payment!.transactionId
      },
      data: {
        asaasId: providerPaymentId,
        status: "ACTIVE"
      }
    });

    return payment!;
  }

  it("blocks pastor and leader from administrative refund", async () => {
    const fixture = await createPaidEventFixture(`rbac-${Date.now()}`);
    const created = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "RBAC Estorno",
      phone: `4181${Date.now().toString().slice(-7)}`
    });

    expect(created.status).toBe(201);
    const payment = await markAsaasPaid(
      created.body.paymentId as string,
      `pay_rbac_${Date.now()}`
    );

    const pastorResponse = await request(app.server)
      .post("/api/events/financial/operations/refunds")
      .set("Authorization", `Bearer ${pastorToken}`)
      .send({
        transactionId: payment.transactionId
      });

    expect(pastorResponse.status).toBe(403);
    expect(pastorResponse.body.error).toBe("FINANCIAL_OPERATION_DENIED");

    const leaderResponse = await request(app.server)
      .post("/api/events/financial/operations/refunds")
      .set("Authorization", `Bearer ${leaderToken}`)
      .send({
        transactionId: payment.transactionId
      });

    expect(leaderResponse.status).toBe(403);
  });

  it("blocks cross-tenant refund of another church payment", async () => {
    const fixture = await createPaidEventFixture(`xtenant-${Date.now()}`);
    const created = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Cross Tenant",
      phone: `4182${Date.now().toString().slice(-7)}`
    });

    expect(created.status).toBe(201);
    const payment = await markAsaasPaid(
      created.body.paymentId as string,
      `pay_xtenant_${Date.now()}`
    );

    const response = await request(app.server)
      .post("/api/events/financial/operations/refunds")
      .set("Authorization", `Bearer ${otherTenantToken}`)
      .send({
        transactionId: payment.transactionId
      });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("EVENT_PAYMENT_NOT_FOUND");
  });

  it("refunds a paid Asaas charge with backend amount, audit and snapshot preserved", async () => {
    const asaas = mockAsaas({ refundStatus: "REFUNDED" });
    const fixture = await createPaidEventFixture(`ok-${Date.now()}`);
    const created = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Estorno Ok",
      phone: `4183${Date.now().toString().slice(-7)}`
    });

    expect(created.status).toBe(201);
    const before = await markAsaasPaid(
      created.body.paymentId as string,
      `pay_ok_${Date.now()}`
    );

    const response = await request(app.server)
      .post("/api/events/financial/operations/refunds")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        transactionId: before.transactionId,
        amount: 1
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("CONFIRMED");
    expect(response.body.amount).toBe(100);
    expect(response.body).not.toHaveProperty("providerPaymentId");
    expect(response.body).not.toHaveProperty("asaasId");
    expect(JSON.stringify(response.body)).not.toContain("e2e-asaas-test-key");
    expect(asaas.getRefundCalls()).toBe(1);

    const refundRequest = asaas.fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/refund")
    );
    const refundHeaders = refundRequest?.[1]?.headers as
      | Record<string, string>
      | undefined;
    expect(refundHeaders?.["Asaas-Idempotency-Key"]).toBe(
      `events-refund:${churchId}:${created.body.paymentId}`
    );

    const after = await prisma!.eventPayment.findUnique({
      where: {
        id: created.body.paymentId as string
      }
    });

    expect(after?.status).toBe("CANCELLED");
    expect(Number(after!.amount)).toBe(Number(before.amount));
    expect(Number(after!.platformFeePercent)).toBe(
      Number(before.platformFeePercent)
    );
    expect(Number(after!.platformFeeAmount)).toBe(
      Number(before.platformFeeAmount)
    );
    expect(Number(after!.netAmount)).toBe(Number(before.netAmount));

    const transaction = await prisma!.transaction.findUnique({
      where: {
        id: before.transactionId
      }
    });
    expect(transaction?.status).toBe("REVERSED");

    const audits = await prisma!.eventsFinancialOperationAudit.findMany({
      where: {
        churchId,
        operationId: response.body.id as string
      }
    });
    expect(audits.length).toBeGreaterThan(0);
    expect(JSON.stringify(audits)).not.toContain("accountNumber");
    expect(JSON.stringify(audits)).not.toContain("holderDocument");

    const summary = await request(app.server)
      .get(`/api/events/financial/summary?eventId=${fixture.event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(summary.status).toBe(200);
    expect(Number(summary.body.eventSales.grossAmount)).toBe(0);
    expect(summary.body.counts.reversed).toBeGreaterThanOrEqual(1);
  });

  it("is idempotent on repeated refund of the same payment", async () => {
    const asaas = mockAsaas({ refundStatus: "REFUNDED" });
    const fixture = await createPaidEventFixture(`idem-${Date.now()}`);
    const created = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Estorno Idem",
      phone: `4184${Date.now().toString().slice(-7)}`
    });

    expect(created.status).toBe(201);
    const payment = await markAsaasPaid(
      created.body.paymentId as string,
      `pay_idem_${Date.now()}`
    );

    const first = await request(app.server)
      .post("/api/events/financial/operations/refunds")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        transactionId: payment.transactionId
      });

    const second = await request(app.server)
      .post("/api/events/financial/operations/refunds")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        transactionId: payment.transactionId
      });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(asaas.getRefundCalls()).toBe(1);

    const operations = await prisma!.eventsFinancialOperation.findMany({
      where: {
        churchId,
        eventPaymentId: created.body.paymentId as string
      }
    });
    expect(operations).toHaveLength(1);
  });

  it("resumes a REQUESTED refund that never reached the provider", async () => {
    const asaas = mockAsaas({ refundStatus: "REFUNDED" });
    const fixture = await createPaidEventFixture(`resume-${Date.now()}`);
    const created = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Estorno Resume",
      phone: `4188${Date.now().toString().slice(-7)}`
    });

    expect(created.status).toBe(201);
    const payment = await markAsaasPaid(
      created.body.paymentId as string,
      `pay_resume_${Date.now()}`
    );

    await prisma!.eventPayment.update({
      where: {
        id: created.body.paymentId as string
      },
      data: {
        status: "REFUND_PENDING"
      }
    });

    await prisma!.eventsFinancialOperation.create({
      data: {
        churchId,
        type: "REFUND",
        status: "REQUESTED",
        eventPaymentId: created.body.paymentId as string,
        transactionId: payment.transactionId,
        amount: payment.amount,
        currency: "BRL",
        provider: "ASAAS",
        actorUserId,
        actorRole: "SUPER_ADMIN"
      }
    });

    const resumed = await request(app.server)
      .post("/api/events/financial/operations/refunds")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        transactionId: payment.transactionId
      });

    expect(resumed.status).toBe(200);
    expect(resumed.body.status).toBe("CONFIRMED");
    expect(asaas.getRefundCalls()).toBe(1);
  });

  it("rejects TEST provider, missing provider id and non-positive amount", async () => {
    const fixture = await createPaidEventFixture(`invalid-${Date.now()}`);
    const created = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Estorno Invalido",
      phone: `4185${Date.now().toString().slice(-7)}`
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

    const testProvider = await prisma!.eventPayment.findUnique({
      where: {
        id: created.body.paymentId as string
      }
    });

    const testResponse = await request(app.server)
      .post("/api/events/financial/operations/refunds")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        transactionId: testProvider!.transactionId
      });

    expect(testResponse.status).toBe(409);

    await prisma!.eventPayment.update({
      where: {
        id: created.body.paymentId as string
      },
      data: {
        provider: "ASAAS",
        providerPaymentId: `pay_zero_${Date.now()}`,
        amount: new Prisma.Decimal(0),
        status: "PAID"
      }
    });

    const zeroResponse = await request(app.server)
      .post("/api/events/financial/operations/refunds")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        transactionId: testProvider!.transactionId
      });

    expect(zeroResponse.status).toBe(409);
    expect(zeroResponse.body.error).toBe("EVENT_PAYMENT_NOT_REFUNDABLE");
  });

  it("marks FAILED and restores PAID when the provider errors or times out", async () => {
    mockAsaas({ failRefund: true });
    const fixture = await createPaidEventFixture(`fail-${Date.now()}`);
    const created = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Estorno Falha",
      phone: `4186${Date.now().toString().slice(-7)}`
    });

    expect(created.status).toBe(201);
    const payment = await markAsaasPaid(
      created.body.paymentId as string,
      `pay_fail_${Date.now()}`
    );

    const failed = await request(app.server)
      .post("/api/events/financial/operations/refunds")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        transactionId: payment.transactionId
      });

    expect(failed.status).toBe(502);

    const afterFail = await prisma!.eventPayment.findUnique({
      where: {
        id: created.body.paymentId as string
      }
    });
    expect(afterFail?.status).toBe("PAID");

    mockAsaas({ timeout: true });

    const timedOut = await request(app.server)
      .post("/api/events/financial/operations/refunds")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        transactionId: payment.transactionId
      });

    expect(timedOut.status).toBe(502);

    const afterTimeout = await prisma!.eventPayment.findUnique({
      where: {
        id: created.body.paymentId as string
      }
    });
    expect(afterTimeout?.status).toBe("PAID");
  });

  it("completes a pending provider refund via authenticated idempotent webhook", async () => {
    mockAsaas({ refundStatus: "PENDING" });
    const fixture = await createPaidEventFixture(`wh-${Date.now()}`);
    const created = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Estorno Webhook",
      phone: `4187${Date.now().toString().slice(-7)}`
    });

    expect(created.status).toBe(201);
    const providerPaymentId = `pay_wh_${Date.now()}`;
    const payment = await markAsaasPaid(
      created.body.paymentId as string,
      providerPaymentId
    );

    const pending = await request(app.server)
      .post("/api/events/financial/operations/refunds")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        transactionId: payment.transactionId
      });

    expect(pending.status).toBe(200);
    expect(pending.body.status).toBe("PENDING");

    const unauthorized = await request(app.server)
      .post("/webhooks/asaas")
      .send({
        event: "PAYMENT_REFUNDED",
        payment: {
          id: providerPaymentId,
          status: "REFUNDED",
          externalReference: `${churchId}:${created.body.paymentId}:payment`
        }
      });
    expect(unauthorized.status).toBe(401);

    const webhookBody = {
      event: "PAYMENT_REFUNDED",
      payment: {
        id: providerPaymentId,
        status: "REFUNDED",
        externalReference: `${churchId}:${created.body.paymentId}:payment`
      }
    };

    const firstWebhook = await request(app.server)
      .post("/webhooks/asaas")
      .set("asaas-access-token", webhookToken)
      .send(webhookBody);

    const secondWebhook = await request(app.server)
      .post("/webhooks/asaas")
      .set("asaas-access-token", webhookToken)
      .send(webhookBody);

    expect(firstWebhook.status).toBe(200);
    expect(secondWebhook.status).toBe(200);

    const operation = await prisma!.eventsFinancialOperation.findFirst({
      where: {
        id: pending.body.id as string
      }
    });
    expect(operation?.status).toBe("CONFIRMED");

    const transaction = await prisma!.transaction.findUnique({
      where: {
        id: payment.transactionId
      }
    });
    expect(transaction?.status).toBe("REVERSED");

    const reversals = await prisma!.transaction.findMany({
      where: {
        churchId,
        eventId: fixture.event.id,
        direction: "OUT"
      }
    });
    expect(reversals).toHaveLength(1);
  });

  it("lists refundable charges and operations without leaking secrets", async () => {
    const list = await request(app.server)
      .get("/api/events/financial/operations?page=1&limit=50")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(list.status).toBe(200);
    expect(list.body.canCreate).toBe(false);
    expect(list.body.pagination.limit).toBe(50);
    expect(JSON.stringify(list.body)).not.toContain("e2e-asaas-test-key");
    expect(JSON.stringify(list.body)).not.toContain("access_token");

    const refundable = await request(app.server)
      .get("/api/events/financial/operations/refundable?page=1&limit=50")
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(refundable.status).toBe(200);
    expect(refundable.body.canCreate).toBe(true);
    expect(refundable.body.items[0] ?? {}).not.toHaveProperty(
      "providerPaymentId"
    );

    const otherList = await request(app.server)
      .get("/api/events/financial/operations?page=1&limit=50")
      .set("Authorization", `Bearer ${otherTenantToken}`);

    expect(otherList.status).toBe(200);
    expect(otherList.body.items).toEqual([]);
  });
});
