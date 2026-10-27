import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("public event page and information form surface cover, description and location", async () => {
  const view = await readFile(
    new URL("../app/eventos/_components/public-event-view.tsx", import.meta.url),
    "utf8"
  );
  const workspace = await readFile(
    new URL(
      "../app/dashboard/eventos/[eventId]/event-workspace-client.tsx",
      import.meta.url
    ),
    "utf8"
  );
  const cover = await readFile(
    new URL(
      "../app/dashboard/eventos/[eventId]/event-cover-editor.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.equal(view.includes("/public/events/${event.id}/cover"), true);
  assert.equal(view.includes("event.description"), true);
  assert.equal(view.includes("event.location"), true);
  assert.equal(view.includes("hasCoverImage"), true);
  assert.equal(workspace.includes('name="description"'), true);
  assert.equal(workspace.includes('name="location"'), true);
  assert.equal(cover.includes("página pública"), true);
  assert.equal(view.includes("TEXT"), true);
  assert.equal(view.includes("platformFeePercent"), false);
});
