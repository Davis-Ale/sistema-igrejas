import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("participant app keeps the five approved tabs with church identity", () => {
  const app = read("app/_components/participant-event-app.tsx");
  const css = read("app/_components/participant-event-app.module.css");

  assert.match(app, /label: "Home"/);
  assert.match(app, /label: "Cronograma"/);
  assert.match(app, /label: "Credencial"/);
  assert.match(app, /label: "Mapa"/);
  assert.match(app, /label: "Perfil"/);
  assert.match(app, /churchName/);
  assert.match(app, /QRCode/);
  assert.match(app, /Encerrar acesso/);
  assert.match(app, /Buscar por nome, facilitador ou local/);
  assert.match(app, /Sua próxima sessão/);
  assert.match(app, /Meus dados/);
  assert.doesNotMatch(app, /ADR Solutions/);
  assert.doesNotMatch(app, /Sympla/);
  assert.doesNotMatch(app, /cpf|CPF|cidade|Cidade/i);
  assert.match(css, /#eef0f3/);
  assert.match(css, /\.navCredential/);
});
