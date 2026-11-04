import assert from "node:assert/strict";
import test from "node:test";
import {
  canCheckIn,
  registrationBlock,
  statusLabel
} from "../app/lib/registration-status.ts";

const eligible = {
  status: "CONFIRMED",
  paymentStatus: "PAID",
  waitlistedAt: null,
  checkInToken: "check-in-token-1"
};

test("organizer status labels never expose technical enums", () => {
  assert.equal(statusLabel({ status: "CHECKED_IN", waitlistedAt: null }), "Presente");
  assert.equal(statusLabel({ status: "CANCELLED", waitlistedAt: null }), "Cancelada");
  assert.equal(statusLabel({ status: "PENDING", waitlistedAt: null }), "Pendente");
  assert.equal(statusLabel({ status: "CONFIRMED", waitlistedAt: "2026-11-01" }), "Lista de espera");
  assert.equal(statusLabel({ status: "CONFIRMED", waitlistedAt: null }), "Confirmada");
  assert.equal(statusLabel({ status: "UNKNOWN", waitlistedAt: null }), "Indisponível");
});

test("organizer blocks pending, unpaid, waitlisted, cancelled and already present check-in", () => {
  assert.equal(registrationBlock({ ...eligible, paymentStatus: "PENDING" }),
    "O pagamento desta inscrição ainda não foi confirmado.");
  assert.equal(registrationBlock({ ...eligible, status: "PENDING" }),
    "Esta inscrição ainda não está confirmada.");
  assert.equal(registrationBlock({ ...eligible, waitlistedAt: "2026-11-01" }),
    "Esta inscrição ainda está na lista de espera.");
  assert.equal(registrationBlock({ ...eligible, status: "CANCELLED" }),
    "Esta inscrição foi cancelada e não pode fazer check-in.");
  assert.equal(registrationBlock({ ...eligible, status: "CHECKED_IN" }),
    "Check-in já realizado para esta inscrição.");
  assert.equal(registrationBlock(eligible), null);
  assert.equal(canCheckIn(eligible), true);
  assert.equal(canCheckIn({ ...eligible, checkInToken: null }), false);
  assert.equal(canCheckIn({ ...eligible, status: "PENDING" }), false);
  assert.equal(canCheckIn({ ...eligible, status: "CHECKED_IN" }), false);
});
