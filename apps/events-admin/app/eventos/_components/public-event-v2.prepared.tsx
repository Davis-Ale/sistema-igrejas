"use client";

import { PublicEventView } from "./public-event-view";
import { createPublicCheckoutV2Client, type PublicCheckoutV2Factory } from "./public-checkout-v2.client";

// Public page composition only. Preview stays without this wrapper. No env flag.
const prepareCheckoutV2: PublicCheckoutV2Factory = target => createPublicCheckoutV2Client({
  target, apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3002",
  storage: window.sessionStorage, crypto: window.crypto
});

export function PreparedPublicEventV2({ eventId, mode }: { eventId: string; mode: "public" | "preview" }) {
  return <PublicEventView eventId={eventId} mode={mode} prepareCheckoutV2={prepareCheckoutV2} />;
}
