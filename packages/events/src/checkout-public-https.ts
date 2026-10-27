const present = (value: string | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

const loopback = (hostname: string) => ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
const temporary = (hostname: string) =>
  /\.(trycloudflare\.com|loca\.lt|ngrok\.io|ngrok-free\.app|pinggy\.io)$/.test(hostname);
const railway = (hostname: string) =>
  hostname.endsWith(".up.railway.app") || hostname === "railway.app" || hostname.endsWith(".railway.app");

export type CheckoutPublicHttpsClass =
  | "MISSING"
  | "UNSAFE_URL"
  | "INVALID"
  | "HTTP_LOOPBACK"
  | "HTTPS_TEMPORARY"
  | "HTTPS_RAILWAY"
  | "HTTPS_PUBLIC"
  | "OTHER";

export function classifyCheckoutPublicHttpsUrl(value: string | undefined): CheckoutPublicHttpsClass {
  if (!present(value)) return "MISSING";
  try {
    const url = new URL(value.trim());
    if (url.username || url.password || url.search || url.hash) return "UNSAFE_URL";
    const host = url.hostname.toLowerCase();
    if (url.protocol === "https:" && !loopback(host)) {
      if (temporary(host)) return "HTTPS_TEMPORARY";
      if (railway(host)) return "HTTPS_RAILWAY";
      return "HTTPS_PUBLIC";
    }
    if (url.protocol === "http:" && loopback(host)) return "HTTP_LOOPBACK";
    return "OTHER";
  } catch {
    return "INVALID";
  }
}

export function parseAsaasWebhookPublicUrl(value: string | undefined): string {
  if (classifyCheckoutPublicHttpsUrl(value) !== "HTTPS_PUBLIC") {
    throw new Error("ASAAS_WEBHOOK_URL_NOT_FIXED_HTTPS");
  }
  const url = new URL(value!.trim());
  if (url.pathname !== "/webhooks/asaas") throw new Error("ASAAS_WEBHOOK_URL_NOT_FIXED_HTTPS");
  return url.origin + url.pathname;
}
