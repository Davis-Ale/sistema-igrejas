import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance, FastifyReply } from "fastify";
import { createPublicRegistrationSchema } from "./event.schema.js";
import { createPublicRegistration, getPublicEventById } from "./event.service.js";

async function sendPublicRouteError(error: unknown, reply: FastifyReply): Promise<void> {
  if (!(error instanceof Error)) {
    await reply.code(500).send({
      error: "INTERNAL_SERVER_ERROR",
      message: "Erro interno."
    });
    return;
  }

  if (error.message === "PUBLIC_EVENT_NOT_FOUND") {
    await reply.code(404).send({
      error: "PUBLIC_EVENT_NOT_FOUND",
      message: "Evento público não encontrado ou inscrições públicas desativadas."
    });
    return;
  }

  if (error.message === "EVENT_CAPACITY_REACHED") {
    await reply.code(409).send({
      error: "EVENT_CAPACITY_REACHED",
      message: "As vagas deste evento foram preenchidas."
    });
    return;
  }

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export async function registerPublicEventRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  app.get("/public/events/:eventId", async (request, reply) => {
    try {
      const params = request.params as { eventId: string };

      return await getPublicEventById(prisma, params.eventId);
    } catch (error) {
      await sendPublicRouteError(error, reply);
    }
  });

  app.post("/public/events/:eventId/register", async (request, reply) => {
    try {
      const params = request.params as { eventId: string };
      const input = createPublicRegistrationSchema.parse(request.body);
      const registration = await createPublicRegistration(prisma, params.eventId, input);

      await reply.code(201).send(registration);
    } catch (error) {
      await sendPublicRouteError(error, reply);
    }
  });
}
