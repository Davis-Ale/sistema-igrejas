CREATE TYPE "CellStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

ALTER TABLE "Celula"
ADD COLUMN "status" "CellStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Celula_churchId_status_idx"
ON "Celula"("churchId", "status");
