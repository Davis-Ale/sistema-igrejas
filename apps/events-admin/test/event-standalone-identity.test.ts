import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("events-admin entry and dashboard copy use standalone identity without church-suite leftovers", async () => {
  const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const login = await readFile(
    new URL("../app/login/login-form.tsx", import.meta.url),
    "utf8"
  );
  const layout = await readFile(
    new URL("../app/layout.tsx", import.meta.url),
    "utf8"
  );
  const createModal = await readFile(
    new URL(
      "../app/dashboard/eventos/create-event-modal.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const dashboard = await readFile(
    new URL(
      "../app/dashboard/eventos/events-dashboard-client.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const chrome = await readFile(
    new URL(
      "../app/dashboard/eventos/event-module-chrome.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.equal(home.includes("ADR Solutions"), true);
  assert.equal(home.includes("Plataforma de Eventos."), true);
  assert.equal(home.includes("Entrar"), true);
  assert.equal(home.includes("Gestão da igreja"), false);
  assert.equal(home.includes("Acessar sistema"), false);

  assert.equal(layout.includes("ADR Solutions"), true);
  assert.equal(layout.includes("Plataforma de Eventos"), true);

  assert.equal(login.includes("ADR Solutions"), true);
  assert.equal(login.includes("Entrar"), true);
  assert.equal(login.includes("entrar no sistema"), false);
  assert.equal(login.includes('router.replace("/dashboard/eventos")'), true);

  assert.equal(createModal.includes("Módulo Eventos"), false);
  assert.equal(dashboard.includes("desta igreja"), false);

  assert.equal(chrome.includes('href="/dashboard/eventos"'), true);
  assert.equal(chrome.includes("Meus eventos"), true);
  assert.equal(chrome.includes("Voltar ao painel"), true);
});
