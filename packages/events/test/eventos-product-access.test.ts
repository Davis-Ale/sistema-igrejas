import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  EVENTS_ACCESS_MODES,
  EVENTS_PRODUCT_ACCESS
} from "../src/product-access.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

test("single Eventos implementation exposes church-suite handoff and SaaS login", () => {
  assert.deepEqual(EVENTS_ACCESS_MODES, ["CHURCH_SUITE", "EVENTS_SAAS"]);
  assert.equal(EVENTS_PRODUCT_ACCESS.implementation, "single");
  assert.equal(EVENTS_PRODUCT_ACCESS.app, "apps/events-admin");
  assert.equal(EVENTS_PRODUCT_ACCESS.api, "apps/events-api");
  assert.equal(EVENTS_PRODUCT_ACCESS.apiDefaultUrl, "http://localhost:3002");
  assert.ok(EVENTS_PRODUCT_ACCESS.forbidden.includes("duplicate-events-in-web-br"));
  assert.ok(EVENTS_PRODUCT_ACCESS.forbidden.includes("drop-church-suite-handoff"));
  assert.ok(EVENTS_PRODUCT_ACCESS.forbidden.includes("require-church-dashboard-for-events-saas"));

  const churchHandoff = read("apps/web-br/app/dashboard/eventos/[[...path]]/page.tsx");
  assert.match(churchHandoff, /NEXT_PUBLIC_EVENTS_APP_URL/);
  assert.match(churchHandoff, /\/auth\/handoff/);
  assert.match(churchHandoff, /\/dashboard\/eventos/);
  assert.match(churchHandoff, /events-auth-session/);
  assert.doesNotMatch(churchHandoff, /@sistema-igrejas\/events/);

  const eventsHandoff = read("apps/events-admin/app/auth/handoff/page.tsx");
  assert.match(eventsHandoff, /NEXT_PUBLIC_CHURCH_APP_URL/);
  assert.match(eventsHandoff, /events-auth-ready/);
  assert.match(eventsHandoff, /events-auth-complete/);

  const saasLogin = read("apps/events-admin/app/login/login-form.tsx");
  assert.match(saasLogin, /\/auth\/login/);
  assert.match(saasLogin, /router\.replace\("\/dashboard\/eventos"\)/);
  assert.match(saasLogin, /localhost:3002/);
  assert.doesNotMatch(saasLogin, /localhost:3333/);

  const churchLogin = read("apps/web-br/app/login/login-form.tsx");
  assert.match(churchLogin, /localhost:3333/);

  const dashboardRoot = read("apps/events-admin/app/dashboard/page.tsx");
  assert.match(dashboardRoot, /redirect\("\/dashboard\/eventos"\)/);

  const rootDev = JSON.parse(read("package.json")).scripts.dev as string;
  assert.match(rootDev, /--filter api-br/);
  assert.match(rootDev, /--filter web-br/);
  assert.match(rootDev, /--filter @sistema-igrejas\/events-api/);
  assert.match(rootDev, /--filter @sistema-igrejas\/events-admin/);
  assert.match(rootDev, /--filter @sistema-igrejas\/events-participant/);
  assert.match(rootDev, /--filter events-organizer/);

  const webBrEventsImport = read("apps/web-br/app/dashboard/eventos/[[...path]]/page.tsx");
  assert.doesNotMatch(webBrEventsImport, /registerEventRoutes|EventModuleChrome/);

  const workspace = read(
    "apps/events-admin/app/dashboard/eventos/[eventId]/event-workspace-client.tsx"
  );
  assert.match(workspace, /\/api\/events\/financial\/summary/);
  assert.match(workspace, /\/api\/events\/financial\/transactions/);
  assert.doesNotMatch(workspace, /\/api\/financial\/summary/);
});

test("events-admin chrome wordmark is ADR Solutions and dual-access contracts stay", () => {
  const chromeFiles = [
    "apps/events-admin/app/layout.tsx",
    "apps/events-admin/app/page.tsx",
    "apps/events-admin/app/login/login-form.tsx",
    "apps/events-admin/app/dashboard/dashboard-shell.tsx"
  ];

  for (const relativePath of chromeFiles) {
    const source = read(relativePath);
    assert.match(source, /ADR Solutions/);
    assert.doesNotMatch(source, /Sistema Igrejas/);
  }

  const layout = read("apps/events-admin/app/layout.tsx");
  assert.match(layout, /Plataforma de Eventos/);

  const saasLogin = read("apps/events-admin/app/login/login-form.tsx");
  assert.match(saasLogin, /\/auth\/login/);
  assert.match(saasLogin, /router\.replace\("\/dashboard\/eventos"\)/);
  assert.match(saasLogin, /localhost:3002/);
  assert.match(saasLogin, /sistema-igrejas\.session/);
});
