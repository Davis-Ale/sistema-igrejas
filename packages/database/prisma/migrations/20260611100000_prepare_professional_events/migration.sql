-- Prepare events for public registration, paid events, payment status, waitlist and QR/token check-in.

ALTER TABLE "Event"
  ADD COLUMN "isPaid" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publicRegistrationEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "waitlistEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Event_churchId_isPaid_idx"
  ON "Event"("churchId", "isPaid");

CREATE INDEX "Event_churchId_publicRegistrationEnabled_idx"
  ON "Event"("churchId", "publicRegistrationEnabled");

ALTER TABLE "Registration"
  ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "checkInToken" TEXT,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "waitlistedAt" TIMESTAMP(3),
  ADD COLUMN "registrationSource" TEXT NOT NULL DEFAULT 'ADMIN';

UPDATE "Registration"
SET "checkInToken" = "id"
WHERE "checkInToken" IS NULL;

ALTER TABLE "Registration"
  ALTER COLUMN "checkInToken" SET NOT NULL;

CREATE UNIQUE INDEX "Registration_checkInToken_key"
  ON "Registration"("checkInToken");

CREATE INDEX "Registration_churchId_paymentStatus_idx"
  ON "Registration"("churchId", "paymentStatus");

CREATE INDEX "Registration_churchId_checkInToken_idx"
  ON "Registration"("churchId", "checkInToken");

CREATE INDEX "Registration_churchId_registrationSource_idx"
  ON "Registration"("churchId", "registrationSource");
