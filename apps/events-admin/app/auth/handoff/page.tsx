"use client";

import { useEffect } from "react";

export default function EventsAuthHandoff() {
  useEffect(() => {
    const churchAppUrl = process.env.NEXT_PUBLIC_CHURCH_APP_URL ?? "http://localhost:3000";
    const allowedOrigin = new URL(churchAppUrl).origin;

    function handleMessage(event: MessageEvent) {
      if (event.origin !== allowedOrigin || event.source !== window.parent) return;

      const data = event.data as { type?: string; key?: string; value?: string };
      if (data.type !== "events-auth-session" || !data.key || !data.value) return;

      try {
        const parsed = JSON.parse(data.value) as { state?: { token?: unknown; user?: { churchId?: unknown } } };
        if (typeof parsed.state?.token !== "string" || typeof parsed.state.user?.churchId !== "string") return;

        localStorage.setItem(data.key, data.value);
        window.parent.postMessage({ type: "events-auth-complete" }, allowedOrigin);
      } catch {}
    }

    window.addEventListener("message", handleMessage);
    window.parent.postMessage({ type: "events-auth-ready" }, allowedOrigin);

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}
