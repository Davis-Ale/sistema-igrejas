CREATE TABLE "LocationCity" (
  "id" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL DEFAULT 'BR',
  "stateCode" TEXT NOT NULL,
  "ibgeCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LocationCity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LocationNeighborhood" (
  "id" TEXT NOT NULL,
  "cityId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LocationNeighborhood_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Church" ADD COLUMN "baseCityId" TEXT;

CREATE UNIQUE INDEX "LocationCity_ibgeCode_key"
  ON "LocationCity"("ibgeCode");

CREATE UNIQUE INDEX "LocationCity_countryCode_stateCode_normalizedName_key"
  ON "LocationCity"("countryCode", "stateCode", "normalizedName");

CREATE INDEX "LocationCity_stateCode_name_idx"
  ON "LocationCity"("stateCode", "name");

CREATE UNIQUE INDEX "LocationNeighborhood_cityId_normalizedName_key"
  ON "LocationNeighborhood"("cityId", "normalizedName");

CREATE INDEX "LocationNeighborhood_cityId_name_idx"
  ON "LocationNeighborhood"("cityId", "name");

CREATE INDEX "Church_baseCityId_idx"
  ON "Church"("baseCityId");

ALTER TABLE "LocationNeighborhood"
  ADD CONSTRAINT "LocationNeighborhood_cityId_fkey"
  FOREIGN KEY ("cityId")
  REFERENCES "LocationCity"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "Church"
  ADD CONSTRAINT "Church_baseCityId_fkey"
  FOREIGN KEY ("baseCityId")
  REFERENCES "LocationCity"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
