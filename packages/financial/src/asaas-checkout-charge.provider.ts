import { z } from "zod";
import { createAsaasClient } from "./asaas.client.js";
import type { CheckoutFirstChargeProvider } from "../../events/src/checkout-charge.service.js";

// Stateless dormant adapter: no Prisma, financial updates, deletes, automatic
// retries or QR requests. It is not exported from index.ts or used by buildApp.
const paymentSchema = z.object({ id: z.string().trim().min(1), externalReference: z.string().min(1),
  billingType: z.enum(["PIX", "CREDIT_CARD"]), value: z.number().finite().positive() });
function receipt(value: unknown) {
  const payment = paymentSchema.parse(value);
  return { id: payment.id, externalReference: payment.externalReference, amount: payment.value,
    method: payment.billingType === "PIX" ? "PIX" as const : "CARD" as const };
}

export function createAsaasCheckoutChargeProvider(client = createAsaasClient()): CheckoutFirstChargeProvider {
  return {
    async create(command, signal) {
      signal.throwIfAborted();
      const customer = z.object({ id: z.string().trim().min(1) }).parse(await client.request<unknown>({
        method: "POST", path: "/customers", signal, idempotencyKey: `${command.idempotencyKey}:customer`,
        body: { name: command.customer.name, email: command.customer.email, cpfCnpj: command.customer.cpf,
          ...(command.customer.phone ? { mobilePhone: command.customer.phone } : {}),
          externalReference: `${command.churchId}:${command.eventPaymentId}:customer`, notificationDisabled: true }
      }));
      signal.throwIfAborted();
      return receipt(await client.request<unknown>({ method: "POST", path: "/payments", signal,
        idempotencyKey: command.idempotencyKey, body: { customer: customer.id,
          billingType: command.method === "PIX" ? "PIX" : "CREDIT_CARD", value: command.amount,
          dueDate: new Date().toISOString().slice(0, 10), externalReference: command.externalReference }
      }));
    },
    async read(id, signal) {
      signal.throwIfAborted();
      return receipt(await client.request<unknown>({ method: "GET", path: `/payments/${encodeURIComponent(id)}`, signal }));
    }
  };
}
