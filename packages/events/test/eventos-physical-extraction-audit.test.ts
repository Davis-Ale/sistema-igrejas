import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("physical extraction audit records current couplings and forbids extracting now", () => {
  const audit = read("packages/events/docs/eventos-physical-extraction-audit.md");
  for (const heading of [
    "## Decisão deste corte",
    "## Dependências reais",
    "## Isolamento multi-tenant",
    "## Futura IA",
    "## Bloqueios reais para extração física agora",
    "## Veredito"
  ]) {
    assert.match(audit, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(audit, /Não separar/i);
  assert.match(audit, /Extraído neste corte\?\s*\|\s*Não/);
  assert.match(audit, /localhost.*5433/);
  assert.match(audit, /20261027180000_event_public_description_location/);
  assert.match(audit, /Não implementar OpenTelemetry\/Sentry/);
  assert.match(audit, /Não há dependência OpenAI/);

  const eventsApi = read("apps/events-api/src/app.ts");
  assert.match(eventsApi, /registerFinancialRoutes/);
  assert.match(eventsApi, /registerAsaasWebhookRoutes/);
  assert.doesNotMatch(eventsApi, /registerAssistantRoutes|registerMemberRoutes/);

  const apiBr = read("apps/api-br/src/app.ts");
  assert.match(apiBr, /registerEventRoutes/);
  assert.match(apiBr, /assistant/i);

  const eventsAdminApiDefault = read(
    "apps/events-admin/app/dashboard/eventos/events-dashboard-client.tsx"
  );
  assert.match(eventsAdminApiDefault, /localhost:3333/);

  const eventsPackage = read("packages/events/package.json");
  assert.doesNotMatch(eventsPackage, /@sistema-igrejas\/financial/);
  assert.doesNotMatch(eventsPackage, /openai|anthropic/i);

  const eventsSources = [
    "packages/events/src/event.service.ts",
    "packages/events/src/event.routes.ts",
    "packages/events/src/event-financial.routes.ts"
  ].map(read).join("\n");
  assert.doesNotMatch(eventsSources, /from "@sistema-igrejas\/financial"/);
  assert.match(eventsSources, /from "@sistema-igrejas\/database"/);
  assert.match(eventsSources, /from "@sistema-igrejas\/auth"/);

  const assistant = read("apps/api-br/src/assistant/assistant.service.ts");
  assert.match(assistant, /prisma\.event\.findMany/);
  assert.match(assistant, /canExecuteBusinessRules: false/);
  assert.doesNotMatch(assistant, /openai|anthropic|llm/i);
  assert.equal(existsSync(join(root, "packages/ai")), false);

  const schema = read("packages/database/prisma/schema.prisma");
  assert.match(schema, /model Event \{[\s\S]*churchId\s+String/);
  assert.match(schema, /model Registration \{[\s\S]*personId\s+String\?/);
  assert.match(schema, /model Transaction \{[\s\S]*eventId\s+String\?/);
});
