import type {} from "@sistema-igrejas/auth";
import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { createMemberSchema, listMembersQuerySchema } from "./member.schema.js";
import { createMember, listMembers } from "./member.service.js";

function getChurchId(request: FastifyRequest): string {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
}

async function sendMemberRouteError(error: unknown, reply: FastifyReply): Promise<void> {
  if (error instanceof ZodError) {
    await reply.code(400).send({
      error: "VALIDATION_ERROR",
      message: "Dados inválidos.",
      issues: error.issues
    });
    return;
  }

  if (error instanceof Error && error.message === "CHURCH_CONTEXT_REQUIRED") {
    await reply.code(401).send({
      error: "UNAUTHORIZED",
      message: "Contexto de igreja obrigatório."
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
      const query = listMembersQuerySchema.parse(request.query);

      return await listMembers(prisma, churchId, query);
    } catch (error) {
      request.log.error({ err: error }, "Erro ao listar membros");
      await sendMemberRouteError(error, reply);
    }
  });

  app.post("/members", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const input = createMemberSchema.parse(request.body);
      const member = await createMember(prisma, churchId, input);

      await reply.code(201).send(member);
    } catch (error) {
      await sendMemberRouteError(error, reply);
    }
  });
}
