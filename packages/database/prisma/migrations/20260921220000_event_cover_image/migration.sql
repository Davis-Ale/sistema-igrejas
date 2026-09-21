CREATE TABLE "EventCoverImage" (
    "eventId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "contentType" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventCoverImage_pkey" PRIMARY KEY ("eventId"),
    CONSTRAINT "EventCoverImage_contentType_check" CHECK ("contentType" IN ('image/png', 'image/jpeg')),
    CONSTRAINT "EventCoverImage_size_check" CHECK (octet_length("data") BETWEEN 1 AND 5242880)
);
ALTER TABLE "EventCoverImage" ADD CONSTRAINT "EventCoverImage_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
