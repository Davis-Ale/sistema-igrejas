import type { Prisma, PrismaClient } from "@prisma/client";
import { checkoutScopeSchema, createPublicRegistrationV2Schema } from "./checkout-access.schema.js";
import { sendRegistrationConfirmationEmail } from "./registration-confirmation-email.service.js";
import { createPostgresRegistrationConfirmationDeliveryStore } from "./registration-confirmation-delivery.store.js";

type SendEmail = typeof sendRegistrationConfirmationEmail;
type DeliveryPayload = Parameters<SendEmail>[0];

// Shared confirmation consumer. Does not register routes or touch checkout recovery.
export async function sendPendingRegistrationConfirmationEmail(
  prisma: PrismaClient,
  churchId: string,
  input: { registrationId: string; eventId: string },
  sendEmail: SendEmail = sendRegistrationConfirmationEmail,
  options?: { deliveryTimeoutMs?: number }
): Promise<boolean> {
  const timeoutMs = options?.deliveryTimeoutMs ?? 15_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new Error("REGISTRATION_CONFIRMATION_DELIVERY_TIMEOUT_INVALID");
  }
  const scope = checkoutScopeSchema.parse({
    churchId, eventId: input.eventId, registrationId: input.registrationId
  });
  const store = createPostgresRegistrationConfirmationDeliveryStore(prisma);
  const claim = await store.claim(scope, tx => resolveEligibleDelivery(tx, scope));
  if (!claim.claimed) return false;
  // The provider call is outside the claim transaction and outside its retry.
  // A late result after the deadline must not write ACCEPTED or send again.
  const outcome = await observeDelivery(sendEmail, claim.payload, timeoutMs);
  if (outcome === "accepted") {
    try {
      return await store.accept(scope, new Date());
    } catch {
      try { await store.uncertain(scope, new Date()); } catch { /* INTENT remains; do not POST again. */ }
      return false;
    }
  }
  try { await store.uncertain(scope, new Date()); } catch { /* INTENT remains; do not POST again. */ }
  return false;
}

async function resolveEligibleDelivery(
  tx: Prisma.TransactionClient,
  scope: { churchId: string; eventId: string; registrationId: string }
): Promise<{ proceed: false } | { proceed: true; payload: DeliveryPayload }> {
  // JSON extraction works before an additive column is visible to an old client.
  const [destination] = await tx.$queryRaw<{ id: string; checkoutEmail: string | null }[]>`
    SELECT r."id", to_jsonb(r)->>'checkoutEmail' AS "checkoutEmail" FROM "Registration" r
    WHERE "id" = ${scope.registrationId}
      AND "churchId" = ${scope.churchId}
      AND "eventId" = ${scope.eventId}
    FOR UPDATE
  `;
  const registration = await tx.registration.findFirst({
    where: { id: scope.registrationId, churchId: scope.churchId, eventId: scope.eventId },
    select: {
      id: true, status: true, paymentStatus: true, waitlistedAt: true,
      checkInToken: true, confirmationEmailSentAt: true,
      person: { select: { churchId: true, name: true, email: true } },
      visitor: { select: { churchId: true, name: true, email: true } },
      event: { select: {
        id: true, churchId: true, title: true, date: true, isPaid: true, slug: true, publicSlug: true,
        church: { select: { slug: true } }
      } }
    }
  });
  if (!registration || destination?.id !== registration.id ||
      registration.event.id !== scope.eventId || registration.event.churchId !== scope.churchId ||
      (registration.person && registration.person.churchId !== scope.churchId) ||
      (registration.visitor && registration.visitor.churchId !== scope.churchId) ||
      registration.confirmationEmailSentAt ||
      registration.status !== "CONFIRMED" || registration.paymentStatus !== "PAID" ||
      registration.waitlistedAt) return { proceed: false };
  const participant = registration.person ?? registration.visitor;
  if (!participant) return { proceed: false };
  // A local destination owns this registration. Only a null, blank or absent
  // local value keeps the scoped contact fallback. An invalid nonblank local
  // value must not redirect the credential.
  const localEmail = destination.checkoutEmail?.trim();
  const recipient = createPublicRegistrationV2Schema.shape.email.safeParse(localEmail || participant.email);
  if (!recipient.success) return { proceed: false };
  return {
    proceed: true,
    payload: {
      registrationId: registration.id,
      recipientEmail: recipient.data,
      participantName: participant.name,
      checkInToken: registration.checkInToken,
      registrationStatus: registration.status,
      paymentStatus: registration.paymentStatus,
      waitlistedAt: registration.waitlistedAt,
      event: {
        title: registration.event.title,
        date: registration.event.date,
        isPaid: registration.event.isPaid,
        slug: registration.event.slug,
        publicSlug: registration.event.publicSlug,
        churchSlug: registration.event.church.slug
      }
    }
  };
}

async function observeDelivery(sendEmail: SendEmail, payload: DeliveryPayload, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const attempt = Promise.resolve().then(() => sendEmail(payload)).then(
    value => (value === true ? "accepted" as const : "uncertain" as const),
    () => "uncertain" as const
  );
  const deadline = new Promise<"uncertain">(resolve => {
    timer = setTimeout(() => resolve("uncertain"), timeoutMs);
  });
  try {
    return await Promise.race([attempt, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
