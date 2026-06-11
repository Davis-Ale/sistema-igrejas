import type {} from "@sistema-igrejas/auth";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { createVisitorSchema } from "./visitor.schema.js";
import { createVisitor, listVisitors } from "./visitor.service.js";

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

export async function registerVisitorRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  app.get("/visitors", async (request, reply) => {
    try {
      const churchId = getChurchId(request);

      return await listVisitors(prisma, churchId);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.post("/visitors", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const input = createVisitorSchema.parse(request.body);
      const visitor = await createVisitor(prisma, churchId, input);

      await reply.code(201).send(visitor);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });
}
