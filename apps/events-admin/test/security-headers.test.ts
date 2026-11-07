import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

type HeadersModule = {
  contentSecurityPolicy: () => string;
  pageSecurityHeaders: () => Array<{ key: string; value: string }>;
};

test("events-admin pages send compatible security headers without breaking handoff or tracking", async () => {
  const { contentSecurityPolicy, pageSecurityHeaders } = await import(
    new URL("../security-headers.ts", import.meta.url).href
  ) as HeadersModule;
  const config = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  const tracking = await readFile(
    new URL("../app/eventos/_components/public-event-tracking.tsx", import.meta.url),
    "utf8"
  );
  const headers = pageSecurityHeaders();
  const csp = contentSecurityPolicy();
  const headerMap = Object.fromEntries(headers.map((header) => [header.key, header.value]));

  assert.match(config, /poweredByHeader:\s*false/);
  assert.match(config, /pageSecurityHeaders/);
  assert.equal(headers.some((header) => header.key === "X-Frame-Options"), false);
  assert.equal(headerMap["X-Content-Type-Options"], "nosniff");
  assert.equal(headerMap["Content-Security-Policy"], csp);

  assert.match(csp, /frame-ancestors 'self' http:\/\/localhost:3000/);
  assert.match(csp, /connect-src[^;]*http:\/\/localhost:3002/);
  assert.match(csp, /img-src[^;]*blob:/);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  assert.match(csp, /https:\/\/www\.googletagmanager\.com/);
  assert.match(csp, /https:\/\/connect\.facebook\.net/);
  assert.match(tracking, /https:\/\/www\.googletagmanager\.com\/gtag\/js/);
  assert.match(tracking, /https:\/\/connect\.facebook\.net\/en_US\/fbevents\.js/);
  assert.equal(csp.includes("upgrade-insecure-requests"), false);
  assert.equal(config.includes("Access-Control-Allow-Origin"), false);
  assert.equal(config.includes("localStorage"), false);
});
