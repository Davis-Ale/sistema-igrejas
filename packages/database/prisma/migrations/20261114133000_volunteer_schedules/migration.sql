CREATE TYPE "VolunteerAssignmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED');

CREATE TABLE "VolunteerSchedule" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "ministryId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VolunteerSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VolunteerScheduleSlot" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VolunteerScheduleSlot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VolunteerAssignment" (
    "churchId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" "VolunteerAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VolunteerAssignment_pkey" PRIMARY KEY ("churchId", "slotId", "personId")
);

CREATE TABLE "VolunteerUnavailability" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VolunteerUnavailability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VolunteerSchedule_churchId_id_key" ON "VolunteerSchedule"("churchId", "id");
CREATE INDEX "VolunteerSchedule_churchId_ministryId_serviceDate_idx" ON "VolunteerSchedule"("churchId", "ministryId", "serviceDate");
CREATE INDEX "VolunteerSchedule_churchId_serviceDate_idx" ON "VolunteerSchedule"("churchId", "serviceDate");
CREATE UNIQUE INDEX "VolunteerScheduleSlot_churchId_id_key" ON "VolunteerScheduleSlot"("churchId", "id");
CREATE UNIQUE INDEX "VolunteerScheduleSlot_churchId_scheduleId_name_key" ON "VolunteerScheduleSlot"("churchId", "scheduleId", "name");
CREATE INDEX "VolunteerScheduleSlot_churchId_scheduleId_idx" ON "VolunteerScheduleSlot"("churchId", "scheduleId");
CREATE INDEX "VolunteerAssignment_churchId_personId_status_idx" ON "VolunteerAssignment"("churchId", "personId", "status");
CREATE UNIQUE INDEX "VolunteerUnavailability_churchId_id_key" ON "VolunteerUnavailability"("churchId", "id");
CREATE INDEX "VolunteerUnavailability_churchId_personId_serviceDate_idx" ON "VolunteerUnavailability"("churchId", "personId", "serviceDate");

ALTER TABLE "VolunteerSchedule" ADD CONSTRAINT "VolunteerSchedule_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VolunteerSchedule" ADD CONSTRAINT "VolunteerSchedule_churchId_ministryId_fkey" FOREIGN KEY ("churchId", "ministryId") REFERENCES "Ministry"("churchId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "VolunteerScheduleSlot" ADD CONSTRAINT "VolunteerScheduleSlot_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VolunteerScheduleSlot" ADD CONSTRAINT "VolunteerScheduleSlot_churchId_scheduleId_fkey" FOREIGN KEY ("churchId", "scheduleId") REFERENCES "VolunteerSchedule"("churchId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "VolunteerAssignment" ADD CONSTRAINT "VolunteerAssignment_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VolunteerAssignment" ADD CONSTRAINT "VolunteerAssignment_churchId_slotId_fkey" FOREIGN KEY ("churchId", "slotId") REFERENCES "VolunteerScheduleSlot"("churchId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "VolunteerAssignment" ADD CONSTRAINT "VolunteerAssignment_churchId_personId_fkey" FOREIGN KEY ("churchId", "personId") REFERENCES "Person"("churchId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "VolunteerUnavailability" ADD CONSTRAINT "VolunteerUnavailability_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VolunteerUnavailability" ADD CONSTRAINT "VolunteerUnavailability_churchId_personId_fkey" FOREIGN KEY ("churchId", "personId") REFERENCES "Person"("churchId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
