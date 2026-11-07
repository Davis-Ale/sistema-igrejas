export const SESSION_STORAGE_KEY = "sistema-igrejas.session";

export type SessionSnapshot = {
  user: {
    email: string;
    role: string;
    [key: string]: unknown;
  };
  church: {
    name: string;
    status: string;
    trialEndsAt?: string | null;
    [key: string]: unknown;
  };
};

export function eventsApiBaseUrl() {
  if (typeof window !== "undefined") {
    return "";
  }

  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3002";
}

export function isSessionSnapshot(value: unknown): value is SessionSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const session = value as Partial<SessionSnapshot>;
  return Boolean(
    session.church &&
      typeof session.church === "object" &&
      typeof session.church.name === "string" &&
      typeof session.church.status === "string" &&
      session.user &&
      typeof session.user === "object" &&
      typeof session.user.email === "string" &&
      typeof session.user.role === "string"
  );
}

export function readSessionSnapshot(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSessionSnapshot(parsed)) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    const snapshot = {
      user: parsed.user,
      church: parsed.church
    };

    if ("token" in parsed) {
      writeSessionSnapshot(snapshot);
    }

    return snapshot;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function writeSessionSnapshot(session: SessionSnapshot) {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      user: session.user,
      church: session.church
    })
  );
}

export function clearSessionSnapshot() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

export async function credentialedFetch(input: string, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    cache: init.cache ?? "no-store",
    credentials: "include"
  });
}

export async function restoreAuthenticatedSession() {
  const response = await credentialedFetch(`${eventsApiBaseUrl()}/auth/session`);
  if (!response.ok) {
    clearSessionSnapshot();
    return null;
  }

  const session = (await response.json()) as SessionSnapshot;
  if (!isSessionSnapshot(session)) {
    clearSessionSnapshot();
    return null;
  }

  writeSessionSnapshot(session);
  return session;
}

export async function logoutSession() {
  try {
    await credentialedFetch(`${eventsApiBaseUrl()}/auth/logout`, {
      method: "POST"
    });
  } catch {
    // Cookie clear is best-effort; the snapshot is always removed.
  }

  clearSessionSnapshot();
}
