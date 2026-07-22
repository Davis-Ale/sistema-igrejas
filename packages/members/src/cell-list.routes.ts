import type { PrismaClient } from "@prisma/client";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";
import { ZodError } from "zod";
import { listCellsQuerySchema } from "./cell.schema.js";
import { listPaginatedCells } from "./cell-list.service.js";

function getChurchId(request: FastifyRequest): string {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
}

async function sendCellListError(
  error: unknown,
  reply: FastifyReply
): Promise<void> {
  if (error instanceof ZodError) {
    await reply.code(400).send({
      error: "VALIDATION_ERROR",
      message: "Filtros de células inválidos.",
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

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export async function registerCellListRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  app.get("/cells/search", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const query = listCellsQuerySchema.parse(request.query);

      return await listPaginatedCells(prisma, churchId, query);
    } catch (error) {
      request.log.error({ err: error }, "Erro ao pesquisar células");
      await sendCellListError(error, reply);
    }
  });
}
