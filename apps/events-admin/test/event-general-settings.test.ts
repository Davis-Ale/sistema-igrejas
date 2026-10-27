import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("general settings hub reads existing church data and keeps writes on current screens", async () => {
  const chrome = await readFile(
    new URL("../app/dashboard/eventos/event-module-chrome.tsx", import.meta.url),
    "utf8"
  );
  const source = await readFile(
    new URL(
      "../app/dashboard/eventos/configuracoes/event-general-settings-client.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.equal(chrome.includes('href="/dashboard/eventos/configuracoes"'), true);
  assert.equal(chrome.includes('label="Configurações gerais"'), true);
  assert.equal(source.includes("/api/events/financial/receiving-account"), true);
  assert.equal(source.includes("/api/events/api-keys"), true);
  assert.equal(source.includes("/api/events/integrations"), true);
  assert.equal(source.includes('href="/dashboard/eventos/gestao-financeira"'), true);
  assert.equal(source.includes('href="/dashboard/eventos/api-keys"'), true);
  assert.equal(source.includes('href="/dashboard/eventos/integracoes"'), true);
  assert.equal(source.includes("method: \"PUT\""), false);
  assert.equal(source.includes("platformFeePercent"), false);
  assert.equal(source.includes("canManageChurchSettings"), true);
});
