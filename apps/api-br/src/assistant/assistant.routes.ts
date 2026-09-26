import type {} from "@sistema-igrejas/auth";
import { ZodError } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { assistantMessageSchema } from "./assistant.schema.js";
import { answerAssistantMessage } from "./assistant.service.js";

function getChurchId(request: FastifyRequest): string {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
}

function getUserRole(request: FastifyRequest) {
  if (!request.user?.role) {
    throw new Error("USER_CONTEXT_REQUIRED");
  }

  return request.user.role;
}

async function sendRouteError(error: unknown, reply: FastifyReply): Promise<void> {
  if (error instanceof ZodError) {
    await reply.code(400).send({ error: "INVALID_INPUT", message: "Informe uma mensagem válida de até 2000 caracteres." });
    return;
  }
  if (error instanceof Error && ["ASSISTANT_ACCESS_DENIED", "FINANCIAL_ACCESS_DENIED"].includes(error.message)) {
    await reply.code(403).send({ error: error.message, message: "Sem permissão para esta consulta." });
    return;
  }
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

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export async function registerAssistantRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  app.post("/assistant/messages", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const input = assistantMessageSchema.parse(request.body);
      const userRole = getUserRole(request);
      const answer = await answerAssistantMessage(prisma, churchId, userRole, input);

      await reply.code(200).send(answer);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });
}
