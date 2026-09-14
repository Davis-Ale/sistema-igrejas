"use client";

import { PublicEventView } from "../../../../eventos/_components/public-event-view";

export function EventPreviewClient({
  eventId
}: {
  eventId: string;
}) {
  return (
    <PublicEventView
      eventId={eventId}
      mode="preview"
    />
  );
}
