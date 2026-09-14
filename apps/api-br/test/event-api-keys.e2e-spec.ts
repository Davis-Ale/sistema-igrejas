import { createHash } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@sistema-igrejas/database";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { buildApp } from "../src/app.js";

const SENSITIVE_NEEDLES = [
  "checkInToken",
  "cpf",
  "keyHash",
  "token",
  "asaasId",
  "holderDocument",
  "providerPaymentId"
];

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function assertNoSensitiveFields(payload: unknown) {
  const serialized = JSON.stringify(payload);

  for (const needle of SENSITIVE_NEEDLES) {
    expect(serialized).not.toContain(`"${needle}"`);
  }
}

describe("Event API keys and public API v1 E2E", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient | null = null;
  let pastorToken = "";
  let leaderToken = "";
  let churchId = "";
  let personId = "";
  let churchBId = "";
  let churchBToken = "";
  const createdEventIds: string[] = [];
  const createdApiKeyIds: string[] = [];
  const createdChurchIds: string[] = [];
  const createdVisitorIds: string[] = [];
  const runId = `apikey-${Date.now()}`;

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

    const churchB = await prisma.church.create({
      data: {
        name: `Igreja API ${runId}`,
        slug: `igreja-api-${runId}`,
        plan: "TRIAL",
        status: "ACTIVE"
      }
    });
    churchBId = churchB.id;
    createdChurchIds.push(churchB.id);

    churchBToken = await app.jwt.sign({
      userId: personId,
      churchId: churchB.id,
      role: "SUPER_ADMIN"
    });
  });

  afterAll(async () => {
    if (prisma) {
      if (createdVisitorIds.length > 0) {
        await prisma.registration.deleteMany({
          where: {
            visitorId: {
              in: createdVisitorIds
            }
          }
        });
        await prisma.visitor.deleteMany({
          where: {
            id: {
              in: createdVisitorIds
            }
          }
        });
      }

      if (createdEventIds.length > 0) {
        await prisma.registration.deleteMany({
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

      if (createdApiKeyIds.length > 0) {
        await prisma.eventApiKey.deleteMany({
          where: {
            id: {
              in: createdApiKeyIds
            }
          }
        });
      }

      if (createdChurchIds.length > 0) {
        await prisma.eventApiKey.deleteMany({
          where: {
            churchId: {
              in: createdChurchIds
            }
          }
        });
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

  async function createEvent(church: string, suffix: string) {
    const event = await prisma!.event.create({
      data: {
        churchId: church,
        title: `API Event ${suffix}`,
        slug: `api-event-${suffix}`,
        date: new Date("2026-12-01T20:00:00.000Z"),
        capacity: 50,
        price: 0,
        isPublic: true,
        isPaid: false,
        publicRegistrationEnabled: true
      }
    });
    createdEventIds.push(event.id);
    return event;
  }

  async function createAdminKey(input: {
    token: string;
    name: string;
    scopes: string[];
    description?: string;
  }) {
    const response = await request(app.server)
      .post("/api/events/api-keys")
      .set("Authorization", `Bearer ${input.token}`)
      .send({
        name: input.name,
        description: input.description,
        scopes: input.scopes
      });

    if (response.status === 201 && response.body?.id) {
      createdApiKeyIds.push(response.body.id as string);
    }

    return response;
  }

  it("creates a key with one-time token, hashed secret and list without secrets", async () => {
    const created = await createAdminKey({
      token: pastorToken,
      name: `leitura-${runId}`,
      scopes: ["events:read"]
    });

    expect(created.status).toBe(201);
    expect(created.body.token).toMatch(/^sik_[a-f0-9]{64}$/);
    expect(created.body.keyPrefix).toBe(
      (created.body.token as string).slice(0, 8)
    );
    expect(created.body.scopes).toEqual(["events:read"]);
    expect(created.body.keyHash).toBeUndefined();

    const stored = await prisma!.eventApiKey.findUnique({
      where: {
        id: created.body.id as string
      }
    });

    expect(stored).not.toBeNull();
    expect(stored?.keyHash).toBe(sha256(created.body.token as string));
    expect(JSON.stringify(stored)).not.toContain(created.body.token);

    const list = await request(app.server)
      .get("/api/events/api-keys")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    const listed = (list.body as Array<Record<string, unknown>>).find(
      (item) => item.id === created.body.id
    );
    expect(listed).toBeDefined();
    expect(listed?.token).toBeUndefined();
    expect(listed?.keyHash).toBeUndefined();
    assertNoSensitiveFields(listed);

    const secondList = await request(app.server)
      .get("/api/events/api-keys")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(JSON.stringify(secondList.body)).not.toContain(created.body.token);

    const secondCreate = await createAdminKey({
      token: pastorToken,
      name: `leitura-2-${runId}`,
      scopes: ["events:read"]
    });

    expect(secondCreate.status).toBe(201);
    expect(secondCreate.body.token).not.toBe(created.body.token);
    expect(JSON.stringify(secondCreate.body)).not.toContain(
      created.body.token
    );
  });

  it("revokes a key and rejects it on /api/v1", async () => {
    const created = await createAdminKey({
      token: pastorToken,
      name: `revoke-${runId}`,
      scopes: ["events:read"]
    });

    expect(created.status).toBe(201);

    const revoked = await request(app.server)
      .post(`/api/events/api-keys/${created.body.id}/revoke`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(revoked.status).toBe(200);
    expect(revoked.body.token).toBeUndefined();
    expect(revoked.body.revokedAt).toBeTruthy();

    const stored = await prisma!.eventApiKey.findUnique({
      where: {
        id: created.body.id as string
      }
    });
    expect(stored?.revokedAt).not.toBeNull();

    const v1 = await request(app.server)
      .get("/api/v1/events")
      .set("X-Api-Key", created.body.token as string);

    expect(v1.status).toBe(401);
    expect(v1.body.error).toBe("API_KEY_INVALID");
  });

  it("isolates keys and events by churchId", async () => {
    const eventA = await createEvent(churchId, `a-${runId}`);
    const eventB = await createEvent(churchBId, `b-${runId}`);

    const keyA = await createAdminKey({
      token: pastorToken,
      name: `iso-a-${runId}`,
      scopes: ["events:read"]
    });
    const keyB = await createAdminKey({
      token: churchBToken,
      name: `iso-b-${runId}`,
      scopes: ["events:read"]
    });

    expect(keyA.status).toBe(201);
    expect(keyB.status).toBe(201);

    const listA = await request(app.server)
      .get("/api/v1/events")
      .set("X-Api-Key", keyA.body.token as string);

    expect(listA.status).toBe(200);
    const idsA = (listA.body.items as Array<{ id: string }>).map(
      (item) => item.id
    );
    expect(idsA).toContain(eventA.id);
    expect(idsA).not.toContain(eventB.id);

    const otherList = await request(app.server)
      .get("/api/events/api-keys")
      .set("Authorization", `Bearer ${churchBToken}`);

    expect(otherList.status).toBe(200);
    expect(
      (otherList.body as Array<{ id: string }>).some(
        (item) => item.id === keyA.body.id
      )
    ).toBe(false);

    const otherRevoke = await request(app.server)
      .post(`/api/events/api-keys/${keyA.body.id}/revoke`)
      .set("Authorization", `Bearer ${churchBToken}`);

    expect(otherRevoke.status).toBe(404);

    const foreignEvent = await request(app.server)
      .get(`/api/v1/events/${eventA.id}`)
      .set("X-Api-Key", keyB.body.token as string);

    expect(foreignEvent.status).toBe(404);
  });

  it("enforces scopes, pagination and public DTOs", async () => {
    const event = await createEvent(churchId, `scope-${runId}`);
    const ticket = await prisma!.eventTicket.create({
      data: {
        churchId,
        eventId: event.id,
        name: `Ingresso ${runId}`,
        isFree: true,
        isVisible: true
      }
    });

    const visitor = await prisma!.visitor.create({
      data: {
        churchId,
        name: `Participante ${runId}`,
        phone: "41999990000",
        email: `part-${runId}@e2e.local`,
        notes: "nota interna"
      }
    });
    createdVisitorIds.push(visitor.id);

    await prisma!.registration.create({
      data: {
        churchId,
        eventId: event.id,
        visitorId: visitor.id,
        ticketId: ticket.id,
        status: "CONFIRMED",
        paymentStatus: "NOT_REQUIRED",
        checkInToken: `tok-${runId}`
      }
    });

    const readEvents = await createAdminKey({
      token: pastorToken,
      name: `scope-events-${runId}`,
      scopes: ["events:read"]
    });
    const fullKey = await createAdminKey({
      token: pastorToken,
      name: `scope-full-${runId}`,
      scopes: [
        "events:read",
        "registrations:read",
        "participants:read"
      ]
    });

    expect(readEvents.status).toBe(201);
    expect(fullKey.status).toBe(201);

    const eventsList = await request(app.server)
      .get("/api/v1/events?limit=1&page=1")
      .set("X-Api-Key", readEvents.body.token as string);

    expect(eventsList.status).toBe(200);
    expect(eventsList.body.items).toHaveLength(1);
    expect(eventsList.body.pagination.limit).toBe(1);
    expect(eventsList.body.pagination.page).toBe(1);
    expect(eventsList.body.pagination.currentPage).toBe(1);
    assertNoSensitiveFields(eventsList.body);

    const eventDetail = await request(app.server)
      .get(`/api/v1/events/${event.id}`)
      .set("X-Api-Key", readEvents.body.token as string);

    expect(eventDetail.status).toBe(200);
    expect(eventDetail.body.id).toBe(event.id);
    expect(eventDetail.body.tickets[0].id).toBe(ticket.id);
    assertNoSensitiveFields(eventDetail.body);

    const deniedRegistrations = await request(app.server)
      .get(`/api/v1/events/${event.id}/registrations`)
      .set("X-Api-Key", readEvents.body.token as string);

    expect(deniedRegistrations.status).toBe(403);
    expect(deniedRegistrations.body.error).toBe("API_KEY_SCOPE_DENIED");

    const deniedParticipants = await request(app.server)
      .get(`/api/v1/events/${event.id}/participants`)
      .set("X-Api-Key", readEvents.body.token as string);

    expect(deniedParticipants.status).toBe(403);

    const registrations = await request(app.server)
      .get(`/api/v1/events/${event.id}/registrations`)
      .set("X-Api-Key", fullKey.body.token as string);

    expect(registrations.status).toBe(200);
    assertNoSensitiveFields(registrations.body);

    const participants = await request(app.server)
      .get(`/api/v1/events/${event.id}/participants`)
      .set("X-Api-Key", fullKey.body.token as string);

    expect(participants.status).toBe(200);
    expect(participants.body.items[0].participant.name).toBe(
      `Participante ${runId}`
    );
    expect(participants.body.items[0].participant.email).toBe(
      `part-${runId}@e2e.local`
    );
    expect(participants.body.items[0].participant.phone).toBe("41999990000");
    expect(participants.body.items[0].checkInToken).toBeUndefined();
    assertNoSensitiveFields(participants.body);

    const storedBefore = await prisma!.eventApiKey.findUnique({
      where: {
        id: readEvents.body.id as string
      },
      select: {
        lastUsedAt: true
      }
    });

    const used = await request(app.server)
      .get("/api/v1/events")
      .set("X-Api-Key", readEvents.body.token as string);

    expect(used.status).toBe(200);

    const storedAfter = await prisma!.eventApiKey.findUnique({
      where: {
        id: readEvents.body.id as string
      },
      select: {
        lastUsedAt: true
      }
    });

    expect(storedAfter?.lastUsedAt).toBeTruthy();
    if (storedBefore?.lastUsedAt) {
      expect(storedAfter!.lastUsedAt!.getTime()).toBeGreaterThanOrEqual(
        storedBefore.lastUsedAt.getTime()
      );
    }
  });

  it("rejects missing API key, JWT-only access, LEADER create and duplicate names", async () => {
    const missing = await request(app.server).get("/api/v1/events");
    expect(missing.status).toBe(401);

    const jwtOnly = await request(app.server)
      .get("/api/v1/events")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(jwtOnly.status).toBe(401);

    const leaderCreate = await createAdminKey({
      token: leaderToken,
      name: `leader-${runId}`,
      scopes: ["events:read"]
    });
    expect(leaderCreate.status).toBe(403);

    const first = await createAdminKey({
      token: pastorToken,
      name: `unique-${runId}`,
      scopes: ["events:read"]
    });
    expect(first.status).toBe(201);

    const duplicate = await createAdminKey({
      token: pastorToken,
      name: `unique-${runId}`,
      scopes: ["events:read"]
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toBe("EVENT_API_KEY_NAME_ALREADY_EXISTS");
  });
});
