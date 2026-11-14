import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { buildListWhereSql } from "../src/registration-list.service.ts";

function sqlText(query: Prisma.Sql) {
  const statement = query as Prisma.Sql & { strings?: string[]; values?: unknown[] };
  return {
    text: (statement.strings ?? []).join("?"),
    values: statement.values ?? []
  };
}

test("check-in search matches email as well as phone and token inside the church", () => {
  const where = buildListWhereSql("church-a", "event-a", { search: "Ada@Igreja.Test" });
  const statement = sqlText(where);
  assert.match(statement.text, /p\.email/);
  assert.match(statement.text, /v\.email/);
  assert.match(statement.text, /r\."checkoutEmail"/);
  assert.match(statement.text, /p\.phone/);
  assert.match(statement.text, /v\.phone/);
  assert.match(statement.text, /r\."checkInToken"/);
  assert.match(statement.text, /r\."paymentStatus" IN \('PAID', 'NOT_REQUIRED'\)/);
  assert.deepEqual(statement.values.slice(0, 2), ["church-a", "event-a"]);
  assert.equal(statement.values.includes("ada@igreja.test"), true);
  assert.equal(statement.values.includes("church-b"), false);
});

test("confirmation email stays on the durable sender and check-in stays in the tenant", () => {
  const service = readFileSync(new URL("../src/event.service.ts", import.meta.url), "utf8");
  const routes = readFileSync(new URL("../src/event.routes.ts", import.meta.url), "utf8");
  const sender = readFileSync(new URL("../src/registration-confirmation-email.service.ts", import.meta.url), "utf8");
  assert.match(service, /await sendPendingRegistrationConfirmationEmail\(prisma, churchId, input\)/);
  assert.match(sender, /if \(!apiKey\)/);
  assert.match(sender, /return false/);
  assert.match(routes, /"\/events\/registrations\/check-in-token"/);
  assert.match(routes, /requireRole\(\["SUPER_ADMIN", "PASTOR"\]\)/);
  assert.match(service, /checkInToken: input\.checkInToken,\s*churchId,\s*eventId: input\.eventId/s);
});
