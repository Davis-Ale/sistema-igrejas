import { Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@sistema-igrejas/database";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { buildApp } from "../src/app.js";

describe("Event delete E2E", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient | null = null;
  let pastorToken = "";
  let leaderToken = "";
  let otherTenantToken = "";
  let churchId = "";
  let personId = "";
  const createdEventIds: string[] = [];
  const createdTransactionIds: string[] = [];
  const runId = `delete-${Date.now()}`;

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

    const otherChurch = await prisma.church.create({
      data: {
        name: `Igreja Delete ${runId}`,
        slug: `igreja-delete-${runId}`,
        plan: "TRIAL",
        status: "ACTIVE"
      }
    });

    otherTenantToken = await app.jwt.sign({
      userId: personId,
      churchId: otherChurch.id,
      role: "SUPER_ADMIN"
    });
  });

  afterAll(async () => {
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

        await prisma.eventsFinancialOperation.deleteMany({
          where: {
            eventPaymentId: {
              in: payments.map((payment) => payment.id)
            }
          }
        });

        await prisma.eventFormAnswer.deleteMany({
          where: {
            eventId: {
              in: createdEventIds
            }
          }
        });

        await prisma.registration.deleteMany({
          where: {
            eventId: {
              in: createdEventIds
            }
          }
        });

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
                    ...payments.map((payment) => payment.transactionId)
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

        await prisma.eventDiscount.deleteMany({
          where: {
            eventId: {
              in: createdEventIds
            }
          }
        });

        await prisma.eventFormField.deleteMany({
          where: {
            eventId: {
              in: createdEventIds
            }
          }
        });

        await prisma.ticketBatch.deleteMany({
          where: {
            eventId: {
              in: createdEventIds
            }
          }
        });

        await prisma.eventTicket.deleteMany({
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

      await prisma.church.deleteMany({
        where: {
          slug: `igreja-delete-${runId}`
        }
      });

      await prisma.$disconnect();
    }

    await app.close();
  });

  async function createEmptyEvent(suffix: string) {
    const event = await prisma!.event.create({
      data: {
        churchId,
        title: `Delete Empty ${suffix}`,
        slug: `delete-empty-${suffix}`,
        date: new Date("2026-11-20T20:00:00.000Z"),
        capacity: 40,
        price: 0,
        isPublic: false,
        isPaid: false,
        publicRegistrationEnabled: false
      }
    });
    createdEventIds.push(event.id);

    const ticket = await prisma!.eventTicket.create({
      data: {
        churchId,
        eventId: event.id,
        name: `Ingresso ${suffix}`,
        isFree: true,
        isVisible: true
      }
    });

    const now = Date.now();
    await prisma!.ticketBatch.create({
      data: {
        churchId,
        eventId: event.id,
        ticketId: ticket.id,
        name: `Lote ${suffix}`,
        quantity: 40,
        price: 0,
        salesStart: new Date(now - 60_000),
        salesEnd: new Date(now + 86_400_000),
        isVisible: true
      }
    });

    await prisma!.eventFormField.create({
      data: {
        churchId,
        eventId: event.id,
        label: `Campo ${suffix}`,
        type: "TEXT",
        isRequired: false,
        order: 1,
        isActive: true
      }
    });

    await prisma!.eventDiscount.create({
      data: {
        churchId,
        eventId: event.id,
        ticketId: ticket.id,
        code: `DEL${suffix.slice(-6).toUpperCase()}`,
        finalPrice: new Prisma.Decimal("0"),
        isActive: true
      }
    });

    return event;
  }

  it("deletes an empty event with tickets, form and discount", async () => {
    const event = await createEmptyEvent(`ok-${Date.now()}`);

    const response = await request(app.server)
      .delete(`/api/events/${event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect([200, 204]).toContain(response.status);

    const getResponse = await request(app.server)
      .get(`/api/events/${event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(getResponse.status).toBe(404);

    const listResponse = await request(app.server)
      .get("/api/events?limit=100")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(listResponse.status).toBe(200);
    expect(
      (listResponse.body.items as Array<{ id: string }>).some(
        (item) => item.id === event.id
      )
    ).toBe(false);

    expect(
      await prisma!.eventTicket.count({
        where: {
          eventId: event.id
        }
      })
    ).toBe(0);
    expect(
      await prisma!.eventDiscount.count({
        where: {
          eventId: event.id
        }
      })
    ).toBe(0);
    expect(
      await prisma!.eventFormField.count({
        where: {
          eventId: event.id
        }
      })
    ).toBe(0);
    expect(
      await prisma!.ticketBatch.count({
        where: {
          eventId: event.id
        }
      })
    ).toBe(0);
  });

  it("rejects delete without authorization", async () => {
    const event = await createEmptyEvent(`unauth-${Date.now()}`);

    const response = await request(app.server).delete(
      `/api/events/${event.id}`
    );

    expect(response.status).toBe(401);
    expect(
      await prisma!.event.findUnique({
        where: {
          id: event.id
        }
      })
    ).not.toBeNull();
  });

  it("returns 404 for another tenant and keeps the original event", async () => {
    const event = await createEmptyEvent(`tenant-${Date.now()}`);

    const response = await request(app.server)
      .delete(`/api/events/${event.id}`)
      .set("Authorization", `Bearer ${otherTenantToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("EVENT_NOT_FOUND");
    expect(
      await prisma!.event.findUnique({
        where: {
          id: event.id
        }
      })
    ).not.toBeNull();
  });

  it("returns 404 for a missing event", async () => {
    const response = await request(app.server)
      .delete("/api/events/missing-event-id")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("EVENT_NOT_FOUND");
  });

  it("removes an event with registration from lists and preserves the registration", async () => {
    const event = await createEmptyEvent(`reg-${Date.now()}`);

    const registration = await prisma!.registration.create({
      data: {
        churchId,
        eventId: event.id,
        personId,
        status: "CANCELLED",
        paymentStatus: "CANCELLED"
      }
    });

    const response = await request(app.server)
      .delete(`/api/events/${event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect([200, 204]).toContain(response.status);

    const getResponse = await request(app.server)
      .get(`/api/events/${event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(getResponse.status).toBe(404);

    const listResponse = await request(app.server)
      .get("/api/events?limit=100")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(listResponse.status).toBe(200);
    expect(
      (listResponse.body.items as Array<{ id: string }>).some(
        (item) => item.id === event.id
      )
    ).toBe(false);

    expect(
      await prisma!.registration.findUnique({
        where: {
          id: registration.id
        }
      })
    ).not.toBeNull();

    const stored = await prisma!.event.findUnique({
      where: {
        id: event.id
      }
    });

    expect(stored).not.toBeNull();
    expect(stored?.deletedAt).not.toBeNull();
    expect(stored?.isPublic).toBe(false);
    expect(stored?.publicRegistrationEnabled).toBe(false);
  });

  it("removes an event with payment from lists and keeps EventPayment and Transaction", async () => {
    const event = await createEmptyEvent(`paid-${Date.now()}`);

    const order = await prisma!.eventOrder.create({
      data: {
        churchId,
        eventId: event.id,
        status: "PAID",
        totalAmount: new Prisma.Decimal("100")
      }
    });

    const transaction = await prisma!.transaction.create({
      data: {
        churchId,
        eventId: event.id,
        type: "EVENT",
        direction: "IN",
        amount: new Prisma.Decimal("100"),
        method: "PIX",
        costCenter: "EVENTOS",
        status: "ACTIVE"
      }
    });
    createdTransactionIds.push(transaction.id);

    const payment = await prisma!.eventPayment.create({
      data: {
        churchId,
        eventId: event.id,
        orderId: order.id,
        transactionId: transaction.id,
        provider: "TEST",
        status: "PAID",
        amount: new Prisma.Decimal("100")
      }
    });

    const response = await request(app.server)
      .delete(`/api/events/${event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect([200, 204]).toContain(response.status);

    const getResponse = await request(app.server)
      .get(`/api/events/${event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(getResponse.status).toBe(404);

    const listResponse = await request(app.server)
      .get("/api/events?limit=100")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(listResponse.status).toBe(200);
    expect(
      (listResponse.body.items as Array<{ id: string }>).some(
        (item) => item.id === event.id
      )
    ).toBe(false);

    const keptPayment = await prisma!.eventPayment.findUnique({
      where: {
        id: payment.id
      }
    });
    const keptTransaction = await prisma!.transaction.findUnique({
      where: {
        id: transaction.id
      }
    });
    const stored = await prisma!.event.findUnique({
      where: {
        id: event.id
      }
    });

    expect(keptPayment).not.toBeNull();
    expect(keptTransaction).not.toBeNull();
    expect(keptPayment?.id).toBe(payment.id);
    expect(keptTransaction?.id).toBe(transaction.id);
    expect(keptPayment?.transactionId).toBe(transaction.id);
    expect(keptTransaction?.eventId).toBe(event.id);
    expect(stored?.deletedAt).not.toBeNull();
  });

  it("does not affect another event when deleting one event", async () => {
    const eventA = await createEmptyEvent(`keep-a-${Date.now()}`);
    const eventB = await createEmptyEvent(`keep-b-${Date.now()}`);

    const response = await request(app.server)
      .delete(`/api/events/${eventA.id}`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect([200, 204]).toContain(response.status);

    const kept = await request(app.server)
      .get(`/api/events/${eventB.id}`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(kept.status).toBe(200);
    expect(kept.body.id).toBe(eventB.id);
  });

  it("rejects a new admin registration after the event is archived", async () => {
    const event = await createEmptyEvent(`post-archive-${Date.now()}`);

    await prisma!.registration.create({
      data: {
        churchId,
        eventId: event.id,
        personId,
        status: "CANCELLED",
        paymentStatus: "CANCELLED"
      }
    });

    const deleteResponse = await request(app.server)
      .delete(`/api/events/${event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(deleteResponse.status).toBe(204);

    const createResponse = await request(app.server)
      .post("/api/events/registrations")
      .set("Authorization", `Bearer ${pastorToken}`)
      .send({
        eventId: event.id,
        personId
      });

    expect(createResponse.status).toBe(404);
    expect(createResponse.body.error).toBe("EVENT_NOT_FOUND");

    expect(
      await prisma!.registration.count({
        where: {
          churchId,
          eventId: event.id
        }
      })
    ).toBe(1);
  });

  it("rejects LEADER delete and keeps the event", async () => {
    const event = await createEmptyEvent(`leader-${Date.now()}`);

    const response = await request(app.server)
      .delete(`/api/events/${event.id}`)
      .set("Authorization", `Bearer ${leaderToken}`);

    expect(response.status).toBe(403);
    expect(
      await prisma!.event.findUnique({
        where: {
          id: event.id
        }
      })
    ).not.toBeNull();
  });
});
