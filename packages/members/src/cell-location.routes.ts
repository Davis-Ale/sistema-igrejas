import type { FastifyInstance, FastifyReply } from "fastify";
import { ZodError } from "zod";
import {
  listCitiesQuerySchema,
  postalCodeParamsSchema
} from "./cell-location.schema.js";
import {
  listBrazilCities,
  listBrazilStates,
  lookupBrazilPostalCode
} from "./cell-location.service.js";

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
    error.message === "POSTAL_CODE_NOT_FOUND"
  ) {
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
  app: FastifyInstance
): Promise<void> {
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
