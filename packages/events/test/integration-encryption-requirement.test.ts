import assert from "node:assert/strict";
import test from "node:test";
import {
  INTEGRATION_ENCRYPTION_MISSING_REQUIREMENT,
  withEncryptionRequirement,
  type EventIntegrationPublicItem
} from "../src/integration.service.ts";

const disconnected = (
  provider: EventIntegrationPublicItem["provider"]
): EventIntegrationPublicItem => ({
  provider,
  name: provider,
  category: provider === "MAILCHIMP" ? "Automação de marketing" : "Dados",
  description: "synthetic",
  status: "DISCONNECTED",
  connectable: true,
  blockedReason: null,
  missingRequirements: [],
  publicConfig: null,
  secretHint: null,
  connectedAt: null,
  lastError: null
});

test("Mailchimp and WhatsApp report the missing cipher key without exposing env", () => {
  const previous = process.env.EVENTS_INTEGRATIONS_ENCRYPTION_KEY;
  delete process.env.EVENTS_INTEGRATIONS_ENCRYPTION_KEY;
  try {
    const mailchimp = withEncryptionRequirement(disconnected("MAILCHIMP"));
    const whatsapp = withEncryptionRequirement(disconnected("WHATSAPP_BUSINESS_CLOUD"));
    const analytics = withEncryptionRequirement(disconnected("GOOGLE_ANALYTICS"));
    assert.deepEqual(mailchimp.missingRequirements, [INTEGRATION_ENCRYPTION_MISSING_REQUIREMENT]);
    assert.deepEqual(whatsapp.missingRequirements, [INTEGRATION_ENCRYPTION_MISSING_REQUIREMENT]);
    assert.deepEqual(analytics.missingRequirements, []);
    const serialized = JSON.stringify({ mailchimp, whatsapp, analytics });
    assert.equal(serialized.includes("EVENTS_INTEGRATIONS_ENCRYPTION_KEY"), false);
  } finally {
    if (previous === undefined) {
      delete process.env.EVENTS_INTEGRATIONS_ENCRYPTION_KEY;
    } else {
      process.env.EVENTS_INTEGRATIONS_ENCRYPTION_KEY = previous;
    }
  }
});

test("configured cipher key does not mark secret providers as missing", () => {
  const previous = process.env.EVENTS_INTEGRATIONS_ENCRYPTION_KEY;
  process.env.EVENTS_INTEGRATIONS_ENCRYPTION_KEY = "ab".repeat(32);
  try {
    assert.deepEqual(withEncryptionRequirement(disconnected("MAILCHIMP")).missingRequirements, []);
  } finally {
    if (previous === undefined) {
      delete process.env.EVENTS_INTEGRATIONS_ENCRYPTION_KEY;
    } else {
      process.env.EVENTS_INTEGRATIONS_ENCRYPTION_KEY = previous;
    }
  }
});
