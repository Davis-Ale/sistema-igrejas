import assert from "node:assert/strict";
import test from "node:test";
import { sendRegistrationConfirmationEmail } from "../src/registration-confirmation-email.service.ts";

const input = {
  registrationId: "reg-1",
  recipientEmail: "participant@example.invalid",
  participantName: "Participante",
  checkInToken: "check-in-token",
  registrationStatus: "CONFIRMED",
  paymentStatus: "PAID",
  waitlistedAt: null,
  event: {
    title: "Evento",
    date: "2026-11-20T20:00:00.000Z",
    isPaid: true,
    slug: "evento",
    publicSlug: "evento-publico",
    churchSlug: "igreja"
  }
};

test("confirmation email fails closed without EVENTS_APP_BASE_URL and never uses localhost fallback", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/registration-confirmation-email.service.ts", import.meta.url), "utf8")
  );
  assert.equal(source.includes("http://localhost:3003"), false);
  assert.equal(source.includes("EVENTS_APP_BASE_URL ??"), false);

  const previousUrl = process.env.EVENTS_APP_BASE_URL;
  const previousKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "controlled-test-key";
  const log = { error: console.error };
  console.error = () => {};

  try {
    delete process.env.EVENTS_APP_BASE_URL;
    assert.equal(await sendRegistrationConfirmationEmail(input), false);

    process.env.EVENTS_APP_BASE_URL = "   ";
    assert.equal(await sendRegistrationConfirmationEmail(input), false);
  } finally {
    console.error = log.error;
    if (previousUrl === undefined) {
      delete process.env.EVENTS_APP_BASE_URL;
    } else {
      process.env.EVENTS_APP_BASE_URL = previousUrl;
    }
    if (previousKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = previousKey;
    }
  }
});
