"use client";

import { useEffect, useState } from "react";
import { ApiError, loadEventCover } from "./lib/api";
import styles from "./organizer.module.css";

export function EventCover({ eventId, title, token, banner = false, onExpired }: {
  eventId: string; title: string; token: string; banner?: boolean; onExpired: () => void;
}) {
  const [src, setSrc] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setSrc(""); setUnavailable(false);
    void loadEventCover(token, eventId, controller.signal).then((image) => {
      if (!image || controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(image);
      setSrc(objectUrl);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) onExpired();
      else setUnavailable(true);
    });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [eventId, token, onExpired]);

  return <span className={`${styles.cover} ${banner ? styles.coverBanner : styles.coverThumbnail}`}>
    {src && !unavailable ? <img src={src} alt={`Capa de ${title}`} onError={() => setUnavailable(true)} /> :
      <span className={styles.coverPlaceholder}>{unavailable ? "Capa indisponível" : "Sem capa"}</span>}
  </span>;
}
