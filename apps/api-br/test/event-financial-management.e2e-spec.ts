import { Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@sistema-igrejas/database";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { buildApp } from "../src/app.js";

const BORDERO_HEADER = [
  "Data",
  "Evento",
  "Participante / Origem",
  "Ingresso",
  "Lote",
  "Status",
  "Método",
  "Valor bruto",
  "Taxa da plataforma",
  "Valor líquido",
  "Percentual da taxa"
] as const;

function parseBorderoCsv(raw: string | Buffer) {
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8");
  const hasBom =
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf;
  const text = buffer.subarray(hasBom ? 3 : 0).toString("utf8");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = false;
        continue;
      }

      cell += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ";") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\n") {
      if (cell.endsWith("\r")) {
        cell = cell.slice(0, -1);
      }

      row.push(cell);

      if (row.some((value) => value !== "")) {
        rows.push(row);
      }

      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const [header, ...dataRows] = rows;

  return {
    hasBom,
    header: header ?? [],
    rows: dataRows
  };
}

function parseCsvNumber(value: string) {
  if (value === "") {
    return "";
  }

  return Number(value.replace(/\./g, "").replace(",", "."));
}

function findBorderoRow(rows: string[][], participant: string) {
  return rows.find((columns) => columns[2] === participant);
}

describe("Event financial management E2E", () => {
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
      } else if (createdTransactionIds.length > 0) {
        await prisma.transaction.deleteMany({
          where: {
            id: {
              in: createdTransactionIds
            }
          }
        });
      }

      await prisma.$disconnect();
    }

    await app.close();
  });

  async function createPaidEventFixture(
    suffix: string,
    options?: {
      title?: string;
      ticketName?: string;
      batchName?: string;
    }
  ) {
    const event = await prisma!.event.create({
      data: {
        churchId,
        campusId,
        title: options?.title ?? `Gestao Event ${suffix}`,
        slug: `gestao-event-${suffix}`,
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
        name: options?.ticketName ?? `Ingresso ${suffix}`,
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
        name: options?.batchName ?? `Lote ${suffix}`,
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

  async function createEventTransaction(input: {
    eventId: string;
    amount: number;
    method?: "PIX" | "CARD" | "CASH" | "BOLETO";
    status?: "ACTIVE" | "CANCELLED" | "REVERSED";
    type?: "EVENT" | "TITHE" | "OFFERING";
    at?: Date;
  }) {
    const created = await prisma!.transaction.create({
      data: {
        churchId,
        campusId,
        eventId: input.type === "TITHE" || input.type === "OFFERING"
          ? input.eventId
          : input.eventId,
        type: input.type ?? "EVENT",
        direction: "IN",
        amount: input.amount,
        method: input.method ?? "PIX",
        costCenter: input.type === "TITHE" ? "DIZIMO" : "EVENTOS",
        status: input.status ?? "ACTIVE",
        at: input.at ?? new Date()
      }
    });

    createdTransactionIds.push(created.id);
    return created;
  }

  it("isolates event financial data across tenants", async () => {
    const fixture = await createPaidEventFixture(`tenant-${Date.now()}`);
    const created = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Isolamento Tenant",
      phone: `4191${Date.now().toString().slice(-7)}`
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
      .get(`/api/events/financial/summary?eventId=${fixture.event.id}`)
      .set("Authorization", `Bearer ${otherTenantToken}`);

    expect(otherSummary.status).toBe(200);
    expect(Number(otherSummary.body.eventSales.grossAmount)).toBe(0);
    expect(Number(otherSummary.body.eventSales.platformFeeAmount)).toBe(0);
    expect(Number(otherSummary.body.eventSales.netAmount)).toBe(0);
    expect(otherSummary.body.counts).toEqual({
      paid: 0,
      pending: 0,
      cancelled: 0,
      reversed: 0
    });

    const otherList = await request(app.server)
      .get(
        `/api/events/financial/transactions?eventId=${fixture.event.id}&page=1&limit=50`
      )
      .set("Authorization", `Bearer ${otherTenantToken}`);

    expect(otherList.status).toBe(200);
    expect(otherList.body.items).toEqual([]);
    expect(otherList.body.pagination.total).toBe(0);
  });

  it("pages 51 event rows as 50 plus 1", async () => {
    const fixture = await createPaidEventFixture(`page-${Date.now()}`);
    const baseAt = new Date("2026-07-01T10:00:00.000Z");

    for (let index = 0; index < 51; index += 1) {
      await createEventTransaction({
        eventId: fixture.event.id,
        amount: 1,
        at: new Date(baseAt.getTime() + index * 1000)
      });
    }

    const page1 = await request(app.server)
      .get(
        `/api/events/financial/transactions?eventId=${fixture.event.id}&page=1&limit=50`
      )
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(page1.status).toBe(200);
    expect(page1.body.items).toHaveLength(50);
    expect(page1.body.pagination).toMatchObject({
      page: 1,
      currentPage: 1,
      limit: 50,
      total: 51,
      totalPages: 2
    });
    expect(page1.body.items[0]).not.toHaveProperty("provider");
    expect(page1.body.items[0]).not.toHaveProperty("asaasId");
    expect(page1.body.items[0]).not.toHaveProperty("costCenter");
    expect(page1.body.items[0]).toEqual(
      expect.objectContaining({
        amount: 1,
        grossAmount: null,
        platformFeeAmount: null,
        netAmount: null
      })
    );

    const page2 = await request(app.server)
      .get(
        `/api/events/financial/transactions?eventId=${fixture.event.id}&page=2&limit=50`
      )
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(page2.status).toBe(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.pagination.total).toBe(51);
  });

  it("filters by event, period, status, method and search", async () => {
    const suffix = Date.now().toString();
    const fixture = await createPaidEventFixture(`filtros-${suffix}`);
    const uniqueName = `Participante Filtro ${suffix}`;

    const paid = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: uniqueName,
      phone: `4192${suffix.slice(-7)}`
    });

    expect(paid.status).toBe(201);

    await prisma!.eventPayment.update({
      where: {
        id: paid.body.paymentId as string
      },
      data: {
        status: "PAID"
      }
    });

    const pending = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: `Pendente Filtro ${suffix}`,
      phone: `4193${suffix.slice(-7)}`
    });

    expect(pending.status).toBe(201);

    await prisma!.transaction.update({
      where: {
        id: (
          await prisma!.eventPayment.findUniqueOrThrow({
            where: {
              id: pending.body.paymentId as string
            },
            select: {
              transactionId: true
            }
          })
        ).transactionId
      },
      data: {
        method: "CARD",
        at: new Date("2026-08-15T12:00:00.000Z")
      }
    });

    await createEventTransaction({
      eventId: fixture.event.id,
      amount: 15,
      method: "PIX",
      at: new Date("2026-08-20T12:00:00.000Z")
    });

    const byEvent = await request(app.server)
      .get(
        `/api/events/financial/transactions?eventId=${fixture.event.id}&page=1&limit=50`
      )
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(byEvent.status).toBe(200);
    expect(byEvent.body.pagination.total).toBe(3);

    const byPeriod = await request(app.server)
      .get(
        `/api/events/financial/transactions?eventId=${fixture.event.id}&from=2026-08-14T00:00:00.000Z&to=2026-08-16T23:59:59.999Z&page=1&limit=50`
      )
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(byPeriod.status).toBe(200);
    expect(byPeriod.body.pagination.total).toBe(1);
    expect(byPeriod.body.items[0].method).toBe("CARD");

    const byStatus = await request(app.server)
      .get(
        `/api/events/financial/transactions?eventId=${fixture.event.id}&paymentStatus=PENDING&page=1&limit=50`
      )
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(byStatus.status).toBe(200);
    expect(byStatus.body.pagination.total).toBe(1);
    expect(byStatus.body.items[0].paymentLabel).toBe("Pendente");

    const byMethod = await request(app.server)
      .get(
        `/api/events/financial/transactions?eventId=${fixture.event.id}&method=PIX&page=1&limit=50`
      )
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(byMethod.status).toBe(200);
    expect(byMethod.body.pagination.total).toBe(2);

    const byName = await request(app.server)
      .get(
        `/api/events/financial/transactions?eventId=${fixture.event.id}&search=${encodeURIComponent(uniqueName)}&page=1&limit=50`
      )
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(byName.status).toBe(200);
    expect(byName.body.pagination.total).toBe(1);
    expect(byName.body.items[0].participantName).toBe(uniqueName);

    const byTitle = await request(app.server)
      .get(
        `/api/events/financial/transactions?search=${encodeURIComponent(fixture.event.title)}&page=1&limit=50`
      )
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(byTitle.status).toBe(200);
    expect(byTitle.body.pagination.total).toBe(3);
  });

  it("summary eventSales includes only PAID snapshots", async () => {
    await prisma!.church.update({
      where: {
        id: churchId
      },
      data: {
        platformFeePercent: null
      }
    });

    const fixture = await createPaidEventFixture(`summary-${Date.now()}`);

    const paidRegistration = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Pago Snapshot",
      phone: `4194${Date.now().toString().slice(-7)}`
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
      name: "Pendente Snapshot",
      phone: `4195${Date.now().toString().slice(-7)}`
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

    const nullSnapshotTransaction = await createEventTransaction({
      eventId: fixture.event.id,
      amount: 50
    });

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

    await createEventTransaction({
      eventId: fixture.event.id,
      amount: 25
    });

    const cancelled = await createEventTransaction({
      eventId: fixture.event.id,
      amount: 40,
      status: "CANCELLED"
    });

    const reversed = await createEventTransaction({
      eventId: fixture.event.id,
      amount: 30,
      status: "REVERSED"
    });

    expect(cancelled.status).toBe("CANCELLED");
    expect(reversed.status).toBe("REVERSED");

    const summaryResponse = await request(app.server)
      .get("/api/events/financial/summary")
      .query({
        eventId: fixture.event.id
      })
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body).not.toHaveProperty("income");
    expect(summaryResponse.body).not.toHaveProperty("expense");
    expect(Number(summaryResponse.body.eventSales.grossAmount)).toBe(100);
    expect(Number(summaryResponse.body.eventSales.platformFeeAmount)).toBe(10);
    expect(Number(summaryResponse.body.eventSales.netAmount)).toBe(90);
    expect(summaryResponse.body.counts.paid).toBe(2);
    expect(summaryResponse.body.counts.pending).toBe(1);
    expect(summaryResponse.body.counts.cancelled).toBe(1);
    expect(summaryResponse.body.counts.reversed).toBe(1);

    const listResponse = await request(app.server)
      .get(
        `/api/events/financial/transactions?eventId=${fixture.event.id}&page=1&limit=50`
      )
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(listResponse.status).toBe(200);

    const paidItem = listResponse.body.items.find(
      (item: { participantName: string }) =>
        item.participantName === "Pago Snapshot"
    );
    const nullSnapshotItem = listResponse.body.items.find(
      (item: { amount: number }) => item.amount === 50
    );

    expect(paidItem).toEqual(
      expect.objectContaining({
        amount: 100,
        grossAmount: 100,
        platformFeeAmount: 10,
        netAmount: 90
      })
    );
    expect(nullSnapshotItem).toEqual(
      expect.objectContaining({
        amount: 50,
        grossAmount: null,
        platformFeeAmount: null,
        netAmount: null
      })
    );
  });

  it("does not mix church TITHE or OFFERING into event financial routes", async () => {
    const fixture = await createPaidEventFixture(`tithe-${Date.now()}`);

    await createEventTransaction({
      eventId: fixture.event.id,
      amount: 200,
      type: "TITHE"
    });

    await createEventTransaction({
      eventId: fixture.event.id,
      amount: 80,
      type: "OFFERING"
    });

    await createEventTransaction({
      eventId: fixture.event.id,
      amount: 35,
      type: "EVENT"
    });

    const list = await request(app.server)
      .get(
        `/api/events/financial/transactions?eventId=${fixture.event.id}&page=1&limit=50`
      )
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(list.status).toBe(200);
    expect(list.body.pagination.total).toBe(1);
    expect(list.body.items[0].amount).toBe(35);

    const summary = await request(app.server)
      .get(`/api/events/financial/summary?eventId=${fixture.event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(summary.status).toBe(200);
    expect(Number(summary.body.eventSales.grossAmount)).toBe(0);
    expect(summary.body.counts.paid).toBe(0);

    const exported = await request(app.server)
      .get(`/api/events/financial/export?eventId=${fixture.event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.from(chunk));
        });
        response.on("end", () => {
          callback(null, Buffer.concat(chunks));
        });
      });

    expect(exported.status).toBe(200);

    const parsed = parseBorderoCsv(exported.body as Buffer);

    expect(parsed.hasBom).toBe(true);
    expect(parsed.header).toEqual([...BORDERO_HEADER]);
    expect(parsed.rows).toHaveLength(0);
    expect(
      parsed.rows.some((columns) => columns[2] === "Lançamento interno")
    ).toBe(false);
    expect(parsed.rows.map((columns) => columns[7])).not.toContain("200");
    expect(parsed.rows.map((columns) => columns[7])).not.toContain("80");
    expect(parsed.rows.map((columns) => columns[8])).not.toContain("200");
    expect(parsed.rows.map((columns) => columns[8])).not.toContain("80");
    expect(parsed.rows.map((columns) => columns[9])).not.toContain("200");
    expect(parsed.rows.map((columns) => columns[9])).not.toContain("80");
  });

  it("allows LEADER on event financial routes and keeps church financial forbidden", async () => {
    const fixture = await createPaidEventFixture(`leader-${Date.now()}`);
    await createEventTransaction({
      eventId: fixture.event.id,
      amount: 12
    });

    const summary = await request(app.server)
      .get(`/api/events/financial/summary?eventId=${fixture.event.id}`)
      .set("Authorization", `Bearer ${leaderToken}`);

    expect(summary.status).toBe(200);
    expect(summary.body.eventSales).toBeDefined();

    const list = await request(app.server)
      .get(
        `/api/events/financial/transactions?eventId=${fixture.event.id}&page=1&limit=50`
      )
      .set("Authorization", `Bearer ${leaderToken}`);

    expect(list.status).toBe(200);
    expect(list.body.pagination.total).toBe(1);

    const exported = await request(app.server)
      .get(`/api/events/financial/export?eventId=${fixture.event.id}`)
      .set("Authorization", `Bearer ${leaderToken}`);

    expect(exported.status).toBe(200);

    const pastorSummary = await request(app.server)
      .get(`/api/events/financial/summary?eventId=${fixture.event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(pastorSummary.status).toBe(200);

    const churchSummary = await request(app.server)
      .get(`/api/financial/summary?eventId=${fixture.event.id}`)
      .set("Authorization", `Bearer ${leaderToken}`);

    expect(churchSummary.status).toBe(403);
    expect(churchSummary.body.error).toBe("FINANCIAL_ACCESS_DENIED");

    const churchList = await request(app.server)
      .get(
        `/api/financial/transactions?eventId=${fixture.event.id}&page=1&limit=50`
      )
      .set("Authorization", `Bearer ${leaderToken}`);

    expect(churchList.status).toBe(403);
    expect(churchList.body.error).toBe("FINANCIAL_ACCESS_DENIED");
  });

  it("exports a real CSV borderô with snapshot cells and empty null snapshots", async () => {
    await prisma!.church.update({
      where: {
        id: churchId
      },
      data: {
        platformFeePercent: null
      }
    });

    const suffix = Date.now().toString();
    const fixture = await createPaidEventFixture(`export-${suffix}`, {
      title: `Conferência ${suffix}`,
      ticketName: `Ingresso cobrança ${suffix}`
    });

    const paidRegistration = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: `Ana; "Beta" ${suffix}`,
      phone: `4196${suffix.slice(-7)}`
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
      name: `Pendente cobrança ${suffix}`,
      phone: `4197${suffix.slice(-7)}`
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

    const nullSnapshotTransaction = await createEventTransaction({
      eventId: fixture.event.id,
      amount: 50
    });

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

    await createEventTransaction({
      eventId: fixture.event.id,
      amount: 35
    });

    const exported = await request(app.server)
      .get(`/api/events/financial/export?eventId=${fixture.event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.from(chunk));
        });
        response.on("end", () => {
          callback(null, Buffer.concat(chunks));
        });
      });

    expect(exported.status).toBe(200);
    expect(exported.headers["content-type"]).toMatch(/text\/csv; charset=utf-8/);
    expect(exported.headers["content-disposition"]).toMatch(
      /attachment; filename="bordero-eventos-\d{4}-\d{2}-\d{2}\.csv"/
    );

    const parsed = parseBorderoCsv(exported.body as Buffer);
    const csvText = Buffer.from(exported.body as Buffer).toString("utf8");

    expect(parsed.hasBom).toBe(true);
    expect(parsed.header).toEqual([...BORDERO_HEADER]);
    expect(parsed.header[6]).toBe("Método");
    expect(csvText).toContain("Conferência");
    expect(csvText).toContain("Método");
    expect(csvText).toContain("cobrança");
    expect(csvText).not.toContain("ConferÃªncia");
    expect(csvText).not.toContain("@e2e.local");
    expect(csvText).not.toContain("externalPaymentId");
    expect(csvText).not.toContain("providerPaymentId");

    const paidRow = findBorderoRow(parsed.rows, `Ana; "Beta" ${suffix}`);
    const pendingRow = findBorderoRow(
      parsed.rows,
      `Pendente cobrança ${suffix}`
    );
    const emptySnapshotRow = findBorderoRow(
      parsed.rows,
      "Lançamento interno"
    );

    expect(paidRow).toBeDefined();
    expect(paidRow?.[0]).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    expect(paidRow?.[1]).toBe(`Conferência ${suffix}`);
    expect(paidRow?.[3]).toBe(`Ingresso cobrança ${suffix}`);
    expect(paidRow?.[5]).toBe("Pago");
    expect(paidRow?.[6]).toBe("PIX");
    expect(paidRow?.[7]).toBe("100,00");
    expect(paidRow?.[8]).toBe("10,00");
    expect(paidRow?.[9]).toBe("90,00");
    expect(paidRow?.[10]).toBe("10");
    expect(parseCsvNumber(paidRow?.[7] ?? "")).toBe(100);
    expect(parseCsvNumber(paidRow?.[8] ?? "")).toBe(10);
    expect(parseCsvNumber(paidRow?.[9] ?? "")).toBe(90);
    expect(parseCsvNumber(paidRow?.[10] ?? "")).toBe(10);

    expect(pendingRow).toBeDefined();
    expect(pendingRow?.[5]).toBe("Pendente");
    expect(parseCsvNumber(pendingRow?.[7] ?? "")).toBe(100);
    expect(parseCsvNumber(pendingRow?.[8] ?? "")).toBe(10);
    expect(parseCsvNumber(pendingRow?.[9] ?? "")).toBe(90);

    expect(emptySnapshotRow).toBeDefined();
    expect(emptySnapshotRow?.[7]).toBe("");
    expect(emptySnapshotRow?.[8]).toBe("");
    expect(emptySnapshotRow?.[9]).toBe("");
    expect(emptySnapshotRow?.[10]).toBe("");
    expect(emptySnapshotRow?.[7]).not.toBe("50");
    expect(emptySnapshotRow?.[8]).not.toBe("5");
    expect(emptySnapshotRow?.[9]).not.toBe("45");

    expect(parsed.rows).toHaveLength(3);
    expect(
      parsed.rows.some((columns) => columns[7] === "35,00")
    ).toBe(false);

    const otherExport = await request(app.server)
      .get(`/api/events/financial/export?eventId=${fixture.event.id}`)
      .set("Authorization", `Bearer ${otherTenantToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.from(chunk));
        });
        response.on("end", () => {
          callback(null, Buffer.concat(chunks));
        });
      });

    expect(otherExport.status).toBe(200);
    const otherParsed = parseBorderoCsv(otherExport.body as Buffer);
    expect(otherParsed.hasBom).toBe(true);
    expect(otherParsed.header).toEqual([...BORDERO_HEADER]);
    expect(otherParsed.rows).toHaveLength(0);
  });

  it("exports 7.9% override snapshot without inventing values", async () => {
    await prisma!.church.update({
      where: {
        id: churchId
      },
      data: {
        platformFeePercent: new Prisma.Decimal("7.9")
      }
    });

    const suffix = `override-${Date.now()}`;
    const fixture = await createPaidEventFixture(suffix, {
      title: `Conferência ${suffix}`
    });

    const paidRegistration = await registerPublic({
      eventSlug: fixture.event.slug,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      name: "Export Override",
      phone: `4198${Date.now().toString().slice(-7)}`
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

    const exported = await request(app.server)
      .get(`/api/events/financial/export?eventId=${fixture.event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.from(chunk));
        });
        response.on("end", () => {
          callback(null, Buffer.concat(chunks));
        });
      });

    expect(exported.status).toBe(200);

    const parsed = parseBorderoCsv(exported.body as Buffer);
    const paidRow = findBorderoRow(parsed.rows, "Export Override");

    expect(paidRow).toBeDefined();
    expect(paidRow?.[7]).toBe("100,00");
    expect(paidRow?.[8]).toBe("7,90");
    expect(paidRow?.[9]).toBe("92,10");
    expect(paidRow?.[10]).toBe("7,9");
    expect(parseCsvNumber(paidRow?.[8] ?? "")).toBe(7.9);
    expect(parseCsvNumber(paidRow?.[9] ?? "")).toBe(92.1);
    expect(parseCsvNumber(paidRow?.[10] ?? "")).toBe(7.9);
  });
});
