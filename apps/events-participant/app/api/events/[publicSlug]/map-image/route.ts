const API_BASE_URL = process.env.EVENTS_API_BASE_URL ?? "http://localhost:3002";

export async function POST(request: Request, context: { params: Promise<{ publicSlug: string }> }) {
  const { publicSlug } = await context.params;
  try {
    const body = await request.text();
    if (body.length > 1024) return Response.json({ message: "Credencial inválida." }, { status: 400 });
    const response = await fetch(`${API_BASE_URL}/public/event-pages/${encodeURIComponent(publicSlug)}/map-image`, {
      method: "POST", body, cache: "no-store", headers: { "Content-Type": "application/json" }
    });
    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Type": response.headers.get("Content-Type") ?? "application/json"
      }
    });
  } catch {
    return Response.json({ message: "Não foi possível carregar a planta agora." }, { status: 503 });
  }
}
