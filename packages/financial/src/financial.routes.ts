import type {} from "@sistema-igrejas/auth";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import {
  createTransactionSchema,
  listTransactionsQuerySchema,
  transactionParamsSchema,
  updateTransactionSchema
} from "./financial.schema.js";
import {
  createTransaction,
  getFinancialSummary,
  listTransactions,
  updateTransaction
} from "./financial.service.js";

function getChurchId(request: FastifyRequest): string {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
}

async function sendRouteError(error: unknown, reply: FastifyReply): Promise<void> {
  if (!(error instanceof Error)) {
    await reply.code(500).send({
      error: "INTERNAL_SERVER_ERROR",
      message: "Erro interno."
    });
    return;
  }

  if (error.message === "CHURCH_CONTEXT_REQUIRED") {
    await reply.code(401).send({
      error: "UNAUTHORIZED",
      message: "Contexto de autenticação obrigatório."
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

  if (error.message === "EVENT_NOT_FOUND") {
    await reply.code(404).send({
      error: "EVENT_NOT_FOUND",
      message: "Evento não encontrado."
    });
    return;
  }

  if (error.message === "TRANSACTION_NOT_FOUND") {
    await reply.code(404).send({
      error: "TRANSACTION_NOT_FOUND",
      message: "Transação não encontrada."
    });
    return;
  }

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export async function registerFinancialRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  app.get("/financial/transactions", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const query = listTransactionsQuerySchema.parse(request.query);

      return await listTransactions(prisma, churchId, query);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.post("/financial/transactions", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const input = createTransactionSchema.parse(request.body);
      const transaction = await createTransaction(prisma, churchId, input);

      await reply.code(201).send(transaction);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.patch("/financial/transactions/:transactionId", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const params = transactionParamsSchema.parse(request.params);
      const input = updateTransactionSchema.parse(request.body);

      return await updateTransaction(
        prisma,
        churchId,
        params.transactionId,
        input
      );
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.get("/financial/summary", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const query = listTransactionsQuerySchema.parse(request.query);

      return await getFinancialSummary(prisma, churchId, query);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });
}
