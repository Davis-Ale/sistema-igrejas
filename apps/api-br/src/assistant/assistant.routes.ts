import type {} from "@sistema-igrejas/auth";
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
      const answer = await answerAssistantMessage(prisma, churchId, input);

      await reply.code(200).send(answer);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });
}
