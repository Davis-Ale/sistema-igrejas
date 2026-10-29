import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("admin dashboard lists location as Onde and Publicado status", async () => {
  const source = await readFile(
    new URL(
      "../app/dashboard/eventos/events-dashboard-client.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.equal(source.includes("location: string | null"), true);
  assert.equal(source.includes("<span>Onde</span>"), true);
  assert.equal(source.includes('className="events-dashboard-col-label">Onde'), true);
  assert.equal(source.includes('item.location?.trim() || "—"'), true);
  assert.equal(source.includes('item.isPublic ? "Publicado" : "Rascunho"'), true);
  assert.equal(source.includes('item.isPublic ? "Público" : "Rascunho"'), false);
  assert.equal(source.includes("platformFeePercent"), false);
});

test("ticket list toggles existing isVisible without inventing fee fields", async () => {
  const source = await readFile(
    new URL(
      "../app/dashboard/eventos/[eventId]/event-workspace-client.tsx",
      import.meta.url
    ),
    "utf8"
  );

  assert.equal(source.includes("handleToggleTicketRowVisibility"), true);
  assert.equal(source.includes("togglingVisibilityKey"), true);
  assert.equal(source.includes("aria-pressed="), true);
  assert.equal(source.includes("isVisible: nextVisible"), true);
  assert.equal(source.includes('label: "Ingresso pago"'), true);
  assert.equal(source.includes('label: "Ingresso gratuito"'), true);
  assert.equal(source.includes("+ {action.label}"), true);
  assert.equal(source.includes("meia-entrada"), false);
  assert.equal(source.includes("minPerPurchase"), false);
  assert.equal(source.includes("audience"), false);
});
