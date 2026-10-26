import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { CHECKOUT_PUBLIC_PATHS } from "../src/checkout-security.prepared.ts";
import { registerExclusiveCheckoutV2 } from "../src/checkout-v2.cutover.prepared.ts";
import { prepareCheckoutV2Routes } from "../src/checkout-v2.routes.ts";
import { registerPublicEventRoutes } from "../src/public.routes.ts";

globalThis.fetch = async () => { throw new Error("EXTERNAL_NETWORK_FORBIDDEN"); };
const prisma = {} as PrismaClient;
const provider = {
  async read() { throw new Error("PROVIDER_FORBIDDEN"); },
  async pix() { throw new Error("PROVIDER_FORBIDDEN"); }
};
const routes = prepareCheckoutV2Routes(prisma, provider);

test("both prepared APIs keep the same exclusive v2 registrar", async () => {
  for (const server of ["api-br", "events-api"]) {
    const staged = await readFile(new URL(`../../../apps/${server}/src/checkout-v2.prepared.ts`, import.meta.url), "utf8");
    assert.equal(staged.includes("prepareCheckoutV2Routes(prisma"), true);
    assert.equal(staged.includes("createAsaasChargeForExistingTransaction"), false);
    assert.equal(staged.includes("deleteAsaasPayment"), false);
  }
  for (const url of CHECKOUT_PUBLIC_PATHS) {
    assert.equal(routes.some((route) => route.method === "POST" && route.url === url), true);
  }
});

test("exclusive cutover rejects incomplete bundles and coexistence with legacy aliases", async () => {
  const incomplete = Fastify();
  await assert.rejects(registerExclusiveCheckoutV2(incomplete, prisma, routes.slice(0, 2)), /CHECKOUT_V2_CUTOVER_INCOMPLETE/);
  await incomplete.close();
  const legacy = Fastify();
  await registerPublicEventRoutes(legacy, prisma);
  await assert.rejects(registerExclusiveCheckoutV2(legacy, prisma, routes), /EXCLUSIVE_REPLACEMENT/);
  await legacy.close();
});

test("exclusive cutover omits legacy handlers, installs v2 posts and keeps public reads", async () => {
  const app = Fastify();
  await registerExclusiveCheckoutV2(app, prisma, routes);
  try {
    for (const url of CHECKOUT_PUBLIC_PATHS) assert.equal(app.hasRoute({ method: "POST", url }), true);
    for (const url of ["/public/event-pages/:publicSlug", "/public/events/:eventId", "/public/churches/:churchSlug/events/:eventSlug"]) {
      assert.equal(app.hasRoute({ method: "GET", url }), true);
    }
    const denied = await app.inject({
      method: "POST",
      url: "/public/events/event-a/register",
      payload: { email: "synthetic@example.invalid" }
    });
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.json().error, "CHECKOUT_ACCESS_DENIED");
    assert.equal(denied.headers["cache-control"], "no-store");
  } finally {
    await app.close();
  }
});

test("builders, public page and preview remain inactive and in the same pre-cutover state", async () => {
  for (const server of ["api-br", "events-api"]) {
    const app = await readFile(new URL(`../../../apps/${server}/src/app.ts`, import.meta.url), "utf8");
    const serverSource = await readFile(new URL(`../../../apps/${server}/src/server.ts`, import.meta.url), "utf8");
    for (const source of [app, serverSource]) {
      for (const marker of [
        "checkout-v2.cutover.prepared",
        "registerExclusiveCheckoutV2",
        "checkout-v2.prepared",
        "registerClosedPublicCheckout",
        "CHECKOUT_V2_ENABLED"
      ]) assert.equal(source.includes(marker), false);
    }
    assert.equal((app.match(/await registerPublicEventRoutes\(/g) ?? []).length, 1);
  }
  const page = await readFile(new URL("../../../apps/events-admin/app/eventos/[eventId]/page.tsx", import.meta.url), "utf8");
  const preview = await readFile(
    new URL("../../../apps/events-admin/app/dashboard/eventos/[eventId]/preview/event-preview-client.tsx", import.meta.url),
    "utf8"
  );
  const wrapper = await readFile(
    new URL("../../../apps/events-admin/app/eventos/_components/public-event-v2.prepared.tsx", import.meta.url),
    "utf8"
  );
  const entry = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.equal(page.includes("PreparedPublicEventV2"), false);
  assert.equal(preview.includes("PreparedPublicEventV2"), false);
  assert.equal(preview.includes("prepareCheckoutV2"), false);
  assert.equal(wrapper.includes("PreparedPublicEventV2"), true);
  assert.equal(entry.includes("checkout-v2.cutover.prepared"), false);
});
