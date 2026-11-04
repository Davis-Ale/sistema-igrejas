export type RegistrationStatusView = {
  status: string;
  paymentStatus: string;
  waitlistedAt: string | Date | null;
};

export function statusLabel(item: Pick<RegistrationStatusView, "status" | "waitlistedAt">) {
  if (item.status === "CHECKED_IN") return "Presente";
  if (item.status === "CANCELLED") return "Cancelada";
  if (item.waitlistedAt) return "Lista de espera";
  if (item.status === "PENDING") return "Pendente";
  if (item.status === "CONFIRMED") return "Confirmada";
  return "Indisponível";
}

export function registrationBlock(item: RegistrationStatusView) {
  if (item.status === "CANCELLED") {
    return "Esta inscrição foi cancelada e não pode fazer check-in.";
  }
  if (item.waitlistedAt) {
    return "Esta inscrição ainda está na lista de espera.";
  }
  if (item.status === "PENDING") {
    return "Esta inscrição ainda não está confirmada.";
  }
  if (item.paymentStatus === "PENDING" || item.paymentStatus === "CANCELLED") {
    return "O pagamento desta inscrição ainda não foi confirmado.";
  }
  if (item.status === "CHECKED_IN") {
    return "Check-in já realizado para esta inscrição.";
  }
  if (item.status !== "CONFIRMED") {
    return "Esta inscrição não pode fazer check-in.";
  }
  return null;
}

export function canCheckIn(item: RegistrationStatusView & { checkInToken: string | null }) {
  return item.status === "CONFIRMED" && Boolean(item.checkInToken) && !registrationBlock(item);
}
