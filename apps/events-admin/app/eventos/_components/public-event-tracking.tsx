"use client";

import { useEffect, useRef } from "react";

export type PublicEventTrackingData = {
  googleAnalyticsId?: string | null;
  googleAdsConversionId?: string | null;
  googleAdsConversionLabel?: string | null;
  metaPixelId?: string | null;
};

const MEASUREMENT_ID_REGEX = /^G-[A-Z0-9]+$/;
const CONVERSION_ID_REGEX = /^AW-\d+$/;
const CONVERSION_LABEL_REGEX = /^[A-Za-z0-9_-]+$/;
const PIXEL_ID_REGEX = /^\d{5,20}$/;

type TrackingWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  fbq?: ((...args: unknown[]) => void) & {
    q?: unknown[];
    l?: number;
  };
  _fbq?: unknown;
};

function readValidId(value: string | null | undefined, regex: RegExp) {
  if (!value || !regex.test(value)) {
    return null;
  }

  return value;
}

function ensureExternalScript(src: string, id: string) {
  if (document.getElementById(id)) {
    return;
  }

  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

function ensureGtag(ids: string[]) {
  const trackingWindow = window as TrackingWindow;

  trackingWindow.dataLayer = trackingWindow.dataLayer ?? [];

  if (typeof trackingWindow.gtag !== "function") {
    trackingWindow.gtag = (...args: unknown[]) => {
      trackingWindow.dataLayer?.push(args);
    };
    trackingWindow.gtag("js", new Date());
  }

  const primaryId = ids[0];

  if (primaryId) {
    ensureExternalScript(
      `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(primaryId)}`,
      "events-gtag-sdk"
    );
  }

  for (const id of ids) {
    trackingWindow.gtag("config", id);
  }
}

function ensureMetaPixel(pixelId: string) {
  const trackingWindow = window as TrackingWindow;

  if (typeof trackingWindow.fbq !== "function") {
    const fbq = ((...args: unknown[]) => {
      (fbq.q = fbq.q ?? []).push(args);
    }) as NonNullable<TrackingWindow["fbq"]>;

    fbq.l = Date.now();
    trackingWindow.fbq = fbq;
    trackingWindow._fbq = fbq;
  }

  trackingWindow.fbq("init", pixelId);
  trackingWindow.fbq("track", "PageView");
  ensureExternalScript(
    "https://connect.facebook.net/en_US/fbevents.js",
    "events-meta-pixel-sdk"
  );
}

export function PublicEventTracking({
  tracking,
  registrationConfirmed
}: {
  tracking?: PublicEventTrackingData | null | undefined;
  registrationConfirmed: boolean;
}) {
  const conversionFired = useRef(false);

  useEffect(() => {
    if (!tracking) {
      return;
    }

    const googleAnalyticsId = readValidId(
      tracking.googleAnalyticsId,
      MEASUREMENT_ID_REGEX
    );
    const googleAdsConversionId = readValidId(
      tracking.googleAdsConversionId,
      CONVERSION_ID_REGEX
    );
    const metaPixelId = readValidId(tracking.metaPixelId, PIXEL_ID_REGEX);
    const gtagIds = [googleAnalyticsId, googleAdsConversionId].filter(
      (id): id is string => Boolean(id)
    );

    if (gtagIds.length > 0) {
      ensureGtag(gtagIds);
    }

    if (metaPixelId) {
      ensureMetaPixel(metaPixelId);
    }
  }, [tracking]);

  useEffect(() => {
    if (!registrationConfirmed || conversionFired.current || !tracking) {
      return;
    }

    const trackingWindow = window as TrackingWindow;
    const googleAdsConversionId = readValidId(
      tracking.googleAdsConversionId,
      CONVERSION_ID_REGEX
    );
    const googleAdsConversionLabel = readValidId(
      tracking.googleAdsConversionLabel,
      CONVERSION_LABEL_REGEX
    );
    const metaPixelId = readValidId(tracking.metaPixelId, PIXEL_ID_REGEX);

    if (
      googleAdsConversionId &&
      googleAdsConversionLabel &&
      typeof trackingWindow.gtag === "function"
    ) {
      trackingWindow.gtag("event", "conversion", {
        send_to: `${googleAdsConversionId}/${googleAdsConversionLabel}`
      });
    }

    if (metaPixelId && typeof trackingWindow.fbq === "function") {
      trackingWindow.fbq("track", "CompleteRegistration");
    }

    if (
      (googleAdsConversionId && googleAdsConversionLabel) ||
      metaPixelId
    ) {
      conversionFired.current = true;
    }
  }, [registrationConfirmed, tracking]);

  return null;
}
