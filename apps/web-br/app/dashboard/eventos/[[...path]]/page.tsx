"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";

function getAuthSession() {
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) continue;

    const value = localStorage.getItem(key);
    if (!value) continue;

    try {
      const parsed = JSON.parse(value) as { state?: { token?: unknown; user?: { churchId?: unknown } } };
      if (typeof parsed.state?.token === "string" && typeof parsed.state.user?.churchId === "string") {
        return { key, value };
      }
    } catch {}
  }

  return null;
}

export default function EventsRedirect() {
  const params = useParams<{ path?: string[] }>();

  useEffect(() => {
    const eventsAppUrl = process.env.NEXT_PUBLIC_EVENTS_APP_URL ?? "http://localhost:3001";
    const targetOrigin = new URL(eventsAppUrl).origin;
    const path = Array.isArray(params.path) ? params.path : [];
    const suffix = path.length ? `/${path.join("/")}` : "";
    const auth = getAuthSession();

    if (!auth) {
      window.location.replace(`${eventsAppUrl}/login`);
      return;
    }

    const frame = document.createElement("iframe");
    frame.src = `${eventsAppUrl}/auth/handoff`;
    frame.style.display = "none";
    document.body.appendChild(frame);

    function handleMessage(event: MessageEvent) {
      if (event.origin !== targetOrigin || event.source !== frame.contentWindow) return;

      const data = event.data as { type?: string };

      if (data.type === "events-auth-ready") {
        frame.contentWindow?.postMessage({
          type: "events-auth-session",
          key: auth!.key,
          value: auth!.value
        }, targetOrigin);
      }

      if (data.type === "events-auth-complete") {
        window.location.replace(`${eventsAppUrl}/dashboard/eventos${suffix}`);
      }
    }

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
      frame.remove();
    };
  }, [params.path]);

  return null;
}
