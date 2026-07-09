import type {} from "@sistema-igrejas/auth";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import {
  createTransactionSchema,
  listTransactionsQuerySchema,
  transactionControlSchema,
  transactionParamsSchema,
  updateTransactionSchema
} from "./financial.schema.js";
import {
  cancelTransaction,
  createTransaction,
  getFinancialSummary,
  listTransactions,
  reverseTransaction,
  updateTransaction
} from "./financial.service.js";

type FinancialRole = "SUPER_ADMIN" | "PASTOR" | "LEADER" | "VOLUNTEER" | "MEMBER" | "VISITOR";

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

function getUserRole(request: FastifyRequest): FinancialRole {
  if (!request.user?.role) {
    throw new Error("USER_CONTEXT_REQUIRED");
  }

  return request.user.role;
}

function ensureCanAccessFinancial(request: FastifyRequest): void {
  const role = getUserRole(request);

  if (role !== "SUPER_ADMIN" && role !== "PASTOR") {
    throw new Error("FINANCIAL_ACCESS_DENIED");
  }
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

  if (error.message === "FINANCIAL_ACCESS_DENIED") {
    await reply.code(403).send({
      error: "FINANCIAL_ACCESS_DENIED",
      message: "Você não tem permissão para acessar informações financeiras."
    });
    return;
  }

  if (error.message === "TRANSACTION_NOT_ACTIVE") {
    await reply.code(409).send({
      error: "TRANSACTION_NOT_ACTIVE",
      message: "Apenas lançamentos ativos podem ser corrigidos, cancelados ou estornados."
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
      ensureCanAccessFinancial(request);

      const churchId = getChurchId(request);
      const query = listTransactionsQuerySchema.parse(request.query);

      return await listTransactions(prisma, churchId, query);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.post("/financial/transactions", async (request, reply) => {
    try {
      ensureCanAccessFinancial(request);

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
      ensureCanAccessFinancial(request);

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

  app.post("/financial/transactions/:transactionId/cancel", async (request, reply) => {
    try {
      ensureCanAccessFinancial(request);

      const churchId = getChurchId(request);
      const userId = getUserId(request);
      const params = transactionParamsSchema.parse(request.params);
      const input = transactionControlSchema.parse(request.body);

      return await cancelTransaction(
        prisma,
        churchId,
        params.transactionId,
        userId,
        input
      );
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.post("/financial/transactions/:transactionId/reverse", async (request, reply) => {
    try {
      ensureCanAccessFinancial(request);

      const churchId = getChurchId(request);
      const userId = getUserId(request);
      const params = transactionParamsSchema.parse(request.params);
      const input = transactionControlSchema.parse(request.body);

      return await reverseTransaction(
        prisma,
        churchId,
        params.transactionId,
        userId,
        input
      );
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });

  app.get("/financial/summary", async (request, reply) => {
    try {
      ensureCanAccessFinancial(request);

      const churchId = getChurchId(request);
      const query = listTransactionsQuerySchema.parse(request.query);

      return await getFinancialSummary(prisma, churchId, query);
    } catch (error) {
      await sendRouteError(error, reply);
    }
  });
}
