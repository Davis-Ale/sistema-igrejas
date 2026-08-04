import type {} from "@sistema-igrejas/auth";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { ZodError } from "zod";
import {
  checkInByTokenSchema,
  createEventSchema,
  createRegistrationSchema,
  updateEventSchema,
  updateRegistrationStatusSchema
} from "./event.schema.js";
import {
  checkInRegistrationByToken,
  createEvent,
  createRegistration,
  getEventById,
  listEvents,
  updateEvent,
  updateRegistrationStatus
} from "./event.service.js";

function getChurchId(request: FastifyRequest): string {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
}

async function sendRouteError(error: unknown, reply: FastifyReply): Promise<void> {
  if (error instanceof ZodError) {
    await reply.code(400).send({
      error: "VALIDATION_ERROR",
      message:
        error.issues[0]?.message ??
        "Os dados enviados são inválidos."
    });
    return;
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    await reply.code(409).send({
      error: "EVENT_SLUG_ALREADY_EXISTS",
      message: "Já existe um evento com este endereço."
    });
    return;
  }

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

  if (error.message === "VISITOR_NOT_FOUND") {
    await reply.code(404).send({
      error: "VISITOR_NOT_FOUND",
      message: "Visitante não encontrado."
    });
    return;
  }

  if (error.message === "REGISTRATION_NOT_FOUND") {
    await reply.code(404).send({
      error: "REGISTRATION_NOT_FOUND",
      message: "Inscrição não encontrada para este evento."
    });
    return;
  }

  if (error.message === "REGISTRATION_CANCELLED") {
    await reply.code(409).send({
      error: "REGISTRATION_CANCELLED",
      message: "Esta inscrição foi cancelada e não pode fazer check-in."
    });
    return;
  }

  if (error.message === "REGISTRATION_ALREADY_CHECKED_IN") {
    await reply.code(409).send({
      error: "REGISTRATION_ALREADY_CHECKED_IN",
      message: "Check-in já realizado para esta inscrição."
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

  if (error.message === "PAYMENT_NOT_CONFIRMED") {
    await reply.code(409).send({
      error: "PAYMENT_NOT_CONFIRMED",
      message:
        "O pagamento desta inscrição ainda não foi confirmado."
    });
    return;
  }

  if (error.message === "REGISTRATION_WAITLISTED") {
    await reply.code(409).send({
      error: "REGISTRATION_WAITLISTED",
      message:
        "Esta inscrição ainda está na lista de espera."
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

  app.patch("/events/:eventId", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const params = request.params as { eventId: string };
      const input = updateEventSchema.parse(request.body);
      const event = await updateEvent(
        prisma,
        churchId,
        params.eventId,
        input
      );

      await reply.code(200).send(event);
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

  app.post("/events/registrations/check-in-token", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const input = checkInByTokenSchema.parse(request.body);
      const registration = await checkInRegistrationByToken(prisma, churchId, input);

      await reply.code(200).send(registration);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });
}
