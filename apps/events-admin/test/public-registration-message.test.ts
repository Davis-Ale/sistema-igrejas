import assert from "node:assert/strict";
import test from "node:test";
import {
  getDefaultPublicRegistrationMessage,
  getPublicRegistrationMessage,
  isPublicRegistrationConfirmed,
  PAID_REGISTRATION_ACCESS_MESSAGE
} from "../app/eventos/_components/public-registration-message.ts";

const confirmed = {
  status: "CONFIRMED",
  paymentStatus: "PAID",
  waitlistedAt: null
};

test("paid confirmation shows the exact access message", () => {
  assert.equal(getPublicRegistrationMessage(confirmed), PAID_REGISTRATION_ACCESS_MESSAGE);
  assert.equal(getPublicRegistrationMessage({ ...confirmed, status: "CHECKED_IN" }), PAID_REGISTRATION_ACCESS_MESSAGE);
  assert.equal(isPublicRegistrationConfirmed(confirmed), true);
});

test("other registration states keep the existing message", () => {
  assert.equal(getPublicRegistrationMessage({ ...confirmed, paymentStatus: "NOT_REQUIRED" }), "Sua inscrição foi confirmada.");
  assert.equal(getPublicRegistrationMessage({ ...confirmed, paymentStatus: "PENDING", status: "PENDING" }), "Sua inscrição foi recebida e ficará pendente até a confirmação do pagamento.");
  assert.equal(getPublicRegistrationMessage({ ...confirmed, paymentStatus: "OVERDUE", status: "PENDING" }), "O prazo do pagamento venceu. Sua inscrição ainda não foi confirmada.");
  assert.equal(getPublicRegistrationMessage({ ...confirmed, paymentStatus: "REFUND_PENDING", status: "CONFIRMED" }), "O estorno está em processamento. A credencial está indisponível.");
  assert.equal(getPublicRegistrationMessage({ ...confirmed, paymentStatus: "CANCELLED", status: "CANCELLED" }), "Esta inscrição foi cancelada.");
  assert.equal(getPublicRegistrationMessage({ ...confirmed, waitlistedAt: "2026-11-14T00:00:00.000Z" }), "Sua inscrição entrou na lista de espera.");
  assert.equal(getPublicRegistrationMessage({ ...confirmed, paymentStatus: "PAID", status: "PENDING" }), "Sua inscrição foi recebida e ficará pendente até a confirmação do pagamento.");
  assert.equal(isPublicRegistrationConfirmed({ ...confirmed, paymentStatus: "PAID", status: "PENDING" }), false);
  assert.equal(isPublicRegistrationConfirmed({ ...confirmed, status: "CANCELLED", paymentStatus: "PAID" }), false);
  assert.equal(getDefaultPublicRegistrationMessage(confirmed), "Sua inscrição foi confirmada.");
});
