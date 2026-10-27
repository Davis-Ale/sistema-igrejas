import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("API Keys create and revoke stay pastor-only without changing reserved spacing", async () => {
  const source = await readFile(
    new URL("../app/dashboard/eventos/api-keys/event-api-keys-client.tsx", import.meta.url),
    "utf8"
  );
  assert.equal(source.includes("canManageApiKeys"), true);
  assert.equal(source.includes('{canManage ? ('), true);
  assert.equal(source.includes("{!isRevoked && canManage ? ("), true);
  assert.equal(source.includes("Criar chave"), true);
});
