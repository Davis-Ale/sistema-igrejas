import type { PrismaClient } from "@prisma/client";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";
import {
  archiveCell,
  reactivateCell
} from "./cell-status.service.js";

function getChurchId(request: FastifyRequest): string {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
}

async function sendCellStatusError(
  error: unknown,
  reply: FastifyReply
): Promise<void> {
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

  if (
    error instanceof Error &&
    error.message === "CELL_NOT_FOUND"
  ) {
    await reply.code(404).send({
      error: "CELL_NOT_FOUND",
      message: "Célula não encontrada."
    });
    return;
  }

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export async function registerCellStatusRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  app.patch("/cells/:cellId/archive", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const params = request.params as { cellId: string };
      const cell = await archiveCell(
        prisma,
        churchId,
        params.cellId
      );

      await reply.code(200).send(cell);
    } catch (error) {
      request.log.error(
        { err: error },
        "Erro ao arquivar célula"
      );
      await sendCellStatusError(error, reply);
    }
  });

  app.patch("/cells/:cellId/reactivate", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const params = request.params as { cellId: string };
      const cell = await reactivateCell(
        prisma,
        churchId,
        params.cellId
      );

      await reply.code(200).send(cell);
    } catch (error) {
      request.log.error(
        { err: error },
        "Erro ao reativar célula"
      );
      await sendCellStatusError(error, reply);
    }
  });
}
