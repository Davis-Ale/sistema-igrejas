ALTER TABLE "EventApiKey" ADD COLUMN "description" TEXT;
ALTER TABLE "EventApiKey" ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY['events:read']::text[];

UPDATE "EventApiKey" AS k
SET name = k.name || '-' || left(k.id, 8)
WHERE EXISTS (
  SELECT 1
  FROM "EventApiKey" AS other
  WHERE other."churchId" = k."churchId"
    AND other.name = k.name
    AND other.id < k.id
);

DROP INDEX IF EXISTS "EventApiKey_eventId_name_key";
DROP INDEX IF EXISTS "EventApiKey_churchId_eventId_idx";

ALTER TABLE "EventApiKey" DROP CONSTRAINT IF EXISTS "EventApiKey_eventId_fkey";
ALTER TABLE "EventApiKey" DROP COLUMN "eventId";

CREATE UNIQUE INDEX "EventApiKey_keyHash_key" ON "EventApiKey"("keyHash");
CREATE UNIQUE INDEX "EventApiKey_churchId_name_key" ON "EventApiKey"("churchId", "name");
