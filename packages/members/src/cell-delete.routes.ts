import type { PrismaClient } from "@prisma/client";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";
import { deleteCellSafely } from "./cell-delete.service.js";

type CellDeletePreHandler = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void>;

function getChurchId(request: FastifyRequest): string {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
}

async function sendCellDeleteError(
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

  if (
    error instanceof Error &&
    error.message === "CELL_HAS_HISTORY"
  ) {
    await reply.code(409).send({
      error: "CELL_HAS_HISTORY",
      message:
        "Esta célula possui pessoas ou histórico e não pode ser excluída. Arquive-a para preservar os dados."
    });
    return;
  }

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export async function registerCellDeleteRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  rolePreHandler: CellDeletePreHandler
): Promise<void> {
  app.delete(
    "/cells/:cellId",
    {
      preHandler: rolePreHandler
    },
    async (request, reply) => {
      try {
        const churchId = getChurchId(request);
        const params = request.params as { cellId: string };
        const result = await deleteCellSafely(
          prisma,
          churchId,
          params.cellId
        );

        await reply.code(200).send(result);
      } catch (error) {
        request.log.error(
          { err: error },
          "Erro ao excluir célula"
        );
        await sendCellDeleteError(error, reply);
      }
    }
  );
}
