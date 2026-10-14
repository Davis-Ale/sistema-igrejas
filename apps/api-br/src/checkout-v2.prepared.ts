import type { PrismaClient } from "@prisma/client";
import { getAsaasPayment, getAsaasPixQrCode } from "@sistema-igrejas/financial";
import { prepareCheckoutV2Routes } from "../../../packages/events/src/checkout-v2.routes.js";

// Deliberately not imported/called by app.ts or server.ts. No environment switch.
export function prepareApiBrCheckoutV2(prisma: PrismaClient) {
  return prepareCheckoutV2Routes(prisma, {
    async read(id) {
      const payment = await getAsaasPayment(id);
      if (payment.billingType !== "PIX" && payment.billingType !== "CREDIT_CARD") throw new Error("PAYMENT_CHECKOUT_FAILED");
      return { id: payment.id, method: payment.billingType === "PIX" ? "PIX" : "CARD", amount: payment.value,
        status: payment.status, redirectUrl: payment.invoiceUrl ?? null };
    }, pix: getAsaasPixQrCode
  });
}
