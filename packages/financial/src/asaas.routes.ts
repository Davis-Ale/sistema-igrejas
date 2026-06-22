import type {} from "@sistema-igrejas/auth";
import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AsaasClientError } from "./asaas.client.js";
import { createTransaction, updateTransaction } from "./financial.service.js";
import { createAsaasChargeSchema } from "./asaas.schema.js";
import {
  createAsaasCustomer,
  createAsaasPayment,
  type CreateAsaasCustomerInput,
  type CreateAsaasPaymentInput
} from "./asaas.service.js";

type AsaasWebhookPayment = {
  id?: unknown;
  status?: unknown;
  externalReference?: unknown;
};

type AsaasWebhookBody = {
  event?: unknown;
  payment?: AsaasWebhookPayment;
};

function getAsaasPaymentMethod(billingType: "BOLETO" | "PIX" | "CREDIT_CARD") {
  if (billingType === "CREDIT_CARD") {
    return "CARD" as const;
  }

  return billingType;
}

function getChurchId(request: FastifyRequest): string {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
}

function mapAsaasPaymentStatus(status: unknown): string | null {
  if (typeof status !== "string") {
    return null;
  }

  if (status === "RECEIVED" || status === "CONFIRMED") {
    return "PAID";
  }

  if (status === "CANCELLED" || status === "REFUNDED") {
    return "CANCELLED";
  }

  if (status === "OVERDUE") {
    return "OVERDUE";
  }

  return "PENDING";
}

function parseAsaasExternalReference(externalReference: unknown) {
  if (typeof externalReference !== "string" || externalReference.length === 0) {
    return null;
  }

  const parts = externalReference.split(":");

  if (parts.length < 3) {
    return null;
  }

  const churchId = parts[0];
  const referenceId = parts.slice(1, -1).join(":");

  if (!churchId || !referenceId) {
    return null;
  }

  return {
    churchId,
    referenceId
  };
}

async function sendAsaasRouteError(error: unknown, reply: FastifyReply): Promise<void> {
  if (error instanceof AsaasClientError) {
    await reply.code(502).send({
      error: "ASAAS_REQUEST_FAILED",
      message: "Falha ao comunicar com o Asaas.",
      status: error.status
    });
    return;
  }

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

  if (error.message === "ASAAS_API_KEY_REQUIRED") {
    await reply.code(500).send({
      error: "ASAAS_API_KEY_REQUIRED",
      message: "Chave da API Asaas não configurada."
    });
    return;
  }

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export async function registerAsaasWebhookRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  app.post("/webhooks/asaas", async (request, reply) => {
    const body = request.body as AsaasWebhookBody;
    const payment = body.payment ?? {};
    const paymentId = typeof payment.id === "string" ? payment.id : null;
    const paymentStatus = mapAsaasPaymentStatus(payment.status);
    const reference = parseAsaasExternalReference(payment.externalReference);

    if (paymentId && reference) {
      await prisma.transaction.updateMany({
        where: {
          id: reference.referenceId,
          churchId: reference.churchId
        },
        data: {
          asaasId: paymentId
        }
      });
    }

    if (paymentStatus && reference) {
      await prisma.registration.updateMany({
        where: {
          churchId: reference.churchId,
          OR: [
            {
              id: reference.referenceId
            },
            {
              paymentId: reference.referenceId
            },
            ...(paymentId
              ? [
                  {
                    paymentId
                  }
                ]
              : [])
          ]
        },
        data: {
          paymentStatus
        }
      });
    }

    await reply.send({
      received: true
    });
  });
}

export async function registerAsaasRoutes(app: FastifyInstance, prisma: PrismaClient): Promise<void> {
  app.post("/financial/asaas/charges", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const input = createAsaasChargeSchema.parse(request.body);

      const transaction = await createTransaction(prisma, churchId, {
        amount: input.value,
        costCenter: input.costCenter ?? "ASAAS",
        direction: "IN",
        eventId: input.eventId,
        method: getAsaasPaymentMethod(input.billingType),
        personId: input.personId,
        type: input.eventId ? "EVENT" : "OTHER"
      });

      const customerInput: CreateAsaasCustomerInput = {
        externalReference: `${churchId}:${input.externalReference}:customer`,
        name: input.customer.name
      };

      if (input.customer.cpfCnpj) {
        customerInput.cpfCnpj = input.customer.cpfCnpj;
      }

      if (input.customer.email) {
        customerInput.email = input.customer.email;
      }

      if (input.customer.mobilePhone) {
        customerInput.mobilePhone = input.customer.mobilePhone;
      }

      const customer = await createAsaasCustomer(customerInput);

      const paymentInput: CreateAsaasPaymentInput = {
        billingType: input.billingType,
        customerId: customer.id,
        dueDate: input.dueDate,
        externalReference: `::payment`,
        value: input.value
      };

      if (input.description) {
        paymentInput.description = input.description;
      }

      const payment = await createAsaasPayment(paymentInput);

      await updateTransaction(prisma, churchId, transaction.id, {
        asaasId: payment.id
      });

      await reply.code(201).send({
        customer,
        payment,
        transaction
      });
    } catch (error) {
      await sendAsaasRouteError(error, reply);
    }
  });
}
