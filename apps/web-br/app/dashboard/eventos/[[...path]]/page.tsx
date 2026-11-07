"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import {
  readSessionSnapshot,
  restoreAuthenticatedSession,
  SESSION_STORAGE_KEY
} from "../../../lib/session-client";

export default function EventsRedirect() {
  const params = useParams<{ path?: string[] }>();

  useEffect(() => {
    const eventsAppUrl = process.env.NEXT_PUBLIC_EVENTS_APP_URL ?? "http://localhost:3001";
    const targetOrigin = new URL(eventsAppUrl).origin;
    const path = Array.isArray(params.path) ? params.path : [];
    const suffix = path.length ? `/${path.join("/")}` : "";
    let cancelled = false;
    let frame: HTMLIFrameElement | null = null;

    function handleMessage(event: MessageEvent) {
      if (!frame || event.origin !== targetOrigin || event.source !== frame.contentWindow) return;

      const data = event.data as { type?: string };

      if (data.type === "events-auth-ready") {
        const snapshot = readSessionSnapshot();
        if (!snapshot) return;
        frame.contentWindow?.postMessage({
          type: "events-auth-session",
          key: SESSION_STORAGE_KEY,
          value: JSON.stringify({ user: snapshot.user, church: snapshot.church })
        }, targetOrigin);
      }

      if (data.type === "events-auth-complete") {
        window.location.replace(`${eventsAppUrl}/dashboard/eventos${suffix}`);
      }
    }

    window.addEventListener("message", handleMessage);

    void (async () => {
      const snapshot = readSessionSnapshot() ?? await restoreAuthenticatedSession();
      if (cancelled) return;

      if (!snapshot) {
        window.location.replace(`${eventsAppUrl}/login`);
        return;
      }

      frame = document.createElement("iframe");
      frame.src = `${eventsAppUrl}/auth/handoff`;
      frame.style.display = "none";
      document.body.appendChild(frame);
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("message", handleMessage);
      frame?.remove();
    };
  }, [params.path]);

  return null;
}
