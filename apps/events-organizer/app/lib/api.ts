// Same login response and storage contract used by events-admin.
export const SESSION_KEY = "sistema-igrejas.session";

export type Session = {
  token: string;
  user: { email: string; role: string };
  church: { name: string; status: string };
};
export type EventSummary = { id: string; title: string; date: string };
export type EventPage = {
  items: EventSummary[];
  pagination: { page: number; totalPages: number; total: number };
};
export type CheckInResult = {
  id: string;
  status: string;
  event: { id: string; title: string };
  person: { name: string } | null;
  visitor: { name: string } | null;
};

export function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<Session>;
  return typeof data.token === "string" && data.token.length > 0 &&
    typeof data.user?.email === "string" && typeof data.user?.role === "string" &&
    typeof data.church?.name === "string" && typeof data.church?.status === "string";
}

export function readSession(storage: Pick<Storage, "getItem" | "removeItem">): Session | null {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (isSession(value)) return value;
    storage.removeItem(SESSION_KEY);
  } catch {
    // Unavailable storage or a malformed session never grants access.
  }
  return null;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function apiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.NODE_ENV === "development") return "http://localhost:3002";
  throw new Error("O endereço da API de Eventos não foi configurado.");
}

async function request<T>(path: string, init: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${apiBaseUrl()}${path}`, { ...init, headers, cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status,
      typeof data?.error === "string" ? data.error : "REQUEST_FAILED",
      response.status >= 500 ? "Não foi possível concluir a operação. Tente novamente." :
        typeof data?.message === "string" ? data.message : "Não foi possível concluir a operação.");
  }
  if (!data) throw new Error("A API retornou uma resposta inválida.");
  return data as T;
}

export async function login(email: string, password: string) {
  const session = await request<Session>("/auth/login", {
    method: "POST", body: JSON.stringify({ email, password }),
  });
  if (!isSession(session)) throw new Error("A API retornou uma sessão inválida.");
  return session;
}

export function listEvents(token: string, page: number, search: string, signal: AbortSignal) {
  const query = new URLSearchParams({ page: String(page), limit: "20" });
  if (search.trim()) query.set("search", search.trim());
  return request<EventPage>(`/api/events?${query}`, { signal }, token);
}

export async function loadEventCover(token: string, eventId: string, signal: AbortSignal) {
  const response = await fetch(`${apiBaseUrl()}/api/events/${encodeURIComponent(eventId)}/cover`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new ApiError(response.status, "EVENT_COVER_UNAVAILABLE", "Capa indisponível.");
  return response.blob();
}

export async function checkIn(token: string, eventId: string, code: string) {
  const result = await request<CheckInResult>("/api/events/registrations/check-in-token", {
    method: "POST", body: JSON.stringify({ eventId, checkInToken: code.trim() }),
  }, token);
  if (result.status !== "CHECKED_IN" || result.event?.id !== eventId || !result.id) {
    throw new Error("Não foi possível confirmar o check-in. Confira a inscrição antes de tentar novamente.");
  }
  return result;
}
