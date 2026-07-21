import type {} from "@sistema-igrejas/auth";
import type { PrismaClient } from "@prisma/client";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";
import {
  addPersonToCellSchema,
  createCellSchema,
  removePersonFromCellSchema,
  updateCellSchema
} from "./cell.schema.js";
import {
  createCell,
  getCellById,
  listCells,
  updateCell
} from "./cell.service.js";
import {
  addPersonToCell,
  removePersonFromCell
} from "./membership.service.js";

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

async function sendRouteError(
  error: unknown,
  reply: FastifyReply
): Promise<void> {
  if (!(error instanceof Error)) {
    await reply.code(500).send({
      error: "INTERNAL_SERVER_ERROR",
      message: "Erro interno."
    });
    return;
  }

  if (
    error.message === "CHURCH_CONTEXT_REQUIRED" ||
    error.message === "USER_CONTEXT_REQUIRED"
  ) {
    await reply.code(401).send({
      error: "UNAUTHORIZED",
      message: "Contexto de autenticação obrigatório."
    });
    return;
  }

  if (error.message === "CELL_NOT_FOUND") {
    await reply.code(404).send({
      error: "CELL_NOT_FOUND",
      message: "Célula não encontrada."
    });
    return;
  }

  if (error.message === "LEADER_NOT_FOUND") {
    await reply.code(404).send({
      error: "LEADER_NOT_FOUND",
      message: "Líder não encontrado."
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

  if (error.message === "MEMBERSHIP_NOT_FOUND") {
    await reply.code(404).send({
      error: "MEMBERSHIP_NOT_FOUND",
      message: "Vínculo ativo com a célula não encontrado."
    });
    return;
  }

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export async function registerCellRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  app.get("/cells", async (request, reply) => {
    try {
      const churchId = getChurchId(request);

      return await listCells(prisma, churchId);
    } catch (error) {
      request.log.error({ err: error }, "Erro ao listar células");
      await sendRouteError(error, reply);
    }
  });

  app.post("/cells", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const input = createCellSchema.parse(request.body);
      const cell = await createCell(prisma, churchId, input);

      await reply.code(201).send(cell);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.put("/cells/:cellId", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const params = request.params as { cellId: string };
      const input = updateCellSchema.parse(request.body);
      const cell = await updateCell(
        prisma,
        churchId,
        params.cellId,
        input
      );

      await reply.code(200).send(cell);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.get("/cells/:cellId", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const params = request.params as { cellId: string };

      return await getCellById(prisma, churchId, params.cellId);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.post("/cells/members", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const approvedBy = getUserId(request);
      const input = addPersonToCellSchema.parse(request.body);
      const membership = await addPersonToCell(
        prisma,
        churchId,
        approvedBy,
        input
      );

      await reply.code(201).send(membership);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.post("/cells/members/remove", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const input = removePersonFromCellSchema.parse(request.body);
      const membership = await removePersonFromCell(
        prisma,
        churchId,
        input
      );

      await reply.code(200).send(membership);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });
}
