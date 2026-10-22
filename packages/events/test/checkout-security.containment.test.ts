import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { waitCheckoutPendingDrain } from "../src/checkout-security.containment.ts";

test("drain waits until pendingRequests is idle and times out instead of reopening", async () => {
  let pending = 1;
  const draining = waitCheckoutPendingDrain(() => pending, 200);
  pending = 0;
  await draining;
  await assert.rejects(waitCheckoutPendingDrain(() => 1, 30), /CHECKOUT_SECURITY_DRAIN_TIMEOUT/);
  await assert.rejects(waitCheckoutPendingDrain(() => 1, 0), /CHECKOUT_SECURITY_CONFIGURATION_INVALID/);
});

test("containment uses the shared Redis gate already installed on both builders, without ingress infrastructure", async () => {
  const compose = await readFile(new URL("../../../docker-compose.yml", import.meta.url), "utf8");
  for (const marker of ["nginx", "caddy", "traefik", "ingress", "kafka", "rabbitmq"]) assert.equal(compose.toLowerCase().includes(marker), false);
  const overlay = await readFile(new URL("../../../docker-compose.checkout-redis.yml", import.meta.url), "utf8");
  assert.equal(overlay.includes("checkout-redis"), true);
  assert.equal(overlay.includes("55439"), true);
  const entry = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  assert.equal(entry.includes("checkout-security.containment"), false);
  for (const server of ["api-br", "events-api"]) {
    const app = await readFile(new URL(`../../../apps/${server}/src/app.ts`, import.meta.url), "utf8");
    assert.equal(app.includes("checkout-security.operational"), true);
    assert.equal(app.includes("waitCheckoutPendingDrain"), true);
    assert.equal(app.includes("registerClosedPublicCheckout"), false);
    const serverSource = await readFile(new URL(`../../../apps/${server}/src/server.ts`, import.meta.url), "utf8");
    assert.equal(serverSource.includes("nginx"), false);
    assert.equal(serverSource.includes("ingress"), false);
  }
});
