import assert from "node:assert/strict";
import test from "node:test";
import {
  createEventAppSessionSchema,
  updateEventAppMapSchema
} from "../src/participant-app.schema.ts";
import {
  isParticipantAppEligible
} from "../src/participant-app.service.ts";

test("participant app eligibility blocks pending, cancelled and waitlisted registrations", () => {
  assert.equal(
    isParticipantAppEligible({
      status: "CONFIRMED",
      paymentStatus: "PENDING",
      waitlistedAt: null
    }),
    false
  );
  assert.equal(
    isParticipantAppEligible({
      status: "CANCELLED",
      paymentStatus: "PAID",
      waitlistedAt: null
    }),
    false
  );
  assert.equal(
    isParticipantAppEligible({
      status: "CONFIRMED",
      paymentStatus: "PAID",
      waitlistedAt: new Date()
    }),
    false
  );
});

test("participant app eligibility accepts only confirmed access states", () => {
  assert.equal(
    isParticipantAppEligible({
      status: "CONFIRMED",
      paymentStatus: "PAID",
      waitlistedAt: null
    }),
    true
  );
  assert.equal(
    isParticipantAppEligible({
      status: "CHECKED_IN",
      paymentStatus: "NOT_REQUIRED",
      waitlistedAt: null
    }),
    true
  );
});

test("session contract rejects invalid times and deduplicates registrations", () => {
  const invalid = createEventAppSessionSchema.safeParse({
    title: "Sessão",
    startsAt: "2026-09-16T12:00:00.000Z",
    endsAt: "2026-09-16T11:00:00.000Z",
    isPublished: true,
    registrationIds: []
  });

  assert.equal(invalid.success, false);

  const valid = createEventAppSessionSchema.parse({
    title: "Sessão",
    startsAt: "2026-09-16T11:00:00.000Z",
    endsAt: "2026-09-16T12:00:00.000Z",
    isPublished: true,
    registrationIds: ["registration-1", "registration-1"]
  });

  assert.deepEqual(valid.registrationIds, ["registration-1"]);
});

test("map contract accepts only HTTPS image URLs", () => {
  assert.equal(
    updateEventAppMapSchema.safeParse({
      imageUrl: "http://example.com/mapa.png",
      points: []
    }).success,
    false
  );
  assert.equal(
    updateEventAppMapSchema.safeParse({
      imageUrl: "https://example.com/mapa.png",
      points: [
        {
          name: "Auditório",
          location: "Bloco principal",
          sortOrder: 0,
          isVisible: true
        }
      ]
    }).success,
    true
  );
});
