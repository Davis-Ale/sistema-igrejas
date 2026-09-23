import { ensureCanAccessFinancial, ensureCanReverseFinancial } from "./financial.authorization.js";
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
  updateTransaction,
  type TransactionReversalProviderHandler
} from "./financial.service.js";


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
  if (error instanceof Error && "code" in error && error.code === "P2025") {
    await reply.code(409).send({ error: "TRANSACTION_NOT_ACTIVE", message: "O lançamento foi alterado. Atualize os dados antes de tentar novamente." });
    return;
  }
  if (error instanceof Error && error.message === "FINANCIAL_OPERATION_DENIED") {
    await reply.code(403).send({ error: error.message, message: "Você não tem permissão para executar esta operação financeira." });
    return;
  }
  if (error instanceof Error && ["PAYMENT_PROVIDER_TRANSACTION_LOCKED", "PAYMENT_PROVIDER_REFERENCE_READ_ONLY"].includes(error.message)) {
    await reply.code(409).send({ error: error.message, message: "Cobranças do provedor devem ser alteradas pelo fluxo integrado de pagamentos." });
    return;
  }
  if (error instanceof Error && error.message === "CAMPUS_NOT_FOUND") {
    await reply.code(404).send({ error: error.message, message: "Campus não encontrado." });
    return;
  }
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

  if (
    error.message ===
      "PAYMENT_PROVIDER_REVERSAL_UNSUPPORTED_STATUS"
  ) {
    await reply.code(409).send({
      error:
        "PAYMENT_PROVIDER_REVERSAL_UNSUPPORTED_STATUS",
      message:
        "O pagamento não está em um estado que permita estorno."
    });
    return;
  }

  if (
    error.message ===
      "PAYMENT_PROVIDER_REVERSAL_FAILED"
  ) {
    await reply.code(502).send({
      error:
        "PAYMENT_PROVIDER_REVERSAL_FAILED",
      message:
        "Não foi possível processar o estorno no provedor."
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
  prisma: PrismaClient,
  transactionReversalProviderHandler?:
    TransactionReversalProviderHandler
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
      ensureCanReverseFinancial(request);

      const churchId = getChurchId(request);
      const userId = getUserId(request);
      const params = transactionParamsSchema.parse(request.params);
      const input = transactionControlSchema.parse(request.body);

      return await reverseTransaction(
        prisma,
        churchId,
        params.transactionId,
        userId,
        input,
        transactionReversalProviderHandler
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
