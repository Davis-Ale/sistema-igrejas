ALTER TABLE "Event"
ADD COLUMN IF NOT EXISTS "publicSlug" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Event_publicSlug_key"
ON "Event"("publicSlug");
