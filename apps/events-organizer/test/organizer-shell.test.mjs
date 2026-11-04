import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(join(root, "app/organizer.tsx"), "utf8");
const status = readFileSync(join(root, "app/lib/registration-status.ts"), "utf8");

test("organizer keeps login, event selection, QR check-in and participant lookup", () => {
  assert.match(app, /Entre para organizar/);
  assert.match(app, /Seus eventos/);
  assert.match(app, /Ler QR Code/);
  assert.match(app, /Fazer check-in/);
  assert.match(app, /Localizar participante/);
  assert.match(app, /listRegistrations/);
  assert.match(app, /statusLabel\(selected\)/);
  assert.match(status, /Esta inscrição foi cancelada/);
  assert.match(status, /lista de espera/);
  assert.match(status, /pagamento desta inscrição ainda não foi confirmado/);
  assert.match(status, /ainda não está confirmada/);
  assert.doesNotMatch(app, /selected\.status === "CONFIRMED" \? "Confirmada" : selected\.status/);
  assert.doesNotMatch(app, /Sympla/);
  assert.doesNotMatch(app, /participant-event-app/);
  assert.doesNotMatch(app, /ADR Solutions/);
});
