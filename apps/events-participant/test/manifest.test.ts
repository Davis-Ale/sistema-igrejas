import assert from "node:assert/strict";
import test from "node:test";
import {
  GET
} from "../app/[publicSlug]/manifest.webmanifest/route.js";

test("builds an event-scoped manifest without credential data", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    Response.json({
      title: "Conferência 2026"
    });

  try {
    const response = await GET(
      new Request(
        "http://localhost:3003/conferencia2026/manifest.webmanifest"
      ),
      {
        params: Promise.resolve({
          publicSlug: "conferencia2026"
        })
      }
    );
    const manifest = await response.json() as Record<string, unknown>;
    const serialized = JSON.stringify(manifest);

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("Content-Type"),
      "application/manifest+json; charset=utf-8"
    );
    assert.equal(manifest.name, "Conferência 2026");
    assert.equal(manifest.id, "/conferencia2026");
    assert.equal(
      manifest.start_url,
      "/conferencia2026#aplicativo"
    );
    assert.equal(manifest.scope, "/conferencia2026");
    assert.doesNotMatch(
      serialized,
      /checkInToken|token|registration|participant/i
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects an unsafe public slug before fetching", async () => {
  const originalFetch = globalThis.fetch;
  let fetched = false;

  globalThis.fetch = async () => {
    fetched = true;
    return Response.json({});
  };

  try {
    const response = await GET(
      new Request("http://localhost:3003/invalid/manifest.webmanifest"),
      {
        params: Promise.resolve({
          publicSlug: "../invalid"
        })
      }
    );

    assert.equal(response.status, 404);
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
