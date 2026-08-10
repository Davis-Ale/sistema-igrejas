-- CreateTable
CREATE TABLE "EventApiKey" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "EventApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventApiKey_churchId_idx" ON "EventApiKey"("churchId");

-- CreateIndex
CREATE INDEX "EventApiKey_churchId_eventId_idx" ON "EventApiKey"("churchId", "eventId");

-- CreateIndex
CREATE INDEX "EventApiKey_keyPrefix_idx" ON "EventApiKey"("keyPrefix");

-- CreateIndex
CREATE UNIQUE INDEX "EventApiKey_eventId_name_key" ON "EventApiKey"("eventId", "name");

-- AddForeignKey
ALTER TABLE "EventApiKey" ADD CONSTRAINT "EventApiKey_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventApiKey" ADD CONSTRAINT "EventApiKey_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
