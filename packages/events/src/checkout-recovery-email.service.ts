import { z } from "zod";
import { checkoutRecoveryDeliveryId } from "./checkout-recovery-delivery.identity.js";
import { checkoutCredentialSchema } from "./checkout-access.schema.js";
import type { CheckoutRecoveryEmailSender } from "./checkout-assisted-recovery.service.js";

/** Explicit configuration only; never imported/created by an active builder.
 * Direct Resend transport avoids the installed SDK's development error-body logs.
 * An abort/late response never proves absence of delivery or authorizes a resend.
 */
export function createCheckoutRecoveryResendSender(config: { apiKey: string; from: string }): CheckoutRecoveryEmailSender {
  if (!config.apiKey?.trim() || !z.string().email().safeParse(config.from).success) {
    throw new Error("CHECKOUT_RECOVERY_DELIVERY_NOT_CONFIGURED");
  }
  return async (input, signal) => {
    try {
      signal.throwIfAborted();
      const credential = checkoutCredentialSchema.parse(input.credential);
      const to = z.string().email().max(254).parse(input.recipientEmail);
      const operationId = z.string().uuid().parse(input.operationId);
      const binding = z.array(z.string().trim().min(1)).parse([input.churchId, input.eventId, input.registrationId, input.accessId]);
      const deliveryId = checkoutRecoveryDeliveryId({ churchId: binding[0]!, eventId: binding[1]!, registrationId: binding[2]!, accessId: binding[3]!, operationId });
      if (!Number.isFinite(input.expiresAt.getTime()) || input.expiresAt.getTime() <= Date.now()) throw new Error();
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", signal,
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json",
          "Idempotency-Key": `event-checkout-recovery/${deliveryId}` },
        body: JSON.stringify({
        from: config.from, to: [to], subject: "Recuperação assistida do checkout",
        text: `Após a verificação humana solicitada, esta é sua chave privada de acesso ao checkout:\n\n${credential}\n\n` +
          `Válida até ${input.expiresAt.toISOString()}. O prazo é absoluto e não é renovado pelo uso.\n` +
          "Não compartilhe esta chave. Ela não é uma confirmação de pagamento nem uma credencial de check-in.",
        tags: [{ name: "checkout_recovery_operation", value: operationId }, { name: "checkout_recovery_delivery", value: deliveryId }]
        })
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error(); }
      const data = z.object({ id: z.string().uuid() }).parse(await response.json());
      signal.throwIfAborted();
      return { receiptReference: `resend_${data.id}` };
    } catch { throw new Error("CHECKOUT_RECOVERY_DELIVERY_UNCERTAIN"); }
  };
}

/** Read-only reconciliation adapter. The response may contain the email body;
 * only this allowlist leaves the adapter. Never log or persist the raw response.
 */
export function createCheckoutRecoveryResendReader(config: { apiKey: string }) {
  if (!config.apiKey?.trim()) throw new Error("CHECKOUT_RECOVERY_DELIVERY_NOT_CONFIGURED");
  return async (receiptReference: string, signal: AbortSignal) => {
    try {
      const match = /^resend_([a-f0-9-]{36})$/.exec(receiptReference);
      const id = z.string().uuid().parse(match?.[1]);
      signal.throwIfAborted();
      const response = await fetch(`https://api.resend.com/emails/${id}`, { method: "GET", signal,
        headers: { Authorization: `Bearer ${config.apiKey}` } });
      if (!response.ok) { await response.body?.cancel(); throw new Error(); }
      const data = z.object({ id: z.string().uuid(), to: z.array(z.string().email()).length(1),
        tags: z.array(z.object({ name: z.string(), value: z.string() })) }).parse(await response.json());
      signal.throwIfAborted();
      if (data.id !== id) throw new Error();
      const tag = (name: string) => { const values = data.tags.filter(t => t.name === name);
        if (values.length !== 1) throw new Error(); return values[0]!.value; };
      return { receiptReference: `resend_${data.id}`, recipientEmail: data.to[0]!.trim().toLowerCase(),
        operationId: z.string().uuid().parse(tag("checkout_recovery_operation")),
        deliveryId: z.string().regex(/^[a-f0-9]{64}$/).parse(tag("checkout_recovery_delivery")) };
    } catch { throw new Error("CHECKOUT_RECOVERY_DELIVERY_UNCERTAIN"); }
  };
}
