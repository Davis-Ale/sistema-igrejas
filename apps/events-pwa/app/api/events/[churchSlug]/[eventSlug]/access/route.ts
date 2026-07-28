const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3333";

type RouteContext = {
  params: Promise<{
    churchSlug: string;
    eventSlug: string;
  }>;
};

export async function POST(
  request: Request,
  context: RouteContext
) {
  const {
    churchSlug,
    eventSlug
  } = await context.params;

  const body = await request.text();

  const response = await fetch(
    `${API_BASE_URL}/public/churches/${encodeURIComponent(churchSlug)}/events/${encodeURIComponent(eventSlug)}/access`,
    {
      body,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    }
  );

  const responseBody = await response.text();

  return new Response(responseBody, {
    headers: {
      "Content-Type":
        response.headers.get("Content-Type") ??
        "application/json"
    },
    status: response.status
  });
}
