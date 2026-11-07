import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

type HeadersModule = {
  contentSecurityPolicy: () => string;
  pageSecurityHeaders: () => Array<{ key: string; value: string }>;
};

test("web-br pages send compatible security headers and CSP", async () => {
  const { contentSecurityPolicy, pageSecurityHeaders } = await import(
    new URL("../security-headers.ts", import.meta.url).href
  ) as HeadersModule;
  const config = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  const headers = pageSecurityHeaders();
  const csp = contentSecurityPolicy();
  const headerMap = Object.fromEntries(headers.map((header) => [header.key, header.value]));

  assert.match(config, /poweredByHeader:\s*false/);
  assert.match(config, /pageSecurityHeaders/);
  assert.match(config, /source:\s*"\/\(\.\*\)"/);

  assert.equal(headerMap["X-Content-Type-Options"], "nosniff");
  assert.equal(headerMap["X-Frame-Options"], "DENY");
  assert.equal(headerMap["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.equal(headerMap["Content-Security-Policy"], csp);

  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  assert.match(csp, /script-src 'self' 'unsafe-inline'/);
  assert.match(csp, /connect-src 'self' http:\/\/localhost:3333 http:\/\/127\.0\.0\.1:3333/);
  assert.match(csp, /frame-src http:\/\/localhost:3001/);
  assert.match(csp, /img-src 'self' data: blob:/);
  assert.equal(csp.includes("upgrade-insecure-requests"), false);
  assert.equal(csp.includes("googletagmanager"), false);
  assert.equal(config.includes("Access-Control-Allow-Origin"), false);
  assert.equal(config.includes("localStorage"), false);
});
