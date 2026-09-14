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
import { upsertEventsReceivingAccountSchema } from "./event-receiving-account.schema.js";
import {
  getEventsReceivingAccount,
  upsertEventsReceivingAccount
} from "./event-receiving-account.service.js";
import {
  createEventsFinancialRefundSchema,
  listEventsFinancialOperationsQuerySchema,
  listRefundableEventPaymentsQuerySchema
} from "./event-financial-operation.schema.js";
import {
  createEventsFinancialRefund,
  listEventsFinancialOperations,
  listRefundableEventPayments,
  type EventPaymentRefundProviderHandler
} from "./event-financial-operation.service.js";
import {
  FINANCIAL_INSTITUTIONS_CATALOG_SOURCE,
  listFinancialInstitutions,
  searchFinancialInstitutions
} from "./financial-institutions.catalog.js";

type EventsFinancialRole =
  | "SUPER_ADMIN"
  | "PASTOR"
  | "LEADER"
  | "VOLUNTEER"
  | "MEMBER"
  | "VISITOR";

function getChurchId(request: FastifyRequest) {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
}

function getUserId(request: FastifyRequest) {
  if (!request.user?.userId) {
    throw new Error("USER_CONTEXT_REQUIRED");
  }

  return request.user.userId;
}

function getUserRole(request: FastifyRequest): EventsFinancialRole {
  if (!request.user?.role) {
    throw new Error("USER_CONTEXT_REQUIRED");
  }

  return request.user.role;
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

  if (
    error instanceof Error &&
    (error.message === "CHURCH_CONTEXT_REQUIRED" ||
      error.message === "USER_CONTEXT_REQUIRED")
  ) {
    await reply.code(401).send({
      error: "UNAUTHORIZED",
      message: "Contexto de autenticação obrigatório."
    });
    return;
  }

  if (error instanceof Error && error.message === "FINANCIAL_ACCESS_DENIED") {
    await reply.code(403).send({
      error: "FINANCIAL_ACCESS_DENIED",
      message: "Você não tem permissão para alterar a conta de recebimento."
    });
    return;
  }

  if (error instanceof Error && error.message === "FINANCIAL_OPERATION_DENIED") {
    await reply.code(403).send({
      error: "FINANCIAL_OPERATION_DENIED",
      message: "Você não tem permissão para executar esta operação financeira."
    });
    return;
  }

  if (error instanceof Error && error.message === "EVENT_PAYMENT_NOT_FOUND") {
    await reply.code(404).send({
      error: "EVENT_PAYMENT_NOT_FOUND",
      message: "Movimentação financeira não encontrada."
    });
    return;
  }

  if (error instanceof Error && error.message === "EVENT_PAYMENT_NOT_REFUNDABLE") {
    await reply.code(409).send({
      error: "EVENT_PAYMENT_NOT_REFUNDABLE",
      message: "Esta cobrança não pode ser estornada."
    });
    return;
  }

  if (
    error instanceof Error &&
    error.message === "PAYMENT_PROVIDER_REVERSAL_UNSUPPORTED_STATUS"
  ) {
    await reply.code(409).send({
      error: "PAYMENT_PROVIDER_REVERSAL_UNSUPPORTED_STATUS",
      message: "O pagamento não está em um estado que permita estorno."
    });
    return;
  }

  if (
    error instanceof Error &&
    error.message === "PAYMENT_PROVIDER_REVERSAL_FAILED"
  ) {
    await reply.code(502).send({
      error: "PAYMENT_PROVIDER_REVERSAL_FAILED",
      message: "Não foi possível processar o estorno no provedor."
    });
    return;
  }

  if (
    error instanceof Error &&
    error.message === "FINANCIAL_OPERATION_PROVIDER_UNAVAILABLE"
  ) {
    await reply.code(503).send({
      error: "FINANCIAL_OPERATION_PROVIDER_UNAVAILABLE",
      message: "O estorno no provedor não está disponível."
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
  prisma: PrismaClient,
  options?: {
    refundProvider?: EventPaymentRefundProviderHandler;
    applyCancelledStatus?: (input: {
      churchId: string;
      eventPaymentId: string;
      providerPaymentId: string;
    }) => Promise<boolean>;
    finalizeReversal?: (
      churchId: string,
      transactionId: string
    ) => Promise<void>;
  }
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

  app.get("/events/financial/institutions", async (request, reply) => {
    try {
      getChurchId(request);

      const query =
        typeof request.query === "object" && request.query
          ? (request.query as { q?: unknown; limit?: unknown })
          : {};
      const search =
        typeof query.q === "string" ? query.q.trim() : "";
      const parsedLimit =
        typeof query.limit === "string" ? Number(query.limit) : Number.NaN;
      const limit = Number.isInteger(parsedLimit) ? parsedLimit : 20;

      const items = search
        ? searchFinancialInstitutions(search, limit)
        : listFinancialInstitutions();

      return {
        source: {
          name: FINANCIAL_INSTITUTIONS_CATALOG_SOURCE.name,
          dataset: FINANCIAL_INSTITUTIONS_CATALOG_SOURCE.dataset
        },
        total: listFinancialInstitutions().length,
        items
      };
    } catch (error) {
      await sendEventFinancialError(error, reply);
    }
  });

  app.get("/events/financial/receiving-account", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const role = request.user?.role;

      return await getEventsReceivingAccount(prisma, churchId, role);
    } catch (error) {
      await sendEventFinancialError(error, reply);
    }
  });

  app.put("/events/financial/receiving-account", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const actor = {
        userId: getUserId(request),
        role: getUserRole(request)
      };
      const input = upsertEventsReceivingAccountSchema.parse(request.body);

      return await upsertEventsReceivingAccount(prisma, churchId, actor, input);
    } catch (error) {
      await sendEventFinancialError(error, reply);
    }
  });

  app.get("/events/financial/operations", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const query = listEventsFinancialOperationsQuerySchema.parse(request.query);

      return await listEventsFinancialOperations(
        prisma,
        churchId,
        request.user?.role,
        query
      );
    } catch (error) {
      await sendEventFinancialError(error, reply);
    }
  });

  app.get("/events/financial/operations/refundable", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const query = listRefundableEventPaymentsQuerySchema.parse(request.query);

      return await listRefundableEventPayments(
        prisma,
        churchId,
        request.user?.role,
        query
      );
    } catch (error) {
      await sendEventFinancialError(error, reply);
    }
  });

  app.post("/events/financial/operations/refunds", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const actor = {
        userId: getUserId(request),
        role: getUserRole(request)
      };
      const input = createEventsFinancialRefundSchema.parse(request.body);
      const refundProvider = options?.refundProvider;
      const applyCancelledStatus = options?.applyCancelledStatus;
      const finalizeReversal = options?.finalizeReversal;

      if (!refundProvider || !applyCancelledStatus || !finalizeReversal) {
        throw new Error("FINANCIAL_OPERATION_PROVIDER_UNAVAILABLE");
      }

      const operation = await createEventsFinancialRefund(
        prisma,
        churchId,
        actor,
        input,
        refundProvider,
        {
          applyCancelledStatus: (payload) =>
            applyCancelledStatus({
              churchId,
              eventPaymentId: payload.eventPaymentId,
              providerPaymentId: payload.providerPaymentId
            }),
          finalizeReversal: (transactionId) =>
            finalizeReversal(churchId, transactionId)
        }
      );

      return operation;
    } catch (error) {
      await sendEventFinancialError(error, reply);
    }
  });
}
