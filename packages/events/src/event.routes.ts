import type {} from "@sistema-igrejas/auth";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import {
  createEventSchema,
  createRegistrationSchema,
  updateRegistrationStatusSchema
} from "./event.schema.js";
import {
  createEvent,
  createRegistration,
  getEventById,
  listEvents,
  updateRegistrationStatus
} from "./event.service.js";

function getChurchId(request: FastifyRequest): string {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
}

async function sendRouteError(error: unknown, reply: FastifyReply): Promise<void> {
  if (!(error instanceof Error)) {
    await reply.code(500).send({
      error: "INTERNAL_SERVER_ERROR",
      message: "Erro interno."
    });
    return;
  }

  if (error.message === "CHURCH_CONTEXT_REQUIRED") {
    await reply.code(401).send({
      error: "UNAUTHORIZED",
      message: "Contexto de autenticação obrigatório."
    });
    return;
  }

  if (error.message === "EVENT_NOT_FOUND") {
    await reply.code(404).send({
      error: "EVENT_NOT_FOUND",
      message: "Evento não encontrado."
    });
    return;
  }

  if (error.message === "PERSON_NOT_FOUND") {
    await reply.code(404).send({
      error: "PERSON_NOT_FOUND",
      message: "Pessoa não encontrada."
    });
    return;
  }

  if (error.message === "REGISTRATION_NOT_FOUND") {
    await reply.code(404).send({
      error: "REGISTRATION_NOT_FOUND",
      message: "Inscrição não encontrada."
    });
    return;
  }

  if (error.message === "EVENT_CAPACITY_REACHED") {
    await reply.code(409).send({
      error: "EVENT_CAPACITY_REACHED",
      message: "Capacidade do evento atingida."
    });
    return;
  }

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export async function registerEventRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  app.get("/events", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      return await listEvents(prisma, churchId);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.post("/events", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const input = createEventSchema.parse(request.body);
      const event = await createEvent(prisma, churchId, input);

      await reply.code(201).send(event);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.get("/events/:eventId", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const params = request.params as { eventId: string };

      return await getEventById(prisma, churchId, params.eventId);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.post("/events/registrations", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const input = createRegistrationSchema.parse(request.body);
      const registration = await createRegistration(prisma, churchId, input);

      await reply.code(201).send(registration);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.post("/events/registrations/status", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const input = updateRegistrationStatusSchema.parse(request.body);
      const registration = await updateRegistrationStatus(prisma, churchId, input);

      await reply.code(200).send(registration);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });
}
