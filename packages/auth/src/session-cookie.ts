export const SESSION_COOKIE_NAME = "sistema-igrejas.jwt";
export const SESSION_COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60;
export const SESSION_STORAGE_KEY = "sistema-igrejas.session";

export function sessionCookieSecure(
  environment: { NODE_ENV?: string } = process.env
): boolean {
  return environment.NODE_ENV === "production";
}

export function serializeSessionCookie(
  token: string,
  environment: { NODE_ENV?: string } = process.env
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`
  ];

  if (sessionCookieSecure(environment)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function serializeExpiredSessionCookie(
  environment: { NODE_ENV?: string } = process.env
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];

  if (sessionCookieSecure(environment)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function readSessionCookie(
  cookieHeader: string | string[] | undefined
): string | null {
  if (!cookieHeader) {
    return null;
  }

  const header = Array.isArray(cookieHeader)
    ? cookieHeader.join("; ")
    : cookieHeader;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;

    const name = part.slice(0, separator).trim();
    if (name !== SESSION_COOKIE_NAME) continue;

    const value = part.slice(separator + 1).trim();
    if (!value) return null;

    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  return null;
}
