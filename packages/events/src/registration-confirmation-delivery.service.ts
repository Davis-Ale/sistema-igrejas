import type { PrismaClient } from "@prisma/client";
import { createPublicRegistrationV2Schema } from "./checkout-access.schema.js";
import { sendRegistrationConfirmationEmail } from "./registration-confirmation-email.service.js";

// Shared confirmation consumer; does not register or activate checkout routes.
export async function sendPendingRegistrationConfirmationEmail(
  prisma: PrismaClient,
  churchId: string,
  input: { registrationId: string; eventId: string },
  sendEmail: typeof sendRegistrationConfirmationEmail = sendRegistrationConfirmationEmail
): Promise<boolean> {
  return prisma.$transaction(async transaction => {
    // Serialize delivery attempts across processes and re-read eligibility after
    // acquiring the row lock. Payment/registration confirmation is already committed.
    // JSON extraction works before the additive column migration as well; no
    // schema probing, exception fallback, or migration is performed here.
    const [destination] = await transaction.$queryRaw<{ id: string; checkoutEmail: string | null }[]>`
      SELECT r."id", to_jsonb(r)->>'checkoutEmail' AS "checkoutEmail" FROM "Registration" r
      WHERE "id" = ${input.registrationId}
        AND "churchId" = ${churchId}
        AND "eventId" = ${input.eventId}
      FOR UPDATE
    `;
    const registration = await transaction.registration.findFirst({
      where: { id: input.registrationId, churchId, eventId: input.eventId },
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
        registration.event.id !== input.eventId || registration.event.churchId !== churchId ||
        (registration.person && registration.person.churchId !== churchId) ||
        (registration.visitor && registration.visitor.churchId !== churchId) ||
        registration.confirmationEmailSentAt ||
        registration.status !== "CONFIRMED" || registration.paymentStatus !== "PAID" ||
        registration.waitlistedAt) return false;
    const participant = registration.person ?? registration.visitor;
    if (!participant) return false;
    // The local destination owns this registration, even when contacts are shared.
    // Only registrations without a local destination retain the legacy fallback.
    // An invalid nonblank local value must never redirect a credential to a contact.
    const localEmail = destination.checkoutEmail?.trim();
    const recipient = createPublicRegistrationV2Schema.shape.email.safeParse(localEmail || participant.email);
    if (!recipient.success) return false;

    // Keep the adapter's stable provider idempotency key for ambiguous failures
    // between provider acceptance and committing the delivery marker.
    const sent = await sendEmail({
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
    });
    if (sent) {
      await transaction.registration.update({
        where: { id: registration.id, churchId, eventId: input.eventId },
        data: { confirmationEmailSentAt: new Date() }
      });
    }
    return sent;
  }, { timeout: 30000 });
}
