"use client";

import { useParams } from "next/navigation";
import { PreparedPublicEventV2 } from "../_components/public-event-v2.prepared";

export default function PublicEventPage() {
  const params = useParams<{ eventId: string }>();

  return (
    <PreparedPublicEventV2
      eventId={params.eventId}
      mode="public"
    />
  );
}
