export const PAID_REGISTRATION_ACCESS_MESSAGE =
  "Pagamento confirmado. O QR Code e o acesso ao aplicativo estão liberados.";

export type PublicRegistrationMessageState = {
  status: string;
  paymentStatus: string;
  waitlistedAt: string | Date | null;
};

export function isPublicRegistrationConfirmed(
  registration: PublicRegistrationMessageState | null
) {
  if (!registration) {
    return false;
  }

  return (
    !registration.waitlistedAt &&
    (registration.paymentStatus === "PAID" || registration.paymentStatus === "NOT_REQUIRED") &&
    (registration.status === "CONFIRMED" || registration.status === "CHECKED_IN")
  );
}

export function getDefaultPublicRegistrationMessage(
  registration: PublicRegistrationMessageState
) {
  if (registration.waitlistedAt) {
    return "Sua inscrição entrou na lista de espera.";
  }

  if (isPublicRegistrationConfirmed(registration)) return "Sua inscrição foi confirmada.";
  if (registration.paymentStatus === "CANCELLED" || registration.status === "CANCELLED") return "Esta inscrição foi cancelada.";
  if (registration.paymentStatus === "OVERDUE") return "O prazo do pagamento venceu. Sua inscrição ainda não foi confirmada.";
  if (registration.paymentStatus === "REFUND_PENDING") return "O estorno está em processamento. A credencial está indisponível.";
  return "Sua inscrição foi recebida e ficará pendente até a confirmação do pagamento.";
}

export function getPublicRegistrationMessage(
  registration: PublicRegistrationMessageState
) {
  if (registration.paymentStatus === "PAID" && isPublicRegistrationConfirmed(registration)) {
    return PAID_REGISTRATION_ACCESS_MESSAGE;
  }

  return getDefaultPublicRegistrationMessage(registration);
}
