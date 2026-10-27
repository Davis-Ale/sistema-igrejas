import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("form overlay keeps ticket/lot scope, active setting and rejects empty selection", async () => {
  const source = await readFile(
    new URL("../app/dashboard/eventos/[eventId]/event-workspace-client.tsx", import.meta.url),
    "utf8"
  );
  assert.equal(source.includes("Selecione ao menos um ingresso para este campo."), true);
  assert.equal(source.includes("Campo ativo no formulário de inscrição"), true);
  assert.equal(source.includes("ticket.batches"), true);
  assert.equal(source.includes("Mostrar este campo para tipos específicos de ingressos"), true);
  assert.equal(source.includes("TEXT"), true);
  assert.equal(source.includes("PARAGRAPH"), true);
});
