import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

type HeadersModule = {
  contentSecurityPolicy: () => string;
  pageSecurityHeaders: () => Array<{ key: string; value: string }>;
};

test("participant pages send compatible security headers without changing map-image CSP", async () => {
  const { contentSecurityPolicy, pageSecurityHeaders } = await import(
    new URL("../security-headers.ts", import.meta.url).href
  ) as HeadersModule;
  const config = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  const mapImage = await readFile(
    new URL("../app/api/events/[publicSlug]/map-image/route.ts", import.meta.url),
    "utf8"
  );
  const headers = pageSecurityHeaders();
  const csp = contentSecurityPolicy();
  const headerMap = Object.fromEntries(headers.map((header) => [header.key, header.value]));

  assert.match(config, /poweredByHeader:\s*false/);
  assert.match(config, /pageSecurityHeaders/);
  assert.equal(headerMap["X-Content-Type-Options"], "nosniff");
  assert.equal(headerMap["X-Frame-Options"], "DENY");
  assert.equal(headerMap["Content-Security-Policy"], csp);

  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /frame-src 'none'/);
  assert.match(csp, /worker-src 'self' blob:/);
  assert.match(csp, /manifest-src 'self'/);
  assert.match(csp, /img-src 'self' data: blob:/);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  assert.match(csp, /connect-src 'self' http:\/\/localhost:3002/);
  assert.equal(csp.includes("upgrade-insecure-requests"), false);
  assert.match(mapImage, /Content-Security-Policy": "default-src 'none'; sandbox"/);
  assert.equal(config.includes("Access-Control-Allow-Origin"), false);
  assert.equal(config.includes("localStorage"), false);
});
