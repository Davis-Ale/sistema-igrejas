import type { PrismaClient } from "@prisma/client";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";
import { ZodError } from "zod";
import {
  listCitiesQuerySchema,
  postalCodeParamsSchema
} from "./cell-location.schema.js";
import {
  getChurchBaseLocation,
  listBrazilCities,
  listBrazilStates,
  lookupBrazilPostalCode
} from "./cell-location.service.js";

function getChurchId(request: FastifyRequest): string {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
}

async function sendLocationRouteError(
  error: unknown,
  reply: FastifyReply
): Promise<void> {
  if (error instanceof ZodError) {
    await reply.code(400).send({
      error: "VALIDATION_ERROR",
      message: "Dados de localização inválidos.",
      issues: error.issues
    });
    return;
  }

  if (
    error instanceof Error &&
    error.message === "CHURCH_CONTEXT_REQUIRED"
  ) {
    await reply.code(401).send({
      error: "UNAUTHORIZED",
      message: "Contexto de igreja obrigatório."
    });
    return;
  }

  if (error instanceof Error && error.message === "CHURCH_NOT_FOUND") {
    await reply.code(404).send({
      error: "CHURCH_NOT_FOUND",
      message: "Igreja não encontrada."
    });
    return;
  }

  if (
    error instanceof Error &&
    error.message === "BASE_CITY_NOT_CONFIGURED"
  ) {
    await reply.code(409).send({
      error: "BASE_CITY_NOT_CONFIGURED",
      message: "Cidade-base não configurada."
    });
    return;
  }

  if (error instanceof Error && error.message === "POSTAL_CODE_NOT_FOUND") {
    await reply.code(404).send({
      error: "POSTAL_CODE_NOT_FOUND",
      message: "CEP não encontrado."
    });
    return;
  }

  if (
    error instanceof Error &&
    error.message === "LOCATION_PROVIDER_UNAVAILABLE"
  ) {
    await reply.code(503).send({
      error: "LOCATION_PROVIDER_UNAVAILABLE",
      message: "Serviço de localização indisponível."
    });
    return;
  }

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export async function registerCellLocationRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  app.get("/locations/base", async (request, reply) => {
    try {
      const churchId = getChurchId(request);

      return await getChurchBaseLocation(prisma, churchId);
    } catch (error) {
      request.log.error({ err: error }, "Erro ao carregar localização-base");
      await sendLocationRouteError(error, reply);
    }
  });

  app.get("/locations/states", async (_request, reply) => {
    try {
      return await listBrazilStates();
    } catch (error) {
      await sendLocationRouteError(error, reply);
    }
  });

  app.get("/locations/cities", async (request, reply) => {
    try {
      const query = listCitiesQuerySchema.parse(request.query);

      return await listBrazilCities(query.state);
    } catch (error) {
      await sendLocationRouteError(error, reply);
    }
  });

  app.get("/locations/postal-codes/:postalCode", async (request, reply) => {
    try {
      const params = postalCodeParamsSchema.parse(request.params);

      return await lookupBrazilPostalCode(params.postalCode);
    } catch (error) {
      await sendLocationRouteError(error, reply);
    }
  });
}
