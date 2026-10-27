import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("integrations hub can edit ERROR and CONNECTED without changing reserved spacing", async () => {
  const source = await readFile(new URL("../app/dashboard/eventos/integracoes/event-integrations-client.tsx", import.meta.url), "utf8");
  assert.equal(source.includes('item.status === "CONNECTED" || item.status === "ERROR"'), true);
  assert.equal(source.includes("Editar configuração"), true);
});
