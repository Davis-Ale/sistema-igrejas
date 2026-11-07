export type SecurityHeader = {
  key: string;
  value: string;
};

function unique(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
}

function originFrom(value: string | undefined): string | null {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function serializeCsp(directives: Array<[string, readonly string[]]>): string {
  return directives
    .map(([name, values]) => `${name} ${unique(values).join(" ")}`)
    .join("; ");
}

export function contentSecurityPolicy(): string {
  const apiOrigins = unique([
    "http://localhost:3002",
    originFrom(process.env.EVENTS_API_BASE_URL),
    originFrom(process.env.NEXT_PUBLIC_API_BASE_URL)
  ]);
  const scriptSrc = ["'self'", "'unsafe-inline'"];

  if (process.env.NODE_ENV !== "production") {
    scriptSrc.push("'unsafe-eval'");
  }

  return serializeCsp([
    ["default-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["object-src", ["'none'"]],
    ["script-src", scriptSrc],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", ...apiOrigins]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", ...apiOrigins]],
    ["frame-src", ["'none'"]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]]
  ]);
}

export function pageSecurityHeaders(): SecurityHeader[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy() },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains"
    }
  ];
}
