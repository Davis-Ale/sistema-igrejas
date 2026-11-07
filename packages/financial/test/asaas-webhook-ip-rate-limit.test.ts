import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { registerAsaasWebhookRoutes } from "../src/asaas.routes.ts";
import { ASAAS_WEBHOOK_IP_RATE_LIMIT } from "../../auth/src/ip-rate-limit.ts";

test("asaas webhook uses IP rate limit preHandler", async () => {
  const source = await readFile(
    new URL("../src/asaas.routes.ts", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /app\.post\(\s*"\/webhooks\/asaas",\s*\{\s*preHandler: createFixedWindowIpRateLimit\(ASAAS_WEBHOOK_IP_RATE_LIMIT\)/
  );
});

test("asaas webhook returns 429 after the IP window is exhausted", async () => {
  const previous = process.env.ASAAS_WEBHOOK_TOKEN;
  process.env.ASAAS_WEBHOOK_TOKEN = "controlled-webhook-token";
  const handled: number[] = [];
  const app = Fastify();
  await registerAsaasWebhookRoutes(
    app,
    {} as PrismaClient,
    async () => {
      handled.push(1);
    }
  );
  await app.ready();

  try {
    const allowed = ASAAS_WEBHOOK_IP_RATE_LIMIT.limit;
    const payload = {
      event: "PAYMENT_CONFIRMED",
      payment: {
        id: "pay-1",
        status: "CONFIRMED",
        externalReference: "church-a:ref-1:asaas"
      }
    };

    for (let index = 0; index < allowed; index += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/asaas",
        headers: { "asaas-access-token": "controlled-webhook-token" },
        payload
      });
      assert.equal(response.statusCode, 200);
    }

    const limited = await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: { "asaas-access-token": "controlled-webhook-token" },
      payload
    });
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().error, "RATE_LIMITED");
    assert.equal(handled.length, allowed);
  } finally {
    if (previous === undefined) {
      delete process.env.ASAAS_WEBHOOK_TOKEN;
    } else {
      process.env.ASAAS_WEBHOOK_TOKEN = previous;
    }
    await app.close();
  }
});
