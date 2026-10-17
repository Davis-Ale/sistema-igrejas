import type { PrismaClient } from "@prisma/client";
import { getAsaasPayment, getAsaasPixQrCode } from "@sistema-igrejas/financial";
import { prepareCheckoutV2Routes } from "../../../packages/events/src/checkout-v2.routes.js";
import { createAsaasCheckoutChargeProvider } from "../../../packages/financial/src/asaas-checkout-charge.provider.js";
import type { AssistedCheckoutRecovery } from "../../../packages/events/src/checkout-assisted-recovery.service.js";

// Deliberately not imported/called by app.ts or server.ts. No environment switch.
export function prepareEventsApiCheckoutV2(prisma: PrismaClient, assistedRecovery?: AssistedCheckoutRecovery) {
  return prepareCheckoutV2Routes(prisma, {
    async read(id) {
      const payment = await getAsaasPayment(id);
      if (payment.billingType !== "PIX" && payment.billingType !== "CREDIT_CARD") throw new Error("PAYMENT_CHECKOUT_FAILED");
      return { id: payment.id, method: payment.billingType === "PIX" ? "PIX" : "CARD", amount: payment.value,
        status: payment.status, redirectUrl: payment.invoiceUrl ?? null };
    }, pix: getAsaasPixQrCode
  }, createAsaasCheckoutChargeProvider(), assistedRecovery);
}
