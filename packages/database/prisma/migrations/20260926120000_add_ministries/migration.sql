CREATE TYPE "MinistryStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE UNIQUE INDEX "Person_churchId_id_key" ON "Person"("churchId", "id");

CREATE TABLE "Ministry" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "MinistryStatus" NOT NULL DEFAULT 'ACTIVE',
    "leaderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Ministry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MinistryMember" (
    "churchId" TEXT NOT NULL,
    "ministryId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MinistryMember_pkey" PRIMARY KEY ("churchId", "ministryId", "personId")
);

CREATE UNIQUE INDEX "Ministry_churchId_id_key" ON "Ministry"("churchId", "id");
CREATE INDEX "Ministry_churchId_status_idx" ON "Ministry"("churchId", "status");
CREATE INDEX "Ministry_churchId_leaderId_idx" ON "Ministry"("churchId", "leaderId");
CREATE INDEX "MinistryMember_churchId_personId_idx" ON "MinistryMember"("churchId", "personId");

ALTER TABLE "Ministry" ADD CONSTRAINT "Ministry_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Ministry" ADD CONSTRAINT "Ministry_churchId_leaderId_fkey" FOREIGN KEY ("churchId", "leaderId") REFERENCES "Person"("churchId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "MinistryMember" ADD CONSTRAINT "MinistryMember_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MinistryMember" ADD CONSTRAINT "MinistryMember_churchId_ministryId_fkey" FOREIGN KEY ("churchId", "ministryId") REFERENCES "Ministry"("churchId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "MinistryMember" ADD CONSTRAINT "MinistryMember_churchId_personId_fkey" FOREIGN KEY ("churchId", "personId") REFERENCES "Person"("churchId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
