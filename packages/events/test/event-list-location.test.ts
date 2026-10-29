import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("event list select exposes existing location for Meus eventos", async () => {
  const source = await readFile(
    new URL("../src/event.service.ts", import.meta.url),
    "utf8"
  );

  const start = source.indexOf("const eventListSelect = {");
  const end = source.indexOf("export async function listEvents");
  const listSelect = source.slice(start, end);

  assert.equal(start >= 0, true);
  assert.equal(end > start, true);
  assert.equal(listSelect.includes("location: true"), true);
  assert.equal(listSelect.includes("platformFeePercent"), false);
});
