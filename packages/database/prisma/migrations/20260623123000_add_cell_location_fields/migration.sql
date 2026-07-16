ALTER TABLE "Celula" ADD COLUMN "state" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Celula" ADD COLUMN "city" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Celula" ADD COLUMN "neighborhood" TEXT NOT NULL DEFAULT '';

CREATE INDEX "Celula_churchId_state_city_neighborhood_idx" ON "Celula"("churchId", "state", "city", "neighborhood");
