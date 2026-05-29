import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { loginSchema } from "./auth.schema.js";
import { loginWithEmailAndPassword } from "./auth.service.js";

async function sendAuthError(error: unknown, reply: FastifyReply): Promise<void> {
  if (error instanceof ZodError) {
    await reply.code(400).send({
      error: "VALIDATION_ERROR",
      message: "Dados de login inválidos.",
      issues: error.issues
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

  if (error.message === "INVALID_CREDENTIALS") {
    await reply.code(401).send({
      error: "INVALID_CREDENTIALS",
      message: "E-mail ou senha inválidos."
    });
    return;
  }

  if (error.message === "ACCOUNT_DISABLED") {
    await reply.code(403).send({
      error: "ACCOUNT_DISABLED",
      message: "Conta de usuário desativada."
    });
    return;
  }

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  app.post("/auth/login", async (request, reply) => {
    try {
      const input = loginSchema.parse(request.body);
      const session = await loginWithEmailAndPassword(app, prisma, input);

      await reply.code(200).send(session);
    } catch (error) {
      await sendAuthError(error, reply);
    }
  });
}
