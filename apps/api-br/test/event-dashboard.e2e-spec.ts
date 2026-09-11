import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@sistema-igrejas/database";
import { listEvents } from "@sistema-igrejas/events";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { buildApp } from "../src/app.js";

type EventListItem = {
  id: string;
  title: string;
  slug: string;
  date: string;
  capacity: number;
  registrationCount: number;
  registrations?: unknown;
  checkInToken?: unknown;
  person?: unknown;
  visitor?: unknown;
  email?: unknown;
  phone?: unknown;
  cpf?: unknown;
};

type EventListResponse = {
  items: EventListItem[];
  pagination: {
    page: number;
    currentPage: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

function assertSlimEvent(item: EventListItem) {
  expect(typeof item.id).toBe("string");
  expect(item.id.length).toBeGreaterThan(0);
  expect(item).not.toHaveProperty("registrations");
  expect(item).not.toHaveProperty("checkInToken");
  expect(item).not.toHaveProperty("person");
  expect(item).not.toHaveProperty("visitor");
  expect(item).not.toHaveProperty("email");
  expect(item).not.toHaveProperty("phone");
  expect(item).not.toHaveProperty("cpf");
  expect(typeof item.registrationCount).toBe("number");

  const serialized = JSON.stringify(item);
  expect(serialized).not.toMatch(/checkInToken/);
  expect(serialized).not.toMatch(/"email"/);
  expect(serialized).not.toMatch(/"phone"/);
  expect(serialized).not.toMatch(/"cpf"/);
}

describe("Event dashboard list E2E", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient | null = null;
  let pastorToken = "";
  let churchId = "";
  const createdEventIds: string[] = [];
  const createdChurchIds: string[] = [];
  const runId = `dash-${Date.now()}`;
  let otherChurchId = "";
  let otherEventId = "";
  let uniqueSearchTitle = "";
  let countingListQueries = false;
  let listQueryCount = 0;
  const listQueries: string[] = [];

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

    prisma.$on("query" as never, (event: { query?: string }) => {
      if (!countingListQueries) {
        return;
      }

      listQueryCount += 1;

      if (event.query) {
        listQueries.push(event.query);
      }
    });

    uniqueSearchTitle = `DashUnique ${runId}`;

    await prisma.event.createMany({
      data: Array.from({ length: 51 }, (_, index) => ({
        churchId,
        title: `Dash Page ${runId} ${String(index).padStart(2, "0")}`,
        slug: `dash-page-${runId}-${index}`,
        date: new Date(Date.UTC(2026, 0, 1 + (index % 28), 12, index, 0)),
        capacity: 80,
        price: 0,
        isPublic: index % 2 === 0,
        isPaid: false
      }))
    });

    const pageEvents = await prisma.event.findMany({
      where: {
        churchId,
        slug: {
          startsWith: `dash-page-${runId}-`
        }
      },
      select: {
        id: true
      }
    });

    createdEventIds.push(...pageEvents.map((item) => item.id));

    const uniqueEvent = await prisma.event.create({
      data: {
        churchId,
        title: uniqueSearchTitle,
        slug: `dash-unique-${runId}`,
        date: new Date("2026-06-15T20:00:00.000Z"),
        capacity: 10,
        price: 0,
        isPublic: false,
        isPaid: false
      }
    });
    createdEventIds.push(uniqueEvent.id);

    const titleOrderEvents = await prisma.event.createMany({
      data: [
        {
          churchId,
          title: `DashAlpha ${runId}`,
          slug: `dash-alpha-${runId}`,
          date: new Date("2026-03-01T20:00:00.000Z"),
          capacity: 10,
          price: 0,
          isPublic: false,
          isPaid: false
        },
        {
          churchId,
          title: `DashZulu ${runId}`,
          slug: `dash-zulu-${runId}`,
          date: new Date("2026-03-02T20:00:00.000Z"),
          capacity: 10,
          price: 0,
          isPublic: false,
          isPaid: false
        }
      ]
    });

    expect(titleOrderEvents.count).toBe(2);

    const titled = await prisma.event.findMany({
      where: {
        churchId,
        slug: {
          in: [`dash-alpha-${runId}`, `dash-zulu-${runId}`]
        }
      },
      select: {
        id: true
      }
    });
    createdEventIds.push(...titled.map((item) => item.id));

    const otherChurch = await prisma.church.create({
      data: {
        name: `Igreja Dash ${runId}`,
        slug: `igreja-dash-${runId}`,
        plan: "TRIAL",
        status: "ACTIVE"
      }
    });
    createdChurchIds.push(otherChurch.id);
    otherChurchId = otherChurch.id;

    const foreignEvent = await prisma.event.create({
      data: {
        churchId: otherChurch.id,
        title: uniqueSearchTitle,
        slug: `dash-foreign-${runId}`,
        date: new Date("2026-12-01T20:00:00.000Z"),
        capacity: 10,
        price: 0,
        isPublic: true,
        isPaid: false
      }
    });
    createdEventIds.push(foreignEvent.id);
    otherEventId = foreignEvent.id;
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

  it("rejects listing events without authorization", async () => {
    const response = await request(app.server).get("/api/events");

    expect(response.status).toBe(401);
  });

  it("does not include events from another tenant", async () => {
    const response = await request(app.server)
      .get("/api/events?limit=100")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(response.status).toBe(200);

    const body = response.body as EventListResponse;
    const ids = body.items.map((item) => item.id);

    expect(ids).not.toContain(otherEventId);
  });

  it("ignores churchId from the query and uses the token tenant", async () => {
    const response = await request(app.server)
      .get(`/api/events?churchId=${encodeURIComponent(otherChurchId)}&limit=100`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(response.status).toBe(200);

    const body = response.body as EventListResponse;
    const ids = body.items.map((item) => item.id);

    expect(ids).not.toContain(otherEventId);
    expect(ids.some((id) => createdEventIds.includes(id))).toBe(true);
  });

  it("returns a paginated envelope without PII or registrations", async () => {
    const response = await request(app.server)
      .get("/api/events")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(response.status).toBe(200);
    expect(response.status).not.toBe(302);
    expect(Array.isArray(response.body)).toBe(false);

    const body = response.body as EventListResponse;

    expect(Array.isArray(body.items)).toBe(true);
    expect(body.pagination).toEqual(
      expect.objectContaining({
        page: 1,
        currentPage: 1,
        limit: 50,
        total: expect.any(Number),
        totalPages: expect.any(Number)
      })
    );

    expect(body.items.length).toBeGreaterThan(0);
    body.items.forEach((item) => assertSlimEvent(item));
  });

  it("paginates with limit 50 and rejects limit 101", async () => {
    const firstPage = await request(app.server)
      .get("/api/events?page=1&limit=50")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(firstPage.status).toBe(200);

    const firstBody = firstPage.body as EventListResponse;
    expect(firstBody.items).toHaveLength(50);
    expect(firstBody.pagination.total).toBeGreaterThanOrEqual(51);
    expect(firstBody.pagination.totalPages).toBeGreaterThanOrEqual(2);
    expect(firstBody.pagination.limit).toBe(50);

    const secondPage = await request(app.server)
      .get("/api/events?page=2&limit=50")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(secondPage.status).toBe(200);

    const secondBody = secondPage.body as EventListResponse;
    expect(secondBody.items.length).toBeGreaterThanOrEqual(1);
    expect(
      secondBody.items.some((item) =>
        firstBody.items.some((first) => first.id === item.id)
      )
    ).toBe(false);

    const invalid = await request(app.server)
      .get("/api/events?limit=101")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(invalid.status).toBe(400);
  });

  it("orders by date desc by default and by title asc when requested", async () => {
    const defaultOrder = await request(app.server)
      .get("/api/events?limit=50")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(defaultOrder.status).toBe(200);

    const defaultItems = (defaultOrder.body as EventListResponse).items;
    const defaultDates = defaultItems.map((item) => new Date(item.date).getTime());

    for (let index = 1; index < defaultDates.length; index += 1) {
      expect(defaultDates[index - 1]).toBeGreaterThanOrEqual(defaultDates[index] ?? 0);
    }

    const titled = await request(app.server)
      .get(
        `/api/events?search=${encodeURIComponent(`DashAlpha ${runId}`)}&orderBy=title&order=asc`
      )
      .set("Authorization", `Bearer ${pastorToken}`);

    const zulu = await request(app.server)
      .get(
        `/api/events?search=${encodeURIComponent(`DashZulu ${runId}`)}&orderBy=title&order=asc`
      )
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(titled.status).toBe(200);
    expect(zulu.status).toBe(200);

    const combined = await request(app.server)
      .get(
        `/api/events?search=${encodeURIComponent(runId)}&orderBy=title&order=asc&limit=100`
      )
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(combined.status).toBe(200);

    const titles = (combined.body as EventListResponse).items.map(
      (item) => item.title
    );
    const alphaIndex = titles.indexOf(`DashAlpha ${runId}`);
    const zuluIndex = titles.indexOf(`DashZulu ${runId}`);

    expect(alphaIndex).toBeGreaterThanOrEqual(0);
    expect(zuluIndex).toBeGreaterThan(alphaIndex);
  });

  it("searches by unique title without crossing tenants", async () => {
    const response = await request(app.server)
      .get(`/api/events?search=${encodeURIComponent(uniqueSearchTitle)}`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(response.status).toBe(200);

    const body = response.body as EventListResponse;
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.title).toBe(uniqueSearchTitle);
    expect(body.items[0]?.id).not.toBe(otherEventId);
  });

  it("returns a usable id on every listed event", async () => {
    const response = await request(app.server)
      .get("/api/events?limit=50")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(response.status).toBe(200);

    const body = response.body as EventListResponse;
    expect(body.items.length).toBeGreaterThan(0);

    for (const item of body.items) {
      expect(item.id).toEqual(expect.any(String));
      expect(item.id.length).toBeGreaterThan(8);
    }
  });

  it("keeps POST /api/events unchanged", async () => {
    const response = await request(app.server)
      .post("/api/events")
      .set("Authorization", `Bearer ${pastorToken}`)
      .send({
        title: `Dash Post ${runId}`,
        slug: `dash-post-${runId}`,
        date: "2026-08-20T20:00:00.000Z",
        capacity: 40,
        price: 0,
        isPublic: false,
        isPaid: false,
        publicRegistrationEnabled: false,
        waitlistEnabled: true
      });

    expect(response.status).toBe(201);
    expect(typeof response.body.id).toBe("string");
    expect(response.body.id.length).toBeGreaterThan(0);

    createdEventIds.push(response.body.id as string);
  });

  it("returns 200 with envelope and never redirects", async () => {
    const response = await request(app.server)
      .get("/api/events")
      .redirects(0)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(response.status).toBe(200);
    expect(response.status).not.toBe(302);
    expect(response.headers.location).toBeUndefined();
    expect(Array.isArray(response.body)).toBe(false);
    expect(Array.isArray((response.body as EventListResponse).items)).toBe(
      true
    );
  });

  it("lists events without N+1 registration includes", async () => {
    countingListQueries = true;
    listQueryCount = 0;
    listQueries.length = 0;

    const listed = await listEvents(prisma!, churchId, {
      page: 1,
      limit: 50,
      orderBy: "date",
      order: "desc"
    });

    countingListQueries = false;

    expect(listed.items).toHaveLength(50);
    expect(listed.pagination.total).toBeGreaterThanOrEqual(51);
    listed.items.forEach((item) => {
      expect(typeof item.registrationCount).toBe("number");
      expect(item).not.toHaveProperty("registrations");
    });

    expect(listQueryCount).toBeGreaterThanOrEqual(2);
    expect(listQueryCount).toBeLessThan(10);

    const registrationSelects = listQueries.filter((query) =>
      /from\s+"?registration"?/i.test(query)
    );
    expect(registrationSelects.length).toBeLessThan(3);

    const httpResponse = await request(app.server)
      .get("/api/events?page=1&limit=50")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(httpResponse.status).toBe(200);

    const httpBody = httpResponse.body as EventListResponse;
    expect(httpBody.items).toHaveLength(50);
    httpBody.items.forEach((item) => {
      expect(typeof item.registrationCount).toBe("number");
      expect(item).not.toHaveProperty("registrations");
    });
  });

  it("keeps GET /api/events/financial/summary available", async () => {
    const response = await request(app.server)
      .get("/api/events/financial/summary")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        eventSales: expect.any(Object),
        counts: expect.any(Object)
      })
    );
  });
});
