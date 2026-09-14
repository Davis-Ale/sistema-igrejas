-- AlterTable
ALTER TABLE "Event" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Event_churchId_deletedAt_idx" ON "Event"("churchId", "deletedAt");
