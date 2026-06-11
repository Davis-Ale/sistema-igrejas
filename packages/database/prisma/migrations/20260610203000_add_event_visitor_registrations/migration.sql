-- Allow event registrations for members or visitors.

ALTER TABLE "Registration"
  ALTER COLUMN "personId" DROP NOT NULL;

ALTER TABLE "Registration"
  ADD COLUMN "visitorId" TEXT;

CREATE INDEX "Registration_churchId_visitorId_idx"
  ON "Registration"("churchId", "visitorId");

CREATE UNIQUE INDEX "Registration_eventId_visitorId_key"
  ON "Registration"("eventId", "visitorId");

ALTER TABLE "Registration"
  ADD CONSTRAINT "Registration_visitorId_fkey"
  FOREIGN KEY ("visitorId")
  REFERENCES "Visitor"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "Registration"
  ADD CONSTRAINT "Registration_participant_required_check"
  CHECK (
    ("personId" IS NOT NULL AND "visitorId" IS NULL)
    OR
    ("personId" IS NULL AND "visitorId" IS NOT NULL)
  );
