"use client";

import { useEffect, useState } from "react";

export function ParticipantMapImage({ publicSlug, checkInToken, imageVersion, imageUrl, title }: {
  publicSlug: string; checkInToken: string; imageVersion: string | null | undefined;
  imageUrl: string | null; title: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!imageVersion) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setSrc(null);
    setError("");
    void (async () => {
      try {
        const response = await fetch(`/api/events/${encodeURIComponent(publicSlug)}/map-image`, {
          method: "POST", body: JSON.stringify({ checkInToken }), cache: "no-store",
          headers: { "Content-Type": "application/json" }, signal: controller.signal
        });
        if (!response.ok) throw new Error("Não foi possível carregar a planta.");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!controller.signal.aborted) setError("Não foi possível carregar a planta.");
      }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [publicSlug, checkInToken, imageVersion, retry]);

  const image = imageVersion ? src : imageUrl;
  if (error) return <div role="alert"><p>{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button></div>;
  return image ? <img alt={`Planta de ${title}`} src={image} /> : <p role="status">Carregando planta...</p>;
}
