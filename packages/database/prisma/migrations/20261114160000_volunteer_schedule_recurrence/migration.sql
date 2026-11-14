ALTER TYPE "VolunteerAssignmentStatus" ADD VALUE 'REPLACED';

CREATE TYPE "VolunteerScheduleFrequency" AS ENUM ('WEEKLY');

CREATE TABLE "VolunteerScheduleSeries" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "ministryId" TEXT NOT NULL,
    "frequency" "VolunteerScheduleFrequency" NOT NULL,
    "anchorDate" DATE NOT NULL,
    "occurrenceCount" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VolunteerScheduleSeries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "VolunteerSchedule" ADD COLUMN "seriesId" TEXT;

CREATE TABLE "VolunteerSubstitution" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "fromPersonId" TEXT NOT NULL,
    "toPersonId" TEXT NOT NULL,
    "actorPersonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VolunteerSubstitution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VolunteerScheduleSeries_churchId_id_key" ON "VolunteerScheduleSeries"("churchId", "id");
CREATE INDEX "VolunteerScheduleSeries_churchId_ministryId_idx" ON "VolunteerScheduleSeries"("churchId", "ministryId");
CREATE INDEX "VolunteerSchedule_churchId_seriesId_idx" ON "VolunteerSchedule"("churchId", "seriesId");
CREATE UNIQUE INDEX "VolunteerSubstitution_churchId_id_key" ON "VolunteerSubstitution"("churchId", "id");
CREATE INDEX "VolunteerSubstitution_churchId_slotId_createdAt_idx" ON "VolunteerSubstitution"("churchId", "slotId", "createdAt");

ALTER TABLE "VolunteerScheduleSeries" ADD CONSTRAINT "VolunteerScheduleSeries_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VolunteerScheduleSeries" ADD CONSTRAINT "VolunteerScheduleSeries_churchId_ministryId_fkey" FOREIGN KEY ("churchId", "ministryId") REFERENCES "Ministry"("churchId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "VolunteerSchedule" ADD CONSTRAINT "VolunteerSchedule_churchId_seriesId_fkey" FOREIGN KEY ("churchId", "seriesId") REFERENCES "VolunteerScheduleSeries"("churchId", "id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE "VolunteerSubstitution" ADD CONSTRAINT "VolunteerSubstitution_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VolunteerSubstitution" ADD CONSTRAINT "VolunteerSubstitution_churchId_slotId_fkey" FOREIGN KEY ("churchId", "slotId") REFERENCES "VolunteerScheduleSlot"("churchId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "VolunteerSubstitution" ADD CONSTRAINT "VolunteerSubstitution_churchId_fromPersonId_fkey" FOREIGN KEY ("churchId", "fromPersonId") REFERENCES "Person"("churchId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "VolunteerSubstitution" ADD CONSTRAINT "VolunteerSubstitution_churchId_toPersonId_fkey" FOREIGN KEY ("churchId", "toPersonId") REFERENCES "Person"("churchId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "VolunteerSubstitution" ADD CONSTRAINT "VolunteerSubstitution_churchId_actorPersonId_fkey" FOREIGN KEY ("churchId", "actorPersonId") REFERENCES "Person"("churchId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
