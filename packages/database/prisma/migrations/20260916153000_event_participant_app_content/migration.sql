ALTER TABLE "Event"
ADD COLUMN "participantMapImageUrl" TEXT;

CREATE TABLE "EventAppSession" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "type" TEXT,
    "facilitator" TEXT,
    "location" TEXT,
    "details" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventAppSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventAppSessionRegistration" (
    "churchId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventAppSessionRegistration_pkey" PRIMARY KEY ("sessionId", "registrationId")
);

CREATE TABLE "EventAppMapPoint" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventAppMapPoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventAppSession_churchId_eventId_idx"
ON "EventAppSession"("churchId", "eventId");

CREATE INDEX "EventAppSession_churchId_eventId_isPublished_startsAt_idx"
ON "EventAppSession"("churchId", "eventId", "isPublished", "startsAt");

CREATE INDEX "EventAppSessionRegistration_churchId_eventId_idx"
ON "EventAppSessionRegistration"("churchId", "eventId");

CREATE INDEX "EventAppSessionRegistration_churchId_eventId_registrationId_idx"
ON "EventAppSessionRegistration"("churchId", "eventId", "registrationId");

CREATE INDEX "EventAppMapPoint_churchId_eventId_idx"
ON "EventAppMapPoint"("churchId", "eventId");

CREATE INDEX "EventAppMapPoint_churchId_eventId_isVisible_sortOrder_idx"
ON "EventAppMapPoint"("churchId", "eventId", "isVisible", "sortOrder");

ALTER TABLE "EventAppSession"
ADD CONSTRAINT "EventAppSession_churchId_fkey"
FOREIGN KEY ("churchId") REFERENCES "Church"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventAppSession"
ADD CONSTRAINT "EventAppSession_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventAppSessionRegistration"
ADD CONSTRAINT "EventAppSessionRegistration_churchId_fkey"
FOREIGN KEY ("churchId") REFERENCES "Church"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventAppSessionRegistration"
ADD CONSTRAINT "EventAppSessionRegistration_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventAppSessionRegistration"
ADD CONSTRAINT "EventAppSessionRegistration_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "EventAppSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventAppSessionRegistration"
ADD CONSTRAINT "EventAppSessionRegistration_registrationId_fkey"
FOREIGN KEY ("registrationId") REFERENCES "Registration"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventAppMapPoint"
ADD CONSTRAINT "EventAppMapPoint_churchId_fkey"
FOREIGN KEY ("churchId") REFERENCES "Church"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventAppMapPoint"
ADD CONSTRAINT "EventAppMapPoint_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
