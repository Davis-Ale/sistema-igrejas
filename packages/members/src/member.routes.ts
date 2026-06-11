import type {} from "@sistema-igrejas/auth";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { createMemberSchema } from "./member.schema.js";
import { createMember, listMembers } from "./member.service.js";

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

export async function registerMemberRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  app.get("/members", async (request, reply) => {
    try {
      const churchId = getChurchId(request);

      return await listMembers(prisma, churchId);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.post("/members", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const input = createMemberSchema.parse(request.body);
      const member = await createMember(prisma, churchId, input);

      await reply.code(201).send(member);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });
}
