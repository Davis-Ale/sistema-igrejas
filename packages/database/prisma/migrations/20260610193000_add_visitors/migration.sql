-- CreateEnum
CREATE TYPE "VisitorStatus" AS ENUM ('NEW', 'CONTACTED', 'INTEGRATED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "campusId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "status" "VisitorStatus" NOT NULL DEFAULT 'NEW',
    "firstVisitAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Visitor_churchId_idx" ON "Visitor"("churchId");

-- CreateIndex
CREATE INDEX "Visitor_churchId_campusId_idx" ON "Visitor"("churchId", "campusId");

-- CreateIndex
CREATE INDEX "Visitor_churchId_email_idx" ON "Visitor"("churchId", "email");

-- CreateIndex
CREATE INDEX "Visitor_churchId_phone_idx" ON "Visitor"("churchId", "phone");

-- CreateIndex
CREATE INDEX "Visitor_churchId_status_idx" ON "Visitor"("churchId", "status");

-- CreateIndex
CREATE INDEX "Visitor_churchId_firstVisitAt_idx" ON "Visitor"("churchId", "firstVisitAt");

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
