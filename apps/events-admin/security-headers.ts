export type SecurityHeader = {
  key: string;
  value: string;
};

const TRACKING_SCRIPT_ORIGINS = [
  "https://www.googletagmanager.com",
  "https://connect.facebook.net"
] as const;

const TRACKING_CONNECT_ORIGINS = [
  "https://www.googletagmanager.com",
  "https://*.googletagmanager.com",
  "https://www.google-analytics.com",
  "https://*.google-analytics.com",
  "https://analytics.google.com",
  "https://www.google.com",
  "https://*.google.com",
  "https://www.googleadservices.com",
  "https://googleads.g.doubleclick.net",
  "https://*.g.doubleclick.net",
  "https://www.facebook.com",
  "https://*.facebook.com",
  "https://connect.facebook.net",
  "https://*.facebook.net"
] as const;

const TRACKING_IMG_ORIGINS = [
  "https://www.googletagmanager.com",
  "https://www.google-analytics.com",
  "https://*.google-analytics.com",
  "https://www.google.com",
  "https://googleads.g.doubleclick.net",
  "https://www.facebook.com",
  "https://*.facebook.com"
] as const;

const TRACKING_FRAME_ORIGINS = [
  "https://www.googletagmanager.com",
  "https://www.facebook.com",
  "https://*.facebook.com"
] as const;

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
    originFrom(process.env.NEXT_PUBLIC_API_BASE_URL)
  ]);
  const churchAppOrigins = unique([
    "'self'",
    "http://localhost:3000",
    originFrom(process.env.NEXT_PUBLIC_CHURCH_APP_URL)
  ]);
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    ...TRACKING_SCRIPT_ORIGINS
  ];

  if (process.env.NODE_ENV !== "production") {
    scriptSrc.push("'unsafe-eval'");
  }

  return serializeCsp([
    ["default-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", churchAppOrigins],
    ["object-src", ["'none'"]],
    ["script-src", scriptSrc],
    ["style-src", ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]],
    [
      "img-src",
      ["'self'", "data:", "blob:", ...apiOrigins, ...TRACKING_IMG_ORIGINS]
    ],
    ["font-src", ["'self'", "data:", "https://fonts.gstatic.com"]],
    [
      "connect-src",
      ["'self'", ...apiOrigins, ...TRACKING_CONNECT_ORIGINS]
    ],
    ["frame-src", TRACKING_FRAME_ORIGINS],
    ["worker-src", ["'self'", "blob:"]]
  ]);
}

export function pageSecurityHeaders(): SecurityHeader[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy() },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
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
