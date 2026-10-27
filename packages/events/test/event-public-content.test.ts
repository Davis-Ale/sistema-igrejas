import assert from "node:assert/strict";
import test from "node:test";
import {
  presentPublicEventContent,
  publicEventCoverWhere
} from "../src/event-public-content.ts";
import { updateEventSchema } from "../src/event.schema.ts";

test("public event content keeps description and location without sending cover bytes", () => {
  const presented = presentPublicEventContent({
    id: "event-a",
    title: "Conferência",
    description: "Encontro da igreja",
    location: "Templo central",
    coverImage: { eventId: "event-a" }
  });

  assert.equal(presented.hasCoverImage, true);
  assert.equal("coverImage" in presented, false);
  assert.equal(presented.description, "Encontro da igreja");
  assert.equal(presented.location, "Templo central");
  assert.deepEqual(publicEventCoverWhere("event-a"), {
    eventId: "event-a",
    event: {
      id: "event-a",
      isPublic: true,
      deletedAt: null
    }
  });
});

test("event update accepts nullable description and location without inventing fee fields", () => {
  const parsed = updateEventSchema.parse({
    description: "  Encontro  ",
    location: "  Rua da Igreja, 100  "
  });

  assert.equal(parsed.description, "Encontro");
  assert.equal(parsed.location, "Rua da Igreja, 100");
  assert.equal("platformFeePercent" in parsed, false);
  assert.equal(
    updateEventSchema.safeParse({
      description: "x".repeat(2001)
    }).success,
    false
  );
});
