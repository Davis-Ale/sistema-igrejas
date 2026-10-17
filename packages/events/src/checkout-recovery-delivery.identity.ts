import { createHash } from "node:crypto";
import type { CheckoutScope } from "./checkout-access.schema.js";

// Shared opaque provider correlation. Contains no address or private credential.
export function checkoutRecoveryDeliveryId(input: CheckoutScope & { accessId: string; operationId: string }): string {
  return createHash("sha256").update(JSON.stringify(["checkout-recovery-email-v1", input.churchId,
    input.eventId, input.registrationId, input.accessId, input.operationId])).digest("hex");
}
