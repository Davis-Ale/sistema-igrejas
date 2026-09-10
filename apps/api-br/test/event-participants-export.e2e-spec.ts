import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@sistema-igrejas/database";
import {
  createEventFormField,
  createEventRegistrationsCsvExport,
  csvCell,
  csvLine,
  PARTICIPANT_CSV_FIXED_HEADERS
} from "@sistema-igrejas/events";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { buildApp } from "../src/app.js";

function parseParticipantsCsv(raw: string | Buffer) {
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
    if (cell.endsWith("\r")) {
      cell = cell.slice(0, -1);
    }

    row.push(cell);

    if (row.some((value) => value !== "")) {
      rows.push(row);
    }
  }

  return {
    hasBom,
    header: rows[0] ?? [],
    rows: rows.slice(1)
  };
}

describe("Event participants CSV export E2E", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient | null = null;
  let pastorToken = "";
  let otherTenantToken = "";
  let churchId = "";
  let campusId = "";
  let personId = "";
  let countingExportQueries = false;
  let exportQueryCount = 0;
  const createdEventIds: string[] = [];
  const createdVisitorIds: string[] = [];
  const createdChurchIds: string[] = [];

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
      }),
      log: [
        {
          emit: "event",
          level: "query"
        }
      ]
    });

    prisma.$on("query" as never, () => {
      if (countingExportQueries) {
        exportQueryCount += 1;
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
  });

  afterAll(async () => {
    if (prisma) {
      if (createdEventIds.length > 0) {
        await prisma.event.deleteMany({
          where: {
            id: {
              in: createdEventIds
            }
          }
        });
      }

      if (createdVisitorIds.length > 0) {
        await prisma.visitor.deleteMany({
          where: {
            id: {
              in: createdVisitorIds
            }
          }
        });
      }

      if (createdChurchIds.length > 0) {
        await prisma.event.deleteMany({
          where: {
            churchId: {
              in: createdChurchIds
            }
          }
        });
        await prisma.church.deleteMany({
          where: {
            id: {
              in: createdChurchIds
            }
          }
        });
      }

      await prisma.$disconnect();
    }

    await app.close();
  });

  async function exportCsv(
    eventId: string,
    query: Record<string, string> = {},
    token = pastorToken
  ) {
    const params = new URLSearchParams(query);
    const queryString = params.toString();

    return request(app.server)
      .get(
        `/api/events/${eventId}/registrations/export${
          queryString ? `?${queryString}` : ""
        }`
      )
      .set("Authorization", `Bearer ${token}`)
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
  }

  async function createEventFixture(suffix: string) {
    const event = await prisma!.event.create({
      data: {
        churchId,
        campusId,
        title: `Conferência CSV ${suffix}`,
        slug: `conferencia-csv-${suffix}`,
        date: new Date("2026-11-01T20:00:00.000Z"),
        capacity: 5000,
        price: 0,
        isPublic: true,
        isPaid: false,
        publicRegistrationEnabled: true
      }
    });

    createdEventIds.push(event.id);

    const ticket = await prisma!.eventTicket.create({
      data: {
        churchId,
        eventId: event.id,
        name: `Ingresso Conferência ${suffix}`,
        isFree: true,
        isVisible: true
      }
    });

    const extraTicket = await prisma!.eventTicket.create({
      data: {
        churchId,
        eventId: event.id,
        name: `VIP ${suffix}`,
        isFree: true,
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
        quantity: 5000,
        price: 0,
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
        name: `Lote VIP ${suffix}`,
        quantity: 5000,
        price: 0,
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

  async function createParticipant(input: {
    eventId: string;
    suffix: string;
    name: string;
    email?: string | null;
    phone: string;
    ticketId?: string | null;
    ticketBatchId?: string | null;
    status?: "PENDING" | "CONFIRMED" | "CANCELLED" | "CHECKED_IN";
    paymentStatus?: string;
    checkInToken?: string;
    waitlistedAt?: Date | null;
  }) {
    const visitor = await prisma!.visitor.create({
      data: {
        churchId,
        name: input.name,
        phone: input.phone,
        email: input.email === undefined ? `${input.phone}@e2e.local` : input.email
      }
    });

    createdVisitorIds.push(visitor.id);

    const registration = await prisma!.registration.create({
      data: {
        churchId,
        eventId: input.eventId,
        ticketId: input.ticketId ?? null,
        ticketBatchId: input.ticketBatchId ?? null,
        visitorId: visitor.id,
        status: input.status ?? "CONFIRMED",
        paymentStatus: input.paymentStatus ?? "NOT_REQUIRED",
        checkInToken: input.checkInToken ?? `csvtok-${input.suffix}-${visitor.id}`,
        waitlistedAt: input.waitlistedAt ?? null,
        registrationSource: "ADMIN"
      }
    });

    return {
      visitor,
      registration
    };
  }

  async function createFormField(input: {
    eventId: string;
    label: string;
    order: number;
    isSensitive?: boolean;
    isActive?: boolean;
    type?:
      | "TEXT"
      | "PARAGRAPH"
      | "SELECT"
      | "SINGLE_CHOICE"
      | "MULTIPLE_CHOICE";
  }) {
    return prisma!.eventFormField.create({
      data: {
        churchId,
        eventId: input.eventId,
        label: input.label,
        type: input.type ?? "TEXT",
        isRequired: false,
        isSensitive: input.isSensitive ?? false,
        order: input.order,
        isActive: input.isActive ?? true
      }
    });
  }

  async function createFormAnswer(input: {
    eventId: string;
    registrationId: string;
    fieldId: string;
    value: string | string[];
  }) {
    return prisma!.eventFormAnswer.create({
      data: {
        churchId,
        eventId: input.eventId,
        registrationId: input.registrationId,
        fieldId: input.fieldId,
        value: input.value
      }
    });
  }

  it("neutralizes CSV formula injection and escapes special characters", () => {
    expect(csvCell("=1+1")).toBe(`"'=1+1"`);
    expect(csvCell("+cmd")).toBe(`"'+cmd"`);
    expect(csvCell("-1+1")).toBe(`"'-1+1"`);
    expect(csvCell("@SUM(1)")).toBe(`"'@SUM(1)"`);
    expect(csvCell("\tSUM(1)")).toBe(`"'\tSUM(1)"`);
    expect(csvCell("\r=1+1")).toBe(`"'\r=1+1"`);
    expect(csvCell('Ana; "Beta"')).toBe(`"Ana; ""Beta"""`);
    expect(csvCell("Linha1\nLinha2")).toBe(`"Linha1\nLinha2"`);
    expect(csvLine(["João", "a;b"])).toBe(`"João";"a;b"`);
  });

  it("exports participants of the correct event with UTF-8 accents", async () => {
    const suffix = `${Date.now()}`;
    const fixture = await createEventFixture(suffix);
    const secretToken = `secret-checkin-${suffix}`;

    await createParticipant({
      eventId: fixture.event.id,
      suffix,
      name: `João Silva ${suffix}`,
      phone: `4191${suffix.slice(-7)}`,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      status: "CHECKED_IN",
      paymentStatus: "PAID",
      checkInToken: secretToken
    });

    const otherFixture = await createEventFixture(`other-${suffix}`);
    await createParticipant({
      eventId: otherFixture.event.id,
      suffix: `other-${suffix}`,
      name: `Outro Evento ${suffix}`,
      phone: `4192${suffix.slice(-7)}`,
      ticketId: otherFixture.ticket.id,
      ticketBatchId: otherFixture.batch.id
    });

    const exported = await exportCsv(fixture.event.id);
    expect(exported.status).toBe(200);
    expect(exported.headers["content-type"]).toMatch(/text\/csv; charset=utf-8/);
    expect(exported.headers["cache-control"]).toMatch(/no-store/i);
    expect(exported.headers["access-control-expose-headers"]).toMatch(
      /content-disposition/i
    );
    expect(exported.headers["content-disposition"]).toMatch(
      new RegExp(
        `attachment; filename="participantes-conferencia-csv-${suffix}-\\d{4}-\\d{2}-\\d{2}\\.csv"`
      )
    );

    const parsed = parseParticipantsCsv(exported.body as Buffer);
    const csvText = Buffer.from(exported.body as Buffer).toString("utf8");

    expect(parsed.hasBom).toBe(true);
    expect(parsed.header.slice(0, PARTICIPANT_CSV_FIXED_HEADERS.length)).toEqual(
      [...PARTICIPANT_CSV_FIXED_HEADERS]
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.[0]).toBe(`João Silva ${suffix}`);
    expect(parsed.rows[0]?.[3]).toBe(`Ingresso Conferência ${suffix}`);
    expect(parsed.rows[0]?.[4]).toBe(`Lote ${suffix}`);
    expect(parsed.rows[0]?.[5]).toBe("Confirmada");
    expect(parsed.rows[0]?.[6]).toBe("Pago");
    expect(parsed.rows[0]?.[7]).toBe("Presente");
    expect(parsed.rows[0]?.[8]).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    expect(csvText).toContain("João");
    expect(csvText).toContain("Conferência");
    expect(csvText).not.toContain("ConferÃªncia");
    expect(csvText).not.toContain(`Outro Evento ${suffix}`);
    expect(csvText).not.toContain(secretToken);
    expect(csvText).not.toContain("checkInToken");
    expect(csvText).not.toContain("paymentId");
    expect(csvText).not.toContain(fixture.event.id);
  });

  it("does not export participants from another churchId", async () => {
    const suffix = `iso-${Date.now()}`;
    const fixture = await createEventFixture(suffix);
    await createParticipant({
      eventId: fixture.event.id,
      suffix,
      name: `Isolado ${suffix}`,
      phone: `4193${suffix.slice(-7)}`,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id
    });

    const otherChurch = await prisma!.church.create({
      data: {
        name: `Igreja CSV ${suffix}`,
        slug: `igreja-csv-${suffix}`,
        plan: "TRIAL",
        status: "ACTIVE"
      }
    });
    createdChurchIds.push(otherChurch.id);

    otherTenantToken = await app.jwt.sign({
      userId: personId,
      churchId: otherChurch.id,
      role: "SUPER_ADMIN"
    });

    const exported = await exportCsv(
      fixture.event.id,
      {},
      otherTenantToken
    );

    expect(exported.status).toBe(404);

    const parsedBody = JSON.parse(
      Buffer.from(exported.body as Buffer).toString("utf8")
    ) as { error?: string };

    expect(parsedBody.error).toBe("EVENT_NOT_FOUND");
  });

  it("rejects exporting an event that belongs to another tenant", async () => {
    const suffix = `xtenant-${Date.now()}`;
    const otherChurch = await prisma!.church.create({
      data: {
        name: `Outra Igreja ${suffix}`,
        slug: `outra-igreja-${suffix}`,
        plan: "TRIAL",
        status: "ACTIVE"
      }
    });
    createdChurchIds.push(otherChurch.id);

    const foreignEvent = await prisma!.event.create({
      data: {
        churchId: otherChurch.id,
        title: `Evento alheio ${suffix}`,
        slug: `evento-alheio-${suffix}`,
        date: new Date("2026-11-01T20:00:00.000Z"),
        capacity: 10,
        price: 0,
        isPublic: false,
        isPaid: false
      }
    });
    createdEventIds.push(foreignEvent.id);

    const exported = await exportCsv(foreignEvent.id);

    expect(exported.status).toBe(404);

    const parsedBody = JSON.parse(
      Buffer.from(exported.body as Buffer).toString("utf8")
    ) as { error?: string };

    expect(parsedBody.error).toBe("EVENT_NOT_FOUND");
  });

  it("applies search, registration status, payment and ticket filters on the backend", async () => {
    const suffix = `filt-${Date.now()}`;
    const fixture = await createEventFixture(suffix);

    await createParticipant({
      eventId: fixture.event.id,
      suffix: `${suffix}-a`,
      name: `Maria Busca ${suffix}`,
      phone: `4181${suffix.slice(-7)}`,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id,
      status: "CONFIRMED",
      paymentStatus: "PAID"
    });

    await createParticipant({
      eventId: fixture.event.id,
      suffix: `${suffix}-b`,
      name: `Pedro Pendente ${suffix}`,
      phone: `4182${suffix.slice(-7)}`,
      ticketId: fixture.extraTicket.id,
      ticketBatchId: fixture.extraBatch.id,
      status: "PENDING",
      paymentStatus: "PENDING"
    });

    await createParticipant({
      eventId: fixture.event.id,
      suffix: `${suffix}-c`,
      name: `Ana VIP ${suffix}`,
      phone: `4183${suffix.slice(-7)}`,
      ticketId: fixture.extraTicket.id,
      ticketBatchId: fixture.extraBatch.id,
      status: "CONFIRMED",
      paymentStatus: "PAID"
    });

    const bySearch = parseParticipantsCsv(
      (await exportCsv(fixture.event.id, { search: "Maria Busca" })).body as Buffer
    );
    expect(bySearch.rows).toHaveLength(1);
    expect(bySearch.rows[0]?.[0]).toBe(`Maria Busca ${suffix}`);

    const byStatus = parseParticipantsCsv(
      (await exportCsv(fixture.event.id, { status: "PENDING" })).body as Buffer
    );
    expect(byStatus.rows).toHaveLength(1);
    expect(byStatus.rows[0]?.[0]).toBe(`Pedro Pendente ${suffix}`);
    expect(byStatus.rows[0]?.[5]).toBe("Pendente");

    const byPayment = parseParticipantsCsv(
      (await exportCsv(fixture.event.id, { paymentStatus: "PAID" })).body as Buffer
    );
    expect(byPayment.rows).toHaveLength(2);
    expect(byPayment.rows.map((row) => row[0]).sort()).toEqual(
      [`Ana VIP ${suffix}`, `Maria Busca ${suffix}`].sort()
    );

    const byTicket = parseParticipantsCsv(
      (
        await exportCsv(fixture.event.id, {
          ticketId: fixture.extraTicket.id
        })
      ).body as Buffer
    );
    expect(byTicket.rows).toHaveLength(2);
    expect(byTicket.rows.every((row) => row[3] === `VIP ${suffix}`)).toBe(true);
  });

  it("exports all matching participants instead of the current page", async () => {
    const suffix = `page-${Date.now()}`;
    const fixture = await createEventFixture(suffix);

    await createParticipant({
      eventId: fixture.event.id,
      suffix: `${suffix}-1`,
      name: `Pagina Um ${suffix}`,
      phone: `4171${suffix.slice(-7)}`,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id
    });
    await createParticipant({
      eventId: fixture.event.id,
      suffix: `${suffix}-2`,
      name: `Pagina Dois ${suffix}`,
      phone: `4172${suffix.slice(-7)}`,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id
    });
    await createParticipant({
      eventId: fixture.event.id,
      suffix: `${suffix}-3`,
      name: `Pagina Tres ${suffix}`,
      phone: `4173${suffix.slice(-7)}`,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id
    });

    const list = await request(app.server)
      .get(`/api/events/${fixture.event.id}/registrations?page=1&limit=1`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.pagination.total).toBe(3);

    const exported = await exportCsv(fixture.event.id, {
      page: "1",
      limit: "1"
    });
    const parsed = parseParticipantsCsv(exported.body as Buffer);

    expect(parsed.rows).toHaveLength(3);
  });

  it("escapes user-controlled CSV values and prefixes formula injection", async () => {
    const suffix = `inj-${Date.now()}`;
    const fixture = await createEventFixture(suffix);

    await createParticipant({
      eventId: fixture.event.id,
      suffix: `${suffix}-a`,
      name: `=CMD|"/C calc"!A0 ${suffix}`,
      email: `+hack${suffix}@e2e.local`,
      phone: `@4194${suffix.slice(-6)}`,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id
    });

    await createParticipant({
      eventId: fixture.event.id,
      suffix: `${suffix}-b`,
      name: `Ana; "Beta"\nGama ${suffix}`,
      email: `-leak${suffix}@e2e.local`,
      phone: `4195${suffix.slice(-7)}`,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id
    });

    const parsed = parseParticipantsCsv(
      (await exportCsv(fixture.event.id)).body as Buffer
    );
    const names = parsed.rows.map((row) => row[0]);

    expect(parsed.rows).toHaveLength(2);
    expect(names).toContain(`'=CMD|"/C calc"!A0 ${suffix}`);
    expect(names).toContain(`Ana; "Beta"\nGama ${suffix}`);
    expect(parsed.rows.find((row) => row[1] === `'+hack${suffix}@e2e.local`)?.[2]).toBe(
      `'@4194${suffix.slice(-6)}`
    );
    expect(parsed.rows.find((row) => row[1] === `'-leak${suffix}@e2e.local`)).toBeTruthy();
    expect(names.some((name) => name?.startsWith("="))).toBe(false);
  });

  it("exports empty optional fields without inventing values", async () => {
    const suffix = `empty-${Date.now()}`;
    const fixture = await createEventFixture(suffix);

    await createParticipant({
      eventId: fixture.event.id,
      suffix,
      name: `Sem Email ${suffix}`,
      email: null,
      phone: `4161${suffix.slice(-7)}`
    });

    const parsed = parseParticipantsCsv(
      (await exportCsv(fixture.event.id)).body as Buffer
    );

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.[0]).toBe(`Sem Email ${suffix}`);
    expect(parsed.rows[0]?.[1]).toBe("");
    expect(parsed.rows[0]?.[3]).toBe("");
    expect(parsed.rows[0]?.[4]).toBe("");
    expect(parsed.rows[0]?.[7]).toBe("Não realizado");
  });

  it("returns header-only CSV when the event has no participants", async () => {
    const suffix = `none-${Date.now()}`;
    const fixture = await createEventFixture(suffix);

    const exported = await exportCsv(fixture.event.id);
    const parsed = parseParticipantsCsv(exported.body as Buffer);

    expect(exported.status).toBe(200);
    expect(parsed.header).toEqual([...PARTICIPANT_CSV_FIXED_HEADERS]);
    expect(parsed.rows).toHaveLength(0);
  });

  it("includes configured form headers when the event has no participants", async () => {
    const suffix = `none-form-${Date.now()}`;
    const fixture = await createEventFixture(suffix);
    const firstLabel = `Pergunta ${suffix} A`;
    const secondLabel = `Pergunta ${suffix} B`;

    await createFormField({
      eventId: fixture.event.id,
      label: firstLabel,
      order: 2
    });
    await createFormField({
      eventId: fixture.event.id,
      label: secondLabel,
      order: 1
    });

    const parsed = parseParticipantsCsv(
      (await exportCsv(fixture.event.id)).body as Buffer
    );

    expect(parsed.rows).toHaveLength(0);
    expect(parsed.header).toEqual([
      ...PARTICIPANT_CSV_FIXED_HEADERS,
      secondLabel,
      firstLabel
    ]);
  });

  it("rejects unauthenticated export", async () => {
    const suffix = `unauth-${Date.now()}`;
    const fixture = await createEventFixture(suffix);

    const response = await request(app.server).get(
      `/api/events/${fixture.event.id}/registrations/export`
    );

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });

  it("adds one dynamic column for a single form field of the event", async () => {
    const suffix = `one-field-${Date.now()}`;
    const fixture = await createEventFixture(suffix);
    const label = `Campo único ${suffix}`;
    const field = await createFormField({
      eventId: fixture.event.id,
      label,
      order: 1
    });
    const participant = await createParticipant({
      eventId: fixture.event.id,
      suffix,
      name: `Um Campo ${suffix}`,
      phone: `4141${suffix.slice(-7)}`,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id
    });
    await createFormAnswer({
      eventId: fixture.event.id,
      registrationId: participant.registration.id,
      fieldId: field.id,
      value: `Resposta ${suffix}`
    });

    const parsed = parseParticipantsCsv(
      (await exportCsv(fixture.event.id)).body as Buffer
    );

    expect(parsed.header).toEqual([...PARTICIPANT_CSV_FIXED_HEADERS, label]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.[PARTICIPANT_CSV_FIXED_HEADERS.length]).toBe(
      `Resposta ${suffix}`
    );
  });

  it("preserves form field order and maps answers by field id", async () => {
    const suffix = `many-fields-${Date.now()}`;
    const fixture = await createEventFixture(suffix);
    const thirdLabel = `Campo ${suffix} 3`;
    const firstLabel = `Campo ${suffix} 1`;
    const secondLabel = `Campo ${suffix} 2`;
    const thirdField = await createFormField({
      eventId: fixture.event.id,
      label: thirdLabel,
      order: 30
    });
    const firstField = await createFormField({
      eventId: fixture.event.id,
      label: firstLabel,
      order: 10
    });
    const secondField = await createFormField({
      eventId: fixture.event.id,
      label: secondLabel,
      order: 20
    });
    const participant = await createParticipant({
      eventId: fixture.event.id,
      suffix,
      name: `Varios Campos ${suffix}`,
      phone: `4131${suffix.slice(-7)}`,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id
    });
    await createFormAnswer({
      eventId: fixture.event.id,
      registrationId: participant.registration.id,
      fieldId: secondField.id,
      value: "segunda"
    });
    await createFormAnswer({
      eventId: fixture.event.id,
      registrationId: participant.registration.id,
      fieldId: firstField.id,
      value: "primeira"
    });
    await createFormAnswer({
      eventId: fixture.event.id,
      registrationId: participant.registration.id,
      fieldId: thirdField.id,
      value: ["opcao-a", "opcao-b"]
    });

    const parsed = parseParticipantsCsv(
      (await exportCsv(fixture.event.id)).body as Buffer
    );
    const dynamicStart = PARTICIPANT_CSV_FIXED_HEADERS.length;

    expect(parsed.header.slice(dynamicStart)).toEqual([
      firstLabel,
      secondLabel,
      thirdLabel
    ]);
    expect(parsed.rows[0]?.slice(dynamicStart)).toEqual([
      "primeira",
      "segunda",
      "opcao-a, opcao-b"
    ]);
  });

  it("leaves empty cells when a form answer is missing", async () => {
    const suffix = `empty-answer-${Date.now()}`;
    const fixture = await createEventFixture(suffix);
    const answeredLabel = `Respondido ${suffix}`;
    const emptyLabel = `Opcional vazio ${suffix}`;
    const answeredField = await createFormField({
      eventId: fixture.event.id,
      label: answeredLabel,
      order: 1
    });
    await createFormField({
      eventId: fixture.event.id,
      label: emptyLabel,
      order: 2
    });
    const participant = await createParticipant({
      eventId: fixture.event.id,
      suffix,
      name: `Resposta Parcial ${suffix}`,
      phone: `4121${suffix.slice(-7)}`,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id
    });
    await createFormAnswer({
      eventId: fixture.event.id,
      registrationId: participant.registration.id,
      fieldId: answeredField.id,
      value: "preenchido"
    });

    const parsed = parseParticipantsCsv(
      (await exportCsv(fixture.event.id)).body as Buffer
    );
    const dynamicStart = PARTICIPANT_CSV_FIXED_HEADERS.length;

    expect(parsed.header.slice(dynamicStart)).toEqual([
      answeredLabel,
      emptyLabel
    ]);
    expect(parsed.rows[0]?.[dynamicStart]).toBe("preenchido");
    expect(parsed.rows[0]?.[dynamicStart + 1]).toBe("");
  });

  it("exports different form columns for events with different forms", async () => {
    const suffix = `diff-form-${Date.now()}`;
    const firstFixture = await createEventFixture(`${suffix}-a`);
    const secondFixture = await createEventFixture(`${suffix}-b`);
    const firstLabel = `Formulario A ${suffix}`;
    const secondLabel = `Formulario B ${suffix}`;

    await createFormField({
      eventId: firstFixture.event.id,
      label: firstLabel,
      order: 1
    });
    await createFormField({
      eventId: secondFixture.event.id,
      label: secondLabel,
      order: 1
    });

    const firstParsed = parseParticipantsCsv(
      (await exportCsv(firstFixture.event.id)).body as Buffer
    );
    const secondParsed = parseParticipantsCsv(
      (await exportCsv(secondFixture.event.id)).body as Buffer
    );

    expect(firstParsed.header).toContain(firstLabel);
    expect(firstParsed.header).not.toContain(secondLabel);
    expect(secondParsed.header).toContain(secondLabel);
    expect(secondParsed.header).not.toContain(firstLabel);
  });

  it("omits sensitive form field values but keeps the configured column", async () => {
    const suffix = `sensitive-${Date.now()}`;
    const fixture = await createEventFixture(suffix);
    const visibleLabel = `Visivel ${suffix}`;
    const sensitiveLabel = `Sensível ${suffix}`;
    const inactiveLabel = `Inativo ${suffix}`;
    const visibleField = await createFormField({
      eventId: fixture.event.id,
      label: visibleLabel,
      order: 1
    });
    const sensitiveField = await createFormField({
      eventId: fixture.event.id,
      label: sensitiveLabel,
      order: 2,
      isSensitive: true
    });
    await createFormField({
      eventId: fixture.event.id,
      label: inactiveLabel,
      order: 3,
      isActive: false
    });
    const participant = await createParticipant({
      eventId: fixture.event.id,
      suffix,
      name: `Campo Form ${suffix}`,
      phone: `4151${suffix.slice(-7)}`,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id
    });
    await createFormAnswer({
      eventId: fixture.event.id,
      registrationId: participant.registration.id,
      fieldId: visibleField.id,
      value: `ok-${suffix}`
    });
    await createFormAnswer({
      eventId: fixture.event.id,
      registrationId: participant.registration.id,
      fieldId: sensitiveField.id,
      value: `segredo-${suffix}`
    });

    const exported = await exportCsv(fixture.event.id);
    const parsed = parseParticipantsCsv(exported.body as Buffer);
    const csvText = Buffer.from(exported.body as Buffer).toString("utf8");
    const dynamicStart = PARTICIPANT_CSV_FIXED_HEADERS.length;
    const dynamicHeaders = parsed.header.slice(dynamicStart);

    expect(dynamicHeaders).toEqual([
      visibleLabel,
      sensitiveLabel,
      inactiveLabel
    ]);
    expect(parsed.rows[0]?.[dynamicStart]).toBe(`ok-${suffix}`);
    expect(parsed.rows[0]?.[dynamicStart + 1]).toBe("");
    expect(csvText).toContain(`ok-${suffix}`);
    expect(csvText).not.toContain(`segredo-${suffix}`);
    expect(csvText).not.toContain("Dado protegido");
  });

  it("exports a real form field created through the application service with zero participants", async () => {
    const suffix = `real-form-${Date.now()}`;
    const fixture = await createEventFixture(suffix);
    const field = await createEventFormField(
      prisma!,
      churchId,
      fixture.event.id,
      {
        label: "teste - csv",
        type: "TEXT",
        isRequired: true,
        isSensitive: false,
        isActive: true,
        ticketIds: [],
        options: []
      }
    );

    const emptyExport = await exportCsv(fixture.event.id);
    const emptyParsed = parseParticipantsCsv(emptyExport.body as Buffer);

    expect(emptyExport.status).toBe(200);
    expect(emptyParsed.rows).toHaveLength(0);
    expect(emptyParsed.header.slice(0, PARTICIPANT_CSV_FIXED_HEADERS.length)).toEqual(
      [...PARTICIPANT_CSV_FIXED_HEADERS]
    );
    expect(emptyParsed.header).toContain("teste - csv");
    expect(
      emptyParsed.header[PARTICIPANT_CSV_FIXED_HEADERS.length]
    ).toBe("teste - csv");

    const participant = await createParticipant({
      eventId: fixture.event.id,
      suffix,
      name: `Respondente ${suffix}`,
      phone: `4091${suffix.slice(-7)}`,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id
    });
    await createFormAnswer({
      eventId: fixture.event.id,
      registrationId: participant.registration.id,
      fieldId: field.id,
      value: `resposta-${suffix}`
    });

    const filledParsed = parseParticipantsCsv(
      (await exportCsv(fixture.event.id)).body as Buffer
    );

    expect(filledParsed.header).toContain("teste - csv");
    expect(
      filledParsed.rows[0]?.[PARTICIPANT_CSV_FIXED_HEADERS.length]
    ).toBe(`resposta-${suffix}`);
  });

  it("keeps a sensitive configured form column when the event has no participants", async () => {
    const suffix = `real-sensitive-${Date.now()}`;
    const fixture = await createEventFixture(suffix);
    await createEventFormField(
      prisma!,
      churchId,
      fixture.event.id,
      {
        label: "teste - csv",
        type: "TEXT",
        isRequired: true,
        isSensitive: true,
        isActive: true,
        ticketIds: [],
        options: []
      }
    );

    const parsed = parseParticipantsCsv(
      (await exportCsv(fixture.event.id)).body as Buffer
    );

    expect(parsed.rows).toHaveLength(0);
    expect(parsed.header).toContain("teste - csv");
    expect(
      parsed.header[PARTICIPANT_CSV_FIXED_HEADERS.length]
    ).toBe("teste - csv");
  });

  it("escapes and prefixes formula injection in form answers", async () => {
    const suffix = `form-inj-${Date.now()}`;
    const fixture = await createEventFixture(suffix);
    const label = `Livre ${suffix}`;
    const field = await createFormField({
      eventId: fixture.event.id,
      label,
      order: 1
    });
    const participant = await createParticipant({
      eventId: fixture.event.id,
      suffix,
      name: `Inject Form ${suffix}`,
      phone: `4111${suffix.slice(-7)}`,
      ticketId: fixture.ticket.id,
      ticketBatchId: fixture.batch.id
    });
    await createFormAnswer({
      eventId: fixture.event.id,
      registrationId: participant.registration.id,
      fieldId: field.id,
      value: `=CMD|"/C calc"!A0; "x"\n${suffix}`
    });

    const parsed = parseParticipantsCsv(
      (await exportCsv(fixture.event.id)).body as Buffer
    );
    const answer =
      parsed.rows[0]?.[PARTICIPANT_CSV_FIXED_HEADERS.length] ?? "";

    expect(answer.startsWith("=")).toBe(false);
    expect(answer).toBe(`'=CMD|"/C calc"!A0; "x"\n${suffix}`);
  });

  it("loads form answers in batches instead of querying per participant", async () => {
    const suffix = `nplusone-${Date.now()}`;
    const fixture = await createEventFixture(suffix);
    const labels = [
      `Lote campo ${suffix} 1`,
      `Lote campo ${suffix} 2`,
      `Lote campo ${suffix} 3`
    ];
    const fields = [];

    for (const [index, label] of labels.entries()) {
      fields.push(
        await createFormField({
          eventId: fixture.event.id,
          label,
          order: index + 1
        })
      );
    }

    for (let index = 0; index < 8; index += 1) {
      const participant = await createParticipant({
        eventId: fixture.event.id,
        suffix: `${suffix}-${index}`,
        name: `Lote ${suffix} ${index}`,
        phone: `410${index}${suffix.slice(-6)}`,
        ticketId: fixture.ticket.id,
        ticketBatchId: fixture.batch.id
      });

      for (const [fieldIndex, field] of fields.entries()) {
        await createFormAnswer({
          eventId: fixture.event.id,
          registrationId: participant.registration.id,
          fieldId: field.id,
          value: `v-${index}-${fieldIndex}`
        });
      }
    }

    exportQueryCount = 0;
    countingExportQueries = true;
    const csvExport = await createEventRegistrationsCsvExport(
      prisma!,
      churchId,
      fixture.event.id,
      {}
    );
    const chunks: string[] = [];
    await csvExport.stream((chunk) => {
      chunks.push(chunk);
    });
    countingExportQueries = false;

    const parsed = parseParticipantsCsv(Buffer.from(chunks.join(""), "utf8"));

    expect(parsed.rows).toHaveLength(8);
    expect(parsed.header.slice(PARTICIPANT_CSV_FIXED_HEADERS.length)).toEqual(
      labels
    );
    expect(parsed.rows[0]?.[PARTICIPANT_CSV_FIXED_HEADERS.length]).toBe(
      "v-0-0"
    );
    expect(parsed.rows[7]?.[PARTICIPANT_CSV_FIXED_HEADERS.length + 2]).toBe(
      "v-7-2"
    );
    expect(exportQueryCount).toBeGreaterThan(2);
    expect(exportQueryCount).toBeLessThan(20);
  });
});
