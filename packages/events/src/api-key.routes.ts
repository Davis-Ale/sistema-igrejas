import { requireRole } from "@sistema-igrejas/auth";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";
import { ZodError } from "zod";
import {
  createEventApiKeySchema,
  eventApiKeyIdParamsSchema
} from "./api-key.schema.js";
import {
  createEventApiKey,
  listEventApiKeys,
  revokeEventApiKey
} from "./api-key.service.js";

function getChurchId(request: FastifyRequest): string {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
}

async function sendApiKeyError(
  error: unknown,
  reply: FastifyReply
): Promise<void> {
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
      error: "EVENT_API_KEY_NAME_ALREADY_EXISTS",
      message: "Já existe uma chave com este nome para a igreja."
    });
    return;
  }

  if (error instanceof Error) {
    if (error.message === "CHURCH_CONTEXT_REQUIRED") {
      await reply.code(401).send({
        error: "UNAUTHORIZED",
        message: "Autenticação obrigatória."
      });
      return;
    }

    if (error.message === "EVENT_API_KEY_NOT_FOUND") {
      await reply.code(404).send({
        error: "EVENT_API_KEY_NOT_FOUND",
        message: "Chave de API não encontrada."
      });
      return;
    }

    if (error.message === "EVENT_API_KEY_ALREADY_REVOKED") {
      await reply.code(409).send({
        error: "EVENT_API_KEY_ALREADY_REVOKED",
        message: "Esta chave de API já foi revogada."
      });
      return;
    }
  }

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export async function registerEventApiKeyRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  app.get("/events/api-keys", async (request, reply) => {
    try {
      const churchId = getChurchId(request);

      return await listEventApiKeys(prisma, churchId);
    } catch (error) {
      await sendApiKeyError(error, reply);
    }
  });

  app.post(
    "/events/api-keys",
    { preHandler: requireRole(["SUPER_ADMIN", "PASTOR"]) },
    async (request, reply) => {
      try {
        const churchId = getChurchId(request);
        const input = createEventApiKeySchema.parse(request.body);
        const apiKey = await createEventApiKey(prisma, churchId, input);

        await reply.code(201).send(apiKey);
      } catch (error) {
        await sendApiKeyError(error, reply);
      }
    }
  );

  app.post(
    "/events/api-keys/:apiKeyId/revoke",
    { preHandler: requireRole(["SUPER_ADMIN", "PASTOR"]) },
    async (request, reply) => {
      try {
        const churchId = getChurchId(request);
        const params = eventApiKeyIdParamsSchema.parse(request.params);
        const apiKey = await revokeEventApiKey(
          prisma,
          churchId,
          params.apiKeyId
        );

        await reply.code(200).send(apiKey);
      } catch (error) {
        await sendApiKeyError(error, reply);
      }
    }
  );
}
