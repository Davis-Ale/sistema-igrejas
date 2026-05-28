import type {} from "@sistema-igrejas/auth";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import {
  completeTrailStageSchema,
  createTrailSchema,
  createTrailStageSchema
} from "./trail.schema.js";
import { completeTrailStage, listPersonTrailProgress } from "./progress.service.js";
import {
  createTrail,
  createTrailStage,
  listTrails,
  listTrailStages
} from "./trail.service.js";

function getChurchId(request: FastifyRequest): string {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
}

function getUserId(request: FastifyRequest): string {
  if (!request.user?.userId) {
    throw new Error("USER_CONTEXT_REQUIRED");
  }

  return request.user.userId;
}

async function sendRouteError(error: unknown, reply: FastifyReply): Promise<void> {
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

  if (error.message === "TRAIL_NOT_FOUND") {
    await reply.code(404).send({
      error: "TRAIL_NOT_FOUND",
      message: "Trilho não encontrado."
    });
    return;
  }

  if (error.message === "TRAIL_STAGE_NOT_FOUND") {
    await reply.code(404).send({
      error: "TRAIL_STAGE_NOT_FOUND",
      message: "Etapa do trilho não encontrada."
    });
    return;
  }

  if (error.message === "PERSON_NOT_FOUND") {
    await reply.code(404).send({
      error: "PERSON_NOT_FOUND",
      message: "Pessoa não encontrada."
    });
    return;
  }

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export async function registerTrailRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  app.get("/trails", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      return await listTrails(prisma, churchId);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.post("/trails", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const input = createTrailSchema.parse(request.body);
      const trail = await createTrail(prisma, churchId, input);

      await reply.code(201).send(trail);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.get("/trails/:trailId/stages", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const params = request.params as { trailId: string };

      return await listTrailStages(prisma, churchId, params.trailId);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.post("/trails/stages", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const input = createTrailStageSchema.parse(request.body);
      const stage = await createTrailStage(prisma, churchId, input);

      await reply.code(201).send(stage);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.get("/trails/progress/:personId", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const params = request.params as { personId: string };

      return await listPersonTrailProgress(prisma, churchId, params.personId);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.post("/trails/progress/complete", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const approvedBy = getUserId(request);
      const input = completeTrailStageSchema.parse(request.body);
      const progress = await completeTrailStage(prisma, churchId, approvedBy, input);

      await reply.code(200).send(progress);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });
}
