const API_BASE_URL =
  process.env.EVENTS_API_BASE_URL ??
  "http://localhost:3002";

type RouteContext = {
  params: Promise<{
    publicSlug: string;
  }>;
};

export async function POST(
  request: Request,
  context: RouteContext
) {
  const { publicSlug } = await context.params;
  const body = await request.text();

  try {
    const response = await fetch(
      `${API_BASE_URL}/public/event-pages/${encodeURIComponent(publicSlug)}/access`,
      {
        body,
        cache: "no-store",
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      }
    );

    return new Response(await response.text(), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type":
          response.headers.get("Content-Type") ??
          "application/json"
      },
      status: response.status
    });
  } catch {
    return Response.json(
      {
        error: "PARTICIPANT_APP_UNAVAILABLE",
        message: "Não foi possível acessar o aplicativo agora."
      },
      {
        status: 503
      }
    );
  }
}
