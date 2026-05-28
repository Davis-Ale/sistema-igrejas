import type {} from "@sistema-igrejas/auth";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { updateVolunteerStatusSchema } from "./volunteer.schema.js";
import {
  listVolunteerLogs,
  listVolunteers,
  updateVolunteerStatus
} from "./volunteer.service.js";

function getChurchId(request: FastifyRequest): string {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
}

function getUserId(request: FastifyRequest): string {
  if (!request.user?.userId) {
    throw new Error("USER_CONTEXT_REQUIRED");
  }

  return request.user.userId;
}

async function sendRouteError(error: unknown, reply: FastifyReply): Promise<void> {
  if (!(error instanceof Error)) {
    await reply.code(500).send({
      error: "INTERNAL_SERVER_ERROR",
      message: "Erro interno."
    });
    return;
  }

  if (error.message === "CHURCH_CONTEXT_REQUIRED" || error.message === "USER_CONTEXT_REQUIRED") {
    await reply.code(401).send({
      error: "UNAUTHORIZED",
      message: "Contexto de autenticação obrigatório."
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

  if (error.message === "CHANGER_NOT_FOUND") {
    await reply.code(404).send({
      error: "CHANGER_NOT_FOUND",
      message: "Responsável pela alteração não encontrado."
    });
    return;
  }

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export async function registerVolunteerRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  app.get("/volunteers", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      return await listVolunteers(prisma, churchId);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.get("/volunteers/:personId/logs", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const params = request.params as { personId: string };

      return await listVolunteerLogs(prisma, churchId, params.personId);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.post("/volunteers/status", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const changedBy = getUserId(request);
      const input = updateVolunteerStatusSchema.parse(request.body);
      const result = await updateVolunteerStatus(prisma, churchId, changedBy, input);

      await reply.code(200).send(result);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });
}
