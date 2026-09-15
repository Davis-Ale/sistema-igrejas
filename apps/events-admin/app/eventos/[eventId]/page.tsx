"use client";

import { useParams } from "next/navigation";
import { PublicEventView } from "../_components/public-event-view";

export default function PublicEventPage() {
  const params = useParams<{ eventId: string }>();

  return (
    <PublicEventView
      eventId={params.eventId}
      mode="public"
    />
  );
}
