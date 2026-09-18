import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@sistema-igrejas/database";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { buildApp } from "../src/app.js";

describe("Participant app routes E2E", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let pastorToken = "";
  let leaderToken = "";
  let otherTenantToken = "";
  let churchId = "";
  let otherChurchId = "";
  let eventId = "";
  let otherEventId = "";
  let publicSlug = "";
  let eligibleToken = "";
  let pendingToken = "";
  let cancelledToken = "";
  let waitlistedToken = "";
  let otherEventToken = "";
  let eligibleRegistrationId = "";
  let otherEligibleRegistrationId = "";
  let otherEventRegistrationId = "";
  let publishedMineSessionId = "";
  let publishedOtherSessionId = "";
  let unpublishedSessionId = "";
  const visitorIds: string[] = [];
  const runId = `participant-app-${Date.now()}`;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const login = await request(app.server)
      .post("/auth/login")
      .send({
        email: "pastor@sistemaigrejas.local",
        password: "12345678"
      });

    expect(login.status).toBe(200);
    pastorToken = login.body.token as string;
    churchId = login.body.church.id as string;

    leaderToken = await app.jwt.sign({
      userId: login.body.user.id as string,
      churchId,
      role: "LEADER"
    });

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
        name: `Igreja Participante ${runId}`,
        slug: `igreja-participante-${runId}`,
        plan: "TRIAL",
        status: "ACTIVE"
      }
    });
    otherChurchId = otherChurch.id;
    otherTenantToken = await app.jwt.sign({
      userId: login.body.user.id as string,
      churchId: otherChurchId,
      role: "SUPER_ADMIN"
    });

    const event = await prisma.event.create({
      data: {
        churchId,
        title: `Evento Participante ${runId}`,
        slug: `evento-participante-${runId}`,
        publicSlug: `evento-participante-publico-${runId}`,
        date: new Date("2026-11-20T22:00:00.000Z"),
        capacity: 100,
        price: 50,
        isPublic: true,
        isPaid: true,
        publicRegistrationEnabled: true,
        participantMapImageUrl: "https://example.com/mapa.png"
      }
    });
    eventId = event.id;
    publicSlug = event.publicSlug!;

    const otherEvent = await prisma.event.create({
      data: {
        churchId: otherChurchId,
        title: `Outro Evento ${runId}`,
        slug: `outro-evento-${runId}`,
        publicSlug: `outro-evento-publico-${runId}`,
        date: new Date("2026-11-21T22:00:00.000Z"),
        capacity: 20,
        price: 0,
        isPublic: true,
        isPaid: false,
        publicRegistrationEnabled: true
      }
    });
    otherEventId = otherEvent.id;

    const ticket = await prisma.eventTicket.create({
      data: {
        churchId,
        eventId,
        name: "Ingresso Teste",
        isFree: false,
        isVisible: true
      }
    });
    const otherTicket = await prisma.eventTicket.create({
      data: {
        churchId: otherChurchId,
        eventId: otherEventId,
        name: "Ingresso Outro Evento",
        isFree: true,
        isVisible: true
      }
    });

    const batch = await prisma.ticketBatch.create({
      data: {
        churchId,
        eventId,
        ticketId: ticket.id,
        name: "Lote Teste",
        quantity: 100,
        price: 50,
        salesStart: new Date("2026-01-01T00:00:00.000Z"),
        salesEnd: new Date("2026-11-20T20:00:00.000Z"),
        isVisible: true
      }
    });
    const otherBatch = await prisma.ticketBatch.create({
      data: {
        churchId: otherChurchId,
        eventId: otherEventId,
        ticketId: otherTicket.id,
        name: "Lote Outro Evento",
        quantity: 20,
        price: 0,
        salesStart: new Date("2026-01-01T00:00:00.000Z"),
        salesEnd: new Date("2026-11-21T20:00:00.000Z"),
        isVisible: true
      }
    });

    async function createRegistration(input: {
      suffix: string;
      status: "PENDING" | "CONFIRMED" | "CANCELLED";
      paymentStatus: string;
      waitlistedAt?: Date | null;
      targetChurchId?: string;
      targetEventId?: string;
      targetTicketId?: string;
      targetBatchId?: string;
    }) {
      const targetChurchId = input.targetChurchId ?? churchId;
      const targetEventId = input.targetEventId ?? eventId;
      const visitor = await prisma.visitor.create({
        data: {
          churchId: targetChurchId,
          name: `Participante ${input.suffix}`,
          phone: `41999${String(visitorIds.length).padStart(6, "0")}`,
          email: `${input.suffix}-${runId}@e2e.local`
        }
      });
      visitorIds.push(visitor.id);

      return prisma.registration.create({
        data: {
          churchId: targetChurchId,
          eventId: targetEventId,
          ticketId: input.targetTicketId ?? ticket.id,
          ticketBatchId: input.targetBatchId ?? batch.id,
          visitorId: visitor.id,
          status: input.status,
          paymentStatus: input.paymentStatus,
          waitlistedAt: input.waitlistedAt ?? null,
          registrationSource: "PUBLIC"
        }
      });
    }

    const eligible = await createRegistration({
      suffix: "Elegível",
      status: "CONFIRMED",
      paymentStatus: "PAID"
    });
    eligibleRegistrationId = eligible.id;
    eligibleToken = eligible.checkInToken;

    const otherEligible = await createRegistration({
      suffix: "Outra Pessoa",
      status: "CONFIRMED",
      paymentStatus: "PAID"
    });
    otherEligibleRegistrationId = otherEligible.id;

    const pending = await createRegistration({
      suffix: "Pendente",
      status: "PENDING",
      paymentStatus: "PENDING"
    });
    pendingToken = pending.checkInToken;

    const cancelled = await createRegistration({
      suffix: "Cancelado",
      status: "CANCELLED",
      paymentStatus: "PAID"
    });
    cancelledToken = cancelled.checkInToken;

    const waitlisted = await createRegistration({
      suffix: "Espera",
      status: "CONFIRMED",
      paymentStatus: "PAID",
      waitlistedAt: new Date("2026-10-01T12:00:00.000Z")
    });
    waitlistedToken = waitlisted.checkInToken;

    const otherRegistration = await createRegistration({
      suffix: "Outro Tenant",
      status: "CONFIRMED",
      paymentStatus: "NOT_REQUIRED",
      targetChurchId: otherChurchId,
      targetEventId: otherEventId,
      targetTicketId: otherTicket.id,
      targetBatchId: otherBatch.id
    });
    otherEventRegistrationId = otherRegistration.id;
    otherEventToken = otherRegistration.checkInToken;

    const publishedMine = await prisma.eventAppSession.create({
      data: {
        churchId,
        eventId,
        title: "Sessão Publicada Minha",
        startsAt: new Date("2026-11-20T13:00:00.000Z"),
        endsAt: new Date("2026-11-20T14:00:00.000Z"),
        facilitator: "Facilitador Real",
        location: "Auditório",
        isPublished: true
      }
    });
    publishedMineSessionId = publishedMine.id;

    const publishedOther = await prisma.eventAppSession.create({
      data: {
        churchId,
        eventId,
        title: "Sessão Publicada Outra",
        startsAt: new Date("2026-11-20T15:00:00.000Z"),
        endsAt: new Date("2026-11-20T16:00:00.000Z"),
        isPublished: true
      }
    });
    publishedOtherSessionId = publishedOther.id;

    const unpublished = await prisma.eventAppSession.create({
      data: {
        churchId,
        eventId,
        title: "Sessão Não Publicada",
        startsAt: new Date("2026-11-20T17:00:00.000Z"),
        endsAt: new Date("2026-11-20T18:00:00.000Z"),
        isPublished: false
      }
    });
    unpublishedSessionId = unpublished.id;

    await prisma.eventAppSessionRegistration.createMany({
      data: [
        {
          churchId,
          eventId,
          sessionId: publishedMine.id,
          registrationId: eligible.id
        },
        {
          churchId,
          eventId,
          sessionId: publishedOther.id,
          registrationId: otherEligible.id
        },
        {
          churchId,
          eventId,
          sessionId: unpublished.id,
          registrationId: eligible.id
        }
      ]
    });

    await prisma.eventAppMapPoint.createMany({
      data: [
        {
          churchId,
          eventId,
          name: "Recepção",
          location: "Entrada principal",
          sortOrder: 0,
          isVisible: true
        },
        {
          churchId,
          eventId,
          name: "Ponto oculto",
          location: "Área interna",
          sortOrder: 1,
          isVisible: false
        }
      ]
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.eventAppSessionRegistration.deleteMany({
        where: {
          eventId: {
            in: [eventId, otherEventId]
          }
        }
      });
      await prisma.eventAppMapPoint.deleteMany({
        where: {
          eventId: {
            in: [eventId, otherEventId]
          }
        }
      });
      await prisma.eventAppSession.deleteMany({
        where: {
          eventId: {
            in: [eventId, otherEventId]
          }
        }
      });
      await prisma.registration.deleteMany({
        where: {
          eventId: {
            in: [eventId, otherEventId]
          }
        }
      });
      await prisma.ticketBatch.deleteMany({
        where: {
          eventId: {
            in: [eventId, otherEventId]
          }
        }
      });
      await prisma.eventTicket.deleteMany({
        where: {
          eventId: {
            in: [eventId, otherEventId]
          }
        }
      });
      await prisma.event.deleteMany({
        where: {
          id: {
            in: [eventId, otherEventId]
          }
        }
      });
      await prisma.visitor.deleteMany({
        where: {
          id: {
            in: visitorIds
          }
        }
      });
      await prisma.church.delete({
        where: {
          id: otherChurchId
        }
      });
      await prisma.$disconnect();
    }

    await app.close();
  });

  it("returns only the minimal anonymous event DTO", async () => {
    const response = await request(app.server).get(
      `/public/event-pages/${publicSlug}/app`
    );

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(
      ["church", "date", "slug", "title"].sort()
    );
    expect(Object.keys(response.body.church).sort()).toEqual(
      ["name", "slug"].sort()
    );
    expect(JSON.stringify(response.body)).not.toMatch(
      /registrations|checkInToken|tracking|paymentStatus/
    );
  });

  it("requires JWT for admin content and isolates eventId by churchId", async () => {
    const anonymous = await request(app.server).get(
      `/api/events/${eventId}/participant-app`
    );
    expect(anonymous.status).toBe(401);

    const crossTenant = await request(app.server)
      .get(`/api/events/${eventId}/participant-app`)
      .set("Authorization", `Bearer ${otherTenantToken}`);
    expect(crossTenant.status).toBe(404);
    expect(crossTenant.body.error).toBe("EVENT_NOT_FOUND");
  });

  it("enforces RBAC and rejects cross-event registration associations", async () => {
    const payload = {
      title: "Sessão via rota",
      startsAt: "2026-11-20T19:00:00.000Z",
      endsAt: "2026-11-20T20:00:00.000Z",
      isPublished: true,
      registrationIds: [eligibleRegistrationId]
    };

    const leader = await request(app.server)
      .post(`/api/events/${eventId}/participant-app/sessions`)
      .set("Authorization", `Bearer ${leaderToken}`)
      .send(payload);
    expect(leader.status).toBe(403);

    const invalidAssociation = await request(app.server)
      .post(`/api/events/${eventId}/participant-app/sessions`)
      .set("Authorization", `Bearer ${pastorToken}`)
      .send({
        ...payload,
        registrationIds: [otherEventRegistrationId]
      });
    expect(invalidAssociation.status).toBe(400);
    expect(invalidAssociation.body.error).toBe(
      "EVENT_APP_REGISTRATION_INVALID"
    );
  });

  it.each([
    ["pending", () => pendingToken, "PAYMENT_REQUIRED"],
    ["cancelled", () => cancelledToken, "PARTICIPANT_APP_ACCESS_DENIED"],
    ["waitlisted", () => waitlistedToken, "PARTICIPANT_APP_ACCESS_DENIED"]
  ])("rejects %s participant access", async (_label, token, errorCode) => {
    const response = await request(app.server)
      .post(`/public/event-pages/${publicSlug}/access`)
      .send({
        checkInToken: token()
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe(errorCode);
    expect(JSON.stringify(response.body)).not.toMatch(
      /Participante|checkInToken|@e2e\.local/
    );
  });

  it("does not accept a token from another event or tenant", async () => {
    const response = await request(app.server)
      .post(`/public/event-pages/${publicSlug}/access`)
      .send({
        checkInToken: otherEventToken
      });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("PUBLIC_REGISTRATION_NOT_FOUND");
  });

  it("returns published content and isolates Meus to the authenticated token", async () => {
    const response = await request(app.server)
      .post(`/public/event-pages/${publicSlug}/access`)
      .send({
        checkInToken: eligibleToken
      });

    expect(response.status).toBe(200);
    expect(Object.keys(response.body.registration).sort()).toEqual(
      [
        "checkInToken",
        "paymentStatus",
        "status",
        "ticketBatchName",
        "ticketName"
      ].sort()
    );
    expect(Object.keys(response.body.event).sort()).toEqual(
      ["churchName", "date", "location", "title"].sort()
    );
    expect(response.body.sessions).toHaveLength(2);
    expect(
      response.body.sessions.find(
        (session: { id: string }) =>
          session.id === publishedMineSessionId
      )?.isMine
    ).toBe(true);
    expect(
      response.body.sessions.find(
        (session: { id: string }) =>
          session.id === publishedOtherSessionId
      )?.isMine
    ).toBe(false);
    expect(
      response.body.sessions.some(
        (session: { id: string }) =>
          session.id === unpublishedSessionId
      )
    ).toBe(false);
    expect(response.body.map.points).toHaveLength(1);
    expect(response.body.map.points[0].name).toBe("Recepção");

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(otherEligibleRegistrationId);
    expect(serialized).not.toContain("Outra Pessoa");
    expect(serialized).not.toContain("Sessão Não Publicada");
    expect(serialized).not.toMatch(/confirmedAt|checkedInAt|publicSlug/);
    expect(serialized).not.toContain('"registrationId"');
    expect(response.body.registration.id).toBeUndefined();
  });
});
