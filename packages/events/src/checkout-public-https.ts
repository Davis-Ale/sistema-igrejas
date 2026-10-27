const present = (value: string | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

const loopback = (hostname: string) => ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
const temporary = (hostname: string) =>
  /\.(loca\.lt|ngrok\.io|ngrok-free\.app|pinggy\.io)$/.test(hostname);
const cloudflareTunnel = (hostname: string) =>
  hostname === "trycloudflare.com" || hostname.endsWith(".trycloudflare.com")
  || hostname === "cfargotunnel.com" || hostname.endsWith(".cfargotunnel.com");
const railway = (hostname: string) =>
  hostname.endsWith(".up.railway.app") || hostname === "railway.app" || hostname.endsWith(".railway.app");

export type CheckoutPublicHttpsClass =
  | "MISSING"
  | "UNSAFE_URL"
  | "INVALID"
  | "HTTP_LOOPBACK"
  | "HTTPS_TEMPORARY"
  | "HTTPS_TUNNEL"
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
      if (cloudflareTunnel(host)) return "HTTPS_TUNNEL";
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

export function parseApiPublicHost(value: string | undefined): string {
  if (!present(value) || /[/:?#]/.test(value.trim()) || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value.trim())) {
    throw new Error("API_PUBLIC_HOST_NOT_FIXED_HTTPS");
  }
  const host = value.trim().toLowerCase();
  if (classifyCheckoutPublicHttpsUrl(`https://${host}/webhooks/asaas`) !== "HTTPS_PUBLIC") {
    throw new Error("API_PUBLIC_HOST_NOT_FIXED_HTTPS");
  }
  return host;
}
