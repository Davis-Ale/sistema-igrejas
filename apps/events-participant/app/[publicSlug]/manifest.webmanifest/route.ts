const API_BASE_URL =
  process.env.EVENTS_API_BASE_URL ??
  "http://localhost:3002";

type RouteContext = {
  params: Promise<{
    publicSlug: string;
  }>;
};

type PublicEventManifestData = {
  title: string;
};

function isValidPublicSlug(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(value);
}

export async function GET(
  _request: Request,
  context: RouteContext
) {
  const { publicSlug } = await context.params;

  if (!isValidPublicSlug(publicSlug)) {
    return Response.json(
      { error: "MANIFEST_NOT_FOUND" },
      { status: 404 }
    );
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/public/event-pages/${encodeURIComponent(publicSlug)}/app`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return Response.json(
        { error: "MANIFEST_NOT_FOUND" },
        { status: 404 }
      );
    }

    const event = await response.json() as PublicEventManifestData;
    const encodedSlug = encodeURIComponent(publicSlug);
    const eventPath = `/${encodedSlug}`;

    return Response.json(
      {
        id: eventPath,
        name: event.title,
        short_name: event.title.slice(0, 30),
        start_url: `${eventPath}#aplicativo`,
        scope: eventPath,
        display: "standalone",
        background_color: "#020617",
        theme_color: "#020617",
        orientation: "portrait",
        icons: [
          {
            src: "/icons/icon-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any"
          },
          {
            src: "/icons/icon-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "maskable"
          }
        ]
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/manifest+json; charset=utf-8",
          "X-Content-Type-Options": "nosniff"
        }
      }
    );
  } catch {
    return Response.json(
      { error: "MANIFEST_NOT_FOUND" },
      { status: 404 }
    );
  }
}
