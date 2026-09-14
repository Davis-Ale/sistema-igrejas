import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@sistema-igrejas/database";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { buildApp } from "../src/app.js";

const TEST_ENCRYPTION_KEY =
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const MAILCHIMP_API_KEY = `${"a".repeat(32)}-us1`;
const WHATSAPP_TOKEN = `EAA${"x".repeat(40)}`;

function assertNoSecretLeak(payload: unknown, extraNeedles: string[] = []) {
  const serialized = JSON.stringify(payload);

  expect(serialized).not.toContain('"encryptedSecrets"');
  expect(serialized).not.toContain('"accessToken"');
  expect(serialized).not.toContain('"apiKey"');

  for (const needle of extraNeedles) {
    expect(serialized).not.toContain(needle);
  }
}

function findProvider<T extends { provider: string }>(
  items: T[],
  provider: string
) {
  return items.find((item) => item.provider === provider);
}

describe("Event integrations E2E", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient | null = null;
  let pastorToken = "";
  let leaderToken = "";
  let churchId = "";
  let personId = "";
  let churchBId = "";
  let churchBToken = "";
  const createdEventIds: string[] = [];
  const createdChurchIds: string[] = [];
  const runId = `int-${Date.now()}`;
  let fetchSpy: jest.SpiedFunction<typeof fetch> | undefined;

  beforeAll(async () => {
    process.env.EVENTS_INTEGRATIONS_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;

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
        name: `Igreja INT ${runId}`,
        slug: `igreja-int-${runId}`,
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

    await prisma.eventIntegration.deleteMany({
      where: {
        churchId
      }
    });
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    fetchSpy = undefined;
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

      await prisma.eventIntegration.deleteMany({
        where: {
          churchId: {
            in: [churchId, ...createdChurchIds]
          }
        }
      });

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

  async function createPublicEvent(suffix: string) {
    const event = await prisma!.event.create({
      data: {
        churchId,
        title: `INT Event ${suffix}`,
        slug: `int-event-${suffix}`,
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

  it("rejects GET without JWT", async () => {
    const response = await request(app.server).get("/api/events/integrations");

    expect(response.status).toBe(401);
  });

  it("lists six catalog providers and keeps RD Station disconnected", async () => {
    const response = await request(app.server)
      .get("/api/events/integrations")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(6);
    assertNoSecretLeak(response.body);

    const rd = findProvider(
      response.body as Array<{
        provider: string;
        connectable: boolean;
        status: string;
        blockedReason: string | null;
      }>,
      "RD_STATION"
    );

    expect(rd).toBeDefined();
    expect(rd?.connectable).toBe(false);
    expect(rd?.status).toBe("DISCONNECTED");
    expect(rd?.blockedReason).toBe("PLATFORM_CREDENTIALS_REQUIRED");
  });

  it("rejects RD Station connect without creating a connected row", async () => {
    const response = await request(app.server)
      .post("/api/events/integrations/rd-station/connect")
      .set("Authorization", `Bearer ${pastorToken}`)
      .send({});

    expect([400, 409]).toContain(response.status);
    expect(response.body.error).toBe("INTEGRATION_NOT_CONNECTABLE");

    const stored = await prisma!.eventIntegration.findUnique({
      where: {
        churchId_provider: {
          churchId,
          provider: "RD_STATION"
        }
      }
    });

    expect(stored?.status ?? "DISCONNECTED").not.toBe("CONNECTED");
  });

  it("forbids LEADER from connecting Google Analytics", async () => {
    const response = await request(app.server)
      .post("/api/events/integrations/google-analytics/connect")
      .set("Authorization", `Bearer ${leaderToken}`)
      .send({
        measurementId: "G-TESTLEADER1"
      });

    expect(response.status).toBe(403);
  });

  it("connects Google Analytics, lists the public id and disconnects", async () => {
    const connected = await request(app.server)
      .post("/api/events/integrations/google-analytics/connect")
      .set("Authorization", `Bearer ${pastorToken}`)
      .send({
        measurementId: "G-TESTGA1234"
      });

    expect(connected.status).toBe(200);
    expect(connected.body.status).toBe("CONNECTED");
    expect(connected.body.publicConfig.measurementId).toBe("G-TESTGA1234");
    assertNoSecretLeak(connected.body);

    const list = await request(app.server)
      .get("/api/events/integrations")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(list.status).toBe(200);
    const ga = findProvider(
      list.body as Array<{
        provider: string;
        status: string;
        publicConfig: { measurementId: string } | null;
      }>,
      "GOOGLE_ANALYTICS"
    );
    expect(ga?.status).toBe("CONNECTED");
    expect(ga?.publicConfig?.measurementId).toBe("G-TESTGA1234");
    assertNoSecretLeak(list.body);

    const disconnected = await request(app.server)
      .post("/api/events/integrations/google-analytics/disconnect")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(disconnected.status).toBe(200);
    expect(disconnected.body.status).toBe("DISCONNECTED");
    expect(disconnected.body.publicConfig).toBeNull();
    assertNoSecretLeak(disconnected.body);
  });

  it("rejects invalid measurement id and keeps Google Analytics disconnected", async () => {
    await request(app.server)
      .post("/api/events/integrations/google-analytics/disconnect")
      .set("Authorization", `Bearer ${pastorToken}`);

    const response = await request(app.server)
      .post("/api/events/integrations/google-analytics/connect")
      .set("Authorization", `Bearer ${pastorToken}`)
      .send({
        measurementId: "UA-123456"
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");

    const list = await request(app.server)
      .get("/api/events/integrations")
      .set("Authorization", `Bearer ${pastorToken}`);

    const ga = findProvider(
      list.body as Array<{
        provider: string;
        status: string;
        publicConfig: unknown;
      }>,
      "GOOGLE_ANALYTICS"
    );
    expect(ga?.status).toBe("DISCONNECTED");
    expect(ga?.publicConfig).toBeNull();
  });

  it("isolates connections by churchId", async () => {
    const connected = await request(app.server)
      .post("/api/events/integrations/google-analytics/connect")
      .set("Authorization", `Bearer ${pastorToken}`)
      .send({
        measurementId: "G-CHURCHA999"
      });

    expect(connected.status).toBe(200);

    const otherList = await request(app.server)
      .get("/api/events/integrations")
      .set("Authorization", `Bearer ${churchBToken}`);

    expect(otherList.status).toBe(200);
    const ga = findProvider(
      otherList.body as Array<{
        provider: string;
        status: string;
        publicConfig: { measurementId?: string } | null;
      }>,
      "GOOGLE_ANALYTICS"
    );
    expect(ga?.status).toBe("DISCONNECTED");
    expect(ga?.publicConfig).toBeNull();
    expect(JSON.stringify(otherList.body)).not.toContain("G-CHURCHA999");
  });

  it("connects Mailchimp after a successful ping and hides the api key", async () => {
    fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 200,
      json: async () => ({})
    } as Response);

    const connected = await request(app.server)
      .post("/api/events/integrations/mailchimp/connect")
      .set("Authorization", `Bearer ${pastorToken}`)
      .send({
        apiKey: MAILCHIMP_API_KEY
      });

    expect(connected.status).toBe(200);
    expect(connected.body.status).toBe("CONNECTED");
    expect(connected.body.publicConfig.datacenter).toBe("us14");
    expect(connected.body.secretHint).toContain("us14");
    assertNoSecretLeak(connected.body, [MAILCHIMP_API_KEY]);

    const list = await request(app.server)
      .get("/api/events/integrations")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(list.status).toBe(200);
    assertNoSecretLeak(list.body, [MAILCHIMP_API_KEY]);
    const mailchimp = findProvider(
      list.body as Array<{ provider: string; status: string }>,
      "MAILCHIMP"
    );
    expect(mailchimp?.status).toBe("CONNECTED");
  });

  it("does not persist Mailchimp when ping is rejected", async () => {
    await request(app.server)
      .post("/api/events/integrations/mailchimp/disconnect")
      .set("Authorization", `Bearer ${pastorToken}`);

    fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 401,
      json: async () => ({})
    } as Response);

    const rejected = await request(app.server)
      .post("/api/events/integrations/mailchimp/connect")
      .set("Authorization", `Bearer ${pastorToken}`)
      .send({
        apiKey: MAILCHIMP_API_KEY
      });

    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toBe("INTEGRATION_PROVIDER_REJECTED");

    const list = await request(app.server)
      .get("/api/events/integrations")
      .set("Authorization", `Bearer ${pastorToken}`);

    const mailchimp = findProvider(
      list.body as Array<{ provider: string; status: string }>,
      "MAILCHIMP"
    );
    expect(mailchimp).toBeDefined();
    expect(mailchimp?.status).toBe("DISCONNECTED");
    assertNoSecretLeak(list.body, [MAILCHIMP_API_KEY]);
  });

  it("connects WhatsApp Business Cloud without exposing the access token", async () => {
    fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 200,
      json: async () => ({
        display_phone_number: "+55 11 99999-0000",
        verified_name: "Igreja"
      })
    } as Response);

    const connected = await request(app.server)
      .post("/api/events/integrations/whatsapp-business-cloud/connect")
      .set("Authorization", `Bearer ${pastorToken}`)
      .send({
        accessToken: WHATSAPP_TOKEN,
        phoneNumberId: "123456789012345"
      });

    expect(connected.status).toBe(200);
    expect(connected.body.status).toBe("CONNECTED");
    expect(connected.body.publicConfig.phoneNumberId).toBe("123456789012345");
    expect(connected.body.publicConfig.displayPhoneNumber).toBe(
      "+55 11 99999-0000"
    );
    assertNoSecretLeak(connected.body, [WHATSAPP_TOKEN]);
  });

  it("exposes public tracking ids without secrets", async () => {
    const event = await createPublicEvent(runId);

    const connected = await request(app.server)
      .post("/api/events/integrations/google-analytics/connect")
      .set("Authorization", `Bearer ${pastorToken}`)
      .send({
        measurementId: "G-PUBLICTRACK1"
      });

    expect(connected.status).toBe(200);

    const publicEvent = await request(app.server).get(
      `/public/events/${event.id}`
    );

    expect(publicEvent.status).toBe(200);
    expect(publicEvent.body.tracking.googleAnalyticsId).toBe("G-PUBLICTRACK1");
    expect(publicEvent.body.churchId).toBeUndefined();
    assertNoSecretLeak(publicEvent.body, [MAILCHIMP_API_KEY, WHATSAPP_TOKEN]);

    const preview = await request(app.server)
      .get(`/api/events/${event.id}/preview`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(preview.status).toBe(200);
    expect(preview.body.tracking).toBeUndefined();
  });
});
