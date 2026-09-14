import type { PrismaClient } from "@prisma/client";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";
import { ZodError } from "zod";
import { z } from "zod";
import type { EventApiKeyScope } from "./api-key.schema.js";
import { authenticateEventApiKey } from "./api-key.service.js";
import {
  eventIdParamsSchema,
  listEventsQuerySchema
} from "./event.schema.js";
import {
  getPublicApiEventById,
  listPublicApiEvents,
  listPublicApiParticipants,
  listPublicApiRegistrations
} from "./public-api-v1.service.js";

const publicApiListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

function readApiKeyHeader(request: FastifyRequest) {
  return request.headers["x-api-key"];
}

async function sendPublicApiError(
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

  if (!(error instanceof Error)) {
    await reply.code(500).send({
      error: "INTERNAL_SERVER_ERROR",
      message: "Erro interno."
    });
    return;
  }

  if (error.message === "API_KEY_INVALID") {
    await reply.code(401).send({
      error: "API_KEY_INVALID",
      message: "Chave de API inválida."
    });
    return;
  }

  if (error.message === "API_KEY_SCOPE_DENIED") {
    await reply.code(403).send({
      error: "API_KEY_SCOPE_DENIED",
      message: "Esta chave não possui permissão para esta operação."
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

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

async function requirePublicApiAuth(
  prisma: PrismaClient,
  request: FastifyRequest,
  requiredScope: EventApiKeyScope
) {
  return authenticateEventApiKey(
    prisma,
    readApiKeyHeader(request),
    requiredScope,
    request.log
  );
}

export async function registerPublicEventsApiV1Routes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  app.get("/events", async (request, reply) => {
    try {
      const auth = await requirePublicApiAuth(
        prisma,
        request,
        "events:read"
      );
      const query = listEventsQuerySchema.parse(request.query);

      return await listPublicApiEvents(prisma, auth.churchId, query);
    } catch (error) {
      await sendPublicApiError(error, reply);
    }
  });

  app.get("/events/:eventId/registrations", async (request, reply) => {
    try {
      const auth = await requirePublicApiAuth(
        prisma,
        request,
        "registrations:read"
      );
      const params = eventIdParamsSchema.parse(request.params);
      const query = publicApiListQuerySchema.parse(request.query);

      return await listPublicApiRegistrations(
        prisma,
        auth.churchId,
        params.eventId,
        query
      );
    } catch (error) {
      await sendPublicApiError(error, reply);
    }
  });

  app.get("/events/:eventId/participants", async (request, reply) => {
    try {
      const auth = await requirePublicApiAuth(
        prisma,
        request,
        "participants:read"
      );
      const params = eventIdParamsSchema.parse(request.params);
      const query = publicApiListQuerySchema.parse(request.query);

      return await listPublicApiParticipants(
        prisma,
        auth.churchId,
        params.eventId,
        query
      );
    } catch (error) {
      await sendPublicApiError(error, reply);
    }
  });

  app.get("/events/:eventId", async (request, reply) => {
    try {
      const auth = await requirePublicApiAuth(
        prisma,
        request,
        "events:read"
      );
      const params = eventIdParamsSchema.parse(request.params);

      return await getPublicApiEventById(
        prisma,
        auth.churchId,
        params.eventId
      );
    } catch (error) {
      await sendPublicApiError(error, reply);
    }
  });
}
