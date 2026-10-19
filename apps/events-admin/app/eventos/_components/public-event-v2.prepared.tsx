"use client";

import { PublicEventView } from "./public-event-view";
import { createPublicCheckoutV2Client, type PublicCheckoutV2Factory } from "./public-checkout-v2.client";

// Deliberately absent from every page/route. No env flag activates this wrapper.
// Only a coordinated future cut may replace the legacy public page composition.
const prepareCheckoutV2: PublicCheckoutV2Factory = target => createPublicCheckoutV2Client({
  target, apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3333",
  storage: window.sessionStorage, crypto: window.crypto
});

export function PreparedPublicEventV2({ eventId, mode }: { eventId: string; mode: "public" | "preview" }) {
  return <PublicEventView eventId={eventId} mode={mode} prepareCheckoutV2={prepareCheckoutV2} />;
}
