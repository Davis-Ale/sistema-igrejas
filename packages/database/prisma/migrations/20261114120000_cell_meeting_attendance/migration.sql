CREATE TYPE "CellAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT');

CREATE UNIQUE INDEX "Celula_churchId_id_key" ON "Celula"("churchId", "id");

CREATE TABLE "CellMeeting" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "cellId" TEXT NOT NULL,
    "occurredOn" DATE NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CellMeeting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CellAttendance" (
    "churchId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" "CellAttendanceStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CellAttendance_pkey" PRIMARY KEY ("churchId", "meetingId", "personId")
);

CREATE UNIQUE INDEX "CellMeeting_churchId_id_key" ON "CellMeeting"("churchId", "id");
CREATE UNIQUE INDEX "CellMeeting_churchId_cellId_occurredOn_key" ON "CellMeeting"("churchId", "cellId", "occurredOn");
CREATE INDEX "CellMeeting_churchId_cellId_idx" ON "CellMeeting"("churchId", "cellId");
CREATE INDEX "CellMeeting_churchId_recordedBy_idx" ON "CellMeeting"("churchId", "recordedBy");
CREATE INDEX "CellAttendance_churchId_personId_idx" ON "CellAttendance"("churchId", "personId");

ALTER TABLE "CellMeeting" ADD CONSTRAINT "CellMeeting_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CellMeeting" ADD CONSTRAINT "CellMeeting_churchId_cellId_fkey" FOREIGN KEY ("churchId", "cellId") REFERENCES "Celula"("churchId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "CellMeeting" ADD CONSTRAINT "CellMeeting_churchId_recordedBy_fkey" FOREIGN KEY ("churchId", "recordedBy") REFERENCES "Person"("churchId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "CellAttendance" ADD CONSTRAINT "CellAttendance_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CellAttendance" ADD CONSTRAINT "CellAttendance_churchId_meetingId_fkey" FOREIGN KEY ("churchId", "meetingId") REFERENCES "CellMeeting"("churchId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "CellAttendance" ADD CONSTRAINT "CellAttendance_churchId_personId_fkey" FOREIGN KEY ("churchId", "personId") REFERENCES "Person"("churchId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
