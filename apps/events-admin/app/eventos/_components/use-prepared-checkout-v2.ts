"use client";

import { useEffect, useRef, useState } from "react";
import type { CheckoutSnapshot, CheckoutTarget, PublicCheckoutV2Client, PublicCheckoutV2Factory } from "./public-checkout-v2.client";

// The optional factory is supplied exclusively by the unconnected prepared wrapper.
export function usePreparedCheckoutV2(factory: PublicCheckoutV2Factory | undefined, target: CheckoutTarget | null, preview: boolean) {
  const client = useRef<PublicCheckoutV2Client | null>(null);
  const boundTarget = useRef<CheckoutTarget | null>(null);
  const [snapshot, setSnapshot] = useState<CheckoutSnapshot | null>(null);
  useEffect(() => {
    setSnapshot(null);
    if (!factory || !target || preview) { boundTarget.current = null; return; }
    boundTarget.current = { ...target };
    let current: PublicCheckoutV2Client;
    try { current = factory(target); }
    catch { setSnapshot({ phase: "STORAGE_UNAVAILABLE", registration: null, expiresAt: null, busy: false,
      message: "Não foi possível preparar o acesso seguro nesta aba. Procure o atendimento.", needsCpf: false, hasSession: false }); return; }
    client.current = current;
    const unsubscribe = current.subscribe(setSnapshot);
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const state = current.getSnapshot();
      const done = state.registration && (state.registration.status === "CANCELLED" || state.registration.waitlistedAt ||
        !["PENDING", "OVERDUE"].includes(state.registration.paymentStatus));
      if (state.hasSession && !state.busy && !done && state.phase !== "VALIDATION_FAILED") { try { await current.status(); } catch { /* Safe state/message is owned by the client. Never resume automatically. */ } }
      if (!stopped) {
        const latest = current.getSnapshot();
        const remaining = latest.expiresAt ? Date.parse(latest.expiresAt) - Date.now() : 5000;
        timer = setTimeout(poll, Math.min(5000, Math.max(1, remaining)));
      }
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); unsubscribe(); current.dispose(); if (client.current === current) { client.current = null; boundTarget.current = null; } };
  }, [factory, target?.eventId, target?.churchSlug, target?.eventSlug, preview]);
  const matches = !!target && boundTarget.current?.eventId === target.eventId && boundTarget.current.churchSlug === target.churchSlug && boundTarget.current.eventSlug === target.eventSlug;
  return { client: { current: matches ? client.current : null }, snapshot: matches ? snapshot : null };
}
