import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@sistema-igrejas/database";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { buildApp } from "../src/app.js";

describe("Event preview E2E", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient | null = null;
  let pastorToken = "";
  let otherTenantToken = "";
  let churchId = "";
  let churchSlug = "";
  const createdEventIds: string[] = [];
  const createdChurchIds: string[] = [];
  const runId = `preview-${Date.now()}`;

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

    const otherChurch = await prisma.church.create({
      data: {
        name: `Igreja Preview ${runId}`,
        slug: `igreja-preview-${runId}`,
        plan: "TRIAL",
        status: "ACTIVE"
      }
    });
    createdChurchIds.push(otherChurch.id);

    otherTenantToken = await app.jwt.sign({
      userId: loginResponse.body.user.id as string,
      churchId: otherChurch.id,
      role: "SUPER_ADMIN"
    });
  });

  afterAll(async () => {
    if (prisma) {
      if (createdEventIds.length > 0) {
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

  async function createDraftEvent(suffix: string) {
    const now = Date.now();
    const event = await prisma!.event.create({
      data: {
        churchId,
        title: `Preview Draft ${suffix}`,
        slug: `preview-draft-${suffix}`,
        date: new Date("2026-11-15T20:00:00.000Z"),
        capacity: 80,
        price: 50,
        isPublic: false,
        isPaid: true,
        publicRegistrationEnabled: false
      }
    });
    createdEventIds.push(event.id);

    const visibleTicket = await prisma!.eventTicket.create({
      data: {
        churchId,
        eventId: event.id,
        name: `Ingresso visível ${suffix}`,
        description: "Descrição real do ingresso",
        isFree: false,
        isVisible: true
      }
    });

    const hiddenTicket = await prisma!.eventTicket.create({
      data: {
        churchId,
        eventId: event.id,
        name: `Ingresso oculto ${suffix}`,
        isFree: false,
        isVisible: false
      }
    });

    const visibleBatch = await prisma!.ticketBatch.create({
      data: {
        churchId,
        eventId: event.id,
        ticketId: visibleTicket.id,
        name: `Primeiro lote ${suffix}`,
        quantity: 40,
        price: 50,
        salesStart: new Date(now - 60_000),
        salesEnd: new Date(now + 86_400_000),
        isVisible: true
      }
    });

    await prisma!.ticketBatch.create({
      data: {
        churchId,
        eventId: event.id,
        ticketId: hiddenTicket.id,
        name: `Lote oculto ${suffix}`,
        quantity: 10,
        price: 50,
        salesStart: new Date(now - 60_000),
        salesEnd: new Date(now + 86_400_000),
        isVisible: true
      }
    });

    await prisma!.eventFormField.create({
      data: {
        churchId,
        eventId: event.id,
        label: `Igreja de origem ${suffix}`,
        type: "TEXT",
        isRequired: false,
        isSensitive: false,
        order: 1,
        isActive: true
      }
    });

    return {
      event,
      visibleTicket,
      hiddenTicket,
      visibleBatch
    };
  }

  it("lets an authorized admin preview an unpublished event with real saved data", async () => {
    const fixture = await createDraftEvent(`${runId}-own`);

    const response = await request(app.server)
      .get(`/api/events/${fixture.event.id}/preview`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(fixture.event.id);
    expect(response.body.title).toBe(fixture.event.title);
    expect(response.body.slug).toBe(fixture.event.slug);
    expect(response.body.isPublic).toBe(false);
    expect(response.body.church.slug).toBe(churchSlug);
    expect(Number(response.body.price)).toBe(50);
    expect(response.body.isPaid).toBe(true);
    expect(
      response.body.ticketTypes.map(
        (ticket: { name: string }) => ticket.name
      )
    ).toEqual([fixture.visibleTicket.name]);
    expect(response.body.ticketTypes[0].batches[0].name).toBe(
      fixture.visibleBatch.name
    );
    expect(Number(response.body.ticketTypes[0].batches[0].price)).toBe(50);
    expect(
      response.body.formFields.map(
        (field: { label: string }) => field.label
      )
    ).toEqual([`Igreja de origem ${runId}-own`]);
    expect(JSON.stringify(response.body)).not.toMatch(/checkInToken/);
    expect(JSON.stringify(response.body)).not.toContain(
      fixture.hiddenTicket.name
    );
  });

  it("does not publish the event when preview is opened", async () => {
    const fixture = await createDraftEvent(`${runId}-stay-draft`);

    const response = await request(app.server)
      .get(`/api/events/${fixture.event.id}/preview`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(response.status).toBe(200);
    expect(response.body.isPublic).toBe(false);

    const persisted = await prisma!.event.findUnique({
      where: {
        id: fixture.event.id
      },
      select: {
        isPublic: true,
        publicRegistrationEnabled: true
      }
    });

    expect(persisted).toEqual({
      isPublic: false,
      publicRegistrationEnabled: false
    });
  });

  it("rejects anonymous preview of an unpublished event", async () => {
    const fixture = await createDraftEvent(`${runId}-anon`);

    const response = await request(app.server).get(
      `/api/events/${fixture.event.id}/preview`
    );

    expect(response.status).toBe(401);

    const persisted = await prisma!.event.findUnique({
      where: {
        id: fixture.event.id
      },
      select: {
        isPublic: true
      }
    });

    expect(persisted?.isPublic).toBe(false);
  });

  it("rejects preview from another churchId", async () => {
    const fixture = await createDraftEvent(`${runId}-cross`);

    const response = await request(app.server)
      .get(`/api/events/${fixture.event.id}/preview`)
      .set("Authorization", `Bearer ${otherTenantToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("EVENT_NOT_FOUND");
  });

  it("returns 404 for an invalid eventId", async () => {
    const response = await request(app.server)
      .get("/api/events/does-not-exist-preview/preview")
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("EVENT_NOT_FOUND");
  });

  it("keeps the public page blocked for unpublished events after preview", async () => {
    const fixture = await createDraftEvent(`${runId}-public-block`);

    await request(app.server)
      .get(`/api/events/${fixture.event.id}/preview`)
      .set("Authorization", `Bearer ${pastorToken}`);

    const publicResponse = await request(app.server).get(
      `/public/events/${fixture.event.id}`
    );

    expect(publicResponse.status).toBe(404);
    expect(publicResponse.body.error).toBe("PUBLIC_EVENT_NOT_FOUND");
  });

  it("keeps a published event publicly accessible and previewable", async () => {
    const fixture = await createDraftEvent(`${runId}-published`);

    const published = await request(app.server)
      .patch(`/api/events/${fixture.event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`)
      .send({
        isPublic: true,
        publicRegistrationEnabled: true
      });

    expect(published.status).toBe(200);
    expect(published.body.isPublic).toBe(true);

    const preview = await request(app.server)
      .get(`/api/events/${fixture.event.id}/preview`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(preview.status).toBe(200);
    expect(preview.body.id).toBe(fixture.event.id);
    expect(preview.body.isPublic).toBe(true);
    expect(preview.body.title).toBe(fixture.event.title);

    const publicResponse = await request(app.server).get(
      `/public/events/${fixture.event.id}`
    );

    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body.id).toBe(fixture.event.id);
    expect(publicResponse.body.title).toBe(fixture.event.title);
    expect(publicResponse.body.isPublic).toBe(true);
    expect(
      publicResponse.body.ticketTypes.map(
        (ticket: { name: string }) => ticket.name
      )
    ).toEqual([fixture.visibleTicket.name]);
  });

  it("shows saved title changes in preview without publishing", async () => {
    const fixture = await createDraftEvent(`${runId}-rename`);
    const nextTitle = `Preview Renomeado ${runId}`;

    const updated = await request(app.server)
      .patch(`/api/events/${fixture.event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`)
      .send({
        title: nextTitle
      });

    expect(updated.status).toBe(200);
    expect(updated.body.isPublic).toBe(false);

    const preview = await request(app.server)
      .get(`/api/events/${fixture.event.id}/preview`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(preview.status).toBe(200);
    expect(preview.body.title).toBe(nextTitle);
    expect(preview.body.id).toBe(fixture.event.id);

    const persisted = await prisma!.event.findUnique({
      where: {
        id: fixture.event.id
      },
      select: {
        title: true,
        isPublic: true
      }
    });

    expect(persisted).toEqual({
      title: nextTitle,
      isPublic: false
    });
  });

  it("does not create registration or payment from preview or draft public register", async () => {
    const fixture = await createDraftEvent(`${runId}-no-charge`);

    const beforeRegistrations = await prisma!.registration.count({
      where: {
        eventId: fixture.event.id
      }
    });
    const beforePayments = await prisma!.eventPayment.count({
      where: {
        eventId: fixture.event.id
      }
    });

    const preview = await request(app.server)
      .get(`/api/events/${fixture.event.id}/preview`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(preview.status).toBe(200);

    const register = await request(app.server)
      .post(`/public/events/${fixture.event.id}/register`)
      .send({
        name: "Participante Preview",
        phone: "41999990000",
        email: `preview-${runId}@e2e.local`,
        cpf: "52998224725",
        paymentMethod: "PIX",
        ticketId: fixture.visibleTicket.id,
        ticketBatchId: fixture.visibleBatch.id,
        answers: []
      });

    expect(register.status).toBe(404);
    expect(register.body.error).toBe("PUBLIC_EVENT_NOT_FOUND");

    const afterRegistrations = await prisma!.registration.count({
      where: {
        eventId: fixture.event.id
      }
    });
    const afterPayments = await prisma!.eventPayment.count({
      where: {
        eventId: fixture.event.id
      }
    });

    expect(afterRegistrations).toBe(beforeRegistrations);
    expect(afterPayments).toBe(beforePayments);
  });

  it("keeps publication independent from preview", async () => {
    const fixture = await createDraftEvent(`${runId}-publish-reg`);

    const previewBefore = await request(app.server)
      .get(`/api/events/${fixture.event.id}/preview`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(previewBefore.status).toBe(200);
    expect(previewBefore.body.isPublic).toBe(false);

    const published = await request(app.server)
      .patch(`/api/events/${fixture.event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`)
      .send({
        isPublic: true
      });

    expect(published.status).toBe(200);
    expect(published.body.isPublic).toBe(true);

    const previewAfter = await request(app.server)
      .get(`/api/events/${fixture.event.id}/preview`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(previewAfter.status).toBe(200);
    expect(previewAfter.body.isPublic).toBe(true);

    const unpublished = await request(app.server)
      .patch(`/api/events/${fixture.event.id}`)
      .set("Authorization", `Bearer ${pastorToken}`)
      .send({
        isPublic: false
      });

    expect(unpublished.status).toBe(200);
    expect(unpublished.body.isPublic).toBe(false);

    const publicAfterUnpublish = await request(app.server).get(
      `/public/events/${fixture.event.id}`
    );

    expect(publicAfterUnpublish.status).toBe(404);
    expect(publicAfterUnpublish.body.error).toBe(
      "PUBLIC_EVENT_NOT_FOUND"
    );
  });
});
