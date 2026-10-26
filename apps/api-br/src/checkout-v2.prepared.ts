import type { PrismaClient } from "@prisma/client";
import { getAsaasPayment, getAsaasPixQrCode } from "@sistema-igrejas/financial";
import { prepareCheckoutV2Routes } from "../../../packages/events/src/checkout-v2.routes.js";
import { createAsaasCheckoutChargeProvider } from "../../../packages/financial/src/asaas-checkout-charge.provider.js";
import type { AssistedCheckoutRecovery } from "../../../packages/events/src/checkout-assisted-recovery.service.js";

// Exclusive registrar used by buildApp through registerExclusiveCheckoutV2. No environment switch.
export function prepareApiBrCheckoutV2(prisma: PrismaClient, assistedRecovery?: AssistedCheckoutRecovery) {
  return prepareCheckoutV2Routes(prisma, {
    async read(id) {
      const payment = await getAsaasPayment(id);
      if (payment.billingType !== "PIX" && payment.billingType !== "CREDIT_CARD") throw new Error("PAYMENT_CHECKOUT_FAILED");
      return { id: payment.id, method: payment.billingType === "PIX" ? "PIX" : "CARD", amount: payment.value,
        status: payment.status, redirectUrl: payment.invoiceUrl ?? null };
    }, pix: getAsaasPixQrCode
  }, createAsaasCheckoutChargeProvider(), assistedRecovery);
}
