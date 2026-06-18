import type {} from "@sistema-igrejas/auth";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AsaasClientError } from "./asaas.client.js";
import { createAsaasChargeSchema } from "./asaas.schema.js";
import {
  createAsaasCustomer,
  createAsaasPayment,
  type CreateAsaasCustomerInput,
  type CreateAsaasPaymentInput
} from "./asaas.service.js";

function getChurchId(request: FastifyRequest): string {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
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

export async function registerAsaasRoutes(app: FastifyInstance): Promise<void> {
  app.post("/financial/asaas/charges", async (request, reply) => {
    try {
      const churchId = getChurchId(request);
      const input = createAsaasChargeSchema.parse(request.body);

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
        externalReference: `${churchId}:${input.externalReference}:payment`,
        value: input.value
      };

      if (input.description) {
        paymentInput.description = input.description;
      }

      const payment = await createAsaasPayment(paymentInput);

      await reply.code(201).send({
        customer,
        payment
      });
    } catch (error) {
      await sendAsaasRouteError(error, reply);
    }
  });
}
