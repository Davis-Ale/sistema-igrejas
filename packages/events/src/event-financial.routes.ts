import type {} from "@sistema-igrejas/auth";
import type { PrismaClient } from "@prisma/client";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";
import { ZodError } from "zod";
import {
  eventFinancialExportQuerySchema,
  eventFinancialListQuerySchema,
  eventFinancialSummaryQuerySchema
} from "./event-financial.schema.js";
import {
  getEventFinancialSummary,
  listEventFinancialTransactions,
  streamEventFinancialExport
} from "./event-financial.service.js";

function getChurchId(request: FastifyRequest) {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
}

async function sendEventFinancialError(
  error: unknown,
  reply: FastifyReply
) {
  if (error instanceof ZodError) {
    await reply.code(400).send({
      error: "VALIDATION_ERROR",
      message:
        error.issues[0]?.message ??
        "Os dados enviados são inválidos."
    });
    return;
  }

  if (error instanceof Error && error.message === "CHURCH_CONTEXT_REQUIRED") {
    await reply.code(401).send({
      error: "UNAUTHORIZED",
      message: "Contexto de autenticação obrigatório."
    });
    return;
  }

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

function getExportFilenameDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function registerEventFinancialRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
) {
  app.get("/events/financial/summary", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const query = eventFinancialSummaryQuerySchema.parse(request.query);

      return await getEventFinancialSummary(prisma, churchId, query);
    } catch (error) {
      await sendEventFinancialError(error, reply);
    }
  });

  app.get("/events/financial/transactions", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const query = eventFinancialListQuerySchema.parse(request.query);

      return await listEventFinancialTransactions(prisma, churchId, query);
    } catch (error) {
      await sendEventFinancialError(error, reply);
    }
  });

  app.get("/events/financial/export", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const query = eventFinancialExportQuerySchema.parse(request.query);
      const filename = `bordero-eventos-${getExportFilenameDate()}.csv`;
      const origin = request.headers.origin;

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        ...(origin
          ? {
              "Access-Control-Allow-Origin": origin,
              Vary: "Origin"
            }
          : {})
      });

      await streamEventFinancialExport(
        prisma,
        churchId,
        query,
        (chunk) => {
          reply.raw.write(chunk);
        }
      );

      reply.raw.end();
    } catch (error) {
      if (reply.raw.headersSent) {
        reply.raw.end();
        return;
      }

      await sendEventFinancialError(error, reply);
    }
  });
}
