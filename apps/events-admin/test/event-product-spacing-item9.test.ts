import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Gestão Financeira, Integrações and API Keys follow dashboard spacing without unpacking chrome", async () => {
  const financial = await readFile(
    new URL(
      "../app/dashboard/eventos/gestao-financeira/event-financial-management-client.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const apiKeys = await readFile(
    new URL(
      "../app/dashboard/eventos/api-keys/event-api-keys-client.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const integrations = await readFile(
    new URL(
      "../app/dashboard/eventos/integracoes/event-integrations-client.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const settings = await readFile(
    new URL("../app/dashboard/eventos/event-settings.module.css", import.meta.url),
    "utf8"
  );
  const chrome = await readFile(
    new URL(
      "../app/dashboard/eventos/event-module-chrome.module.css",
      import.meta.url
    ),
    "utf8"
  );
  const configuracoes = await readFile(
    new URL(
      "../app/dashboard/eventos/configuracoes/event-general-settings-client.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.equal(financial.includes("EventModuleChrome"), true);
  assert.equal(financial.includes("EventModuleBackLink"), false);
  assert.equal(financial.includes("event-financial-layout"), false);
  assert.equal(financial.includes("event-financial-panels"), true);
  assert.equal(financial.includes('width: "100%"'), true);
  assert.equal(financial.includes('maxWidth: "1180px"'), false);

  assert.equal(apiKeys.includes("settings.productFill"), true);
  assert.equal(apiKeys.includes('maxWidth: "1180px"'), false);
  assert.equal(apiKeys.includes("EventModuleChrome"), true);

  assert.equal(integrations.includes("settings.productFill"), true);
  assert.equal(integrations.includes('maxWidth: "1180px"'), false);
  assert.equal(integrations.includes("EventModuleChrome"), true);

  assert.equal(settings.includes(".productFill"), true);
  assert.equal(configuracoes.includes("productFill"), false);
  assert.equal(chrome.includes("grid-template-columns: 70px"), true);
});
