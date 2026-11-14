// Same login response and storage contract used by events-admin.
export const SESSION_KEY = "sistema-igrejas.session";

export type Session = {
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
export type RegistrationSummary = {
  id: string;
  status: string;
  paymentStatus: string;
  checkInToken: string | null;
  waitlistedAt: string | null;
  person: { name: string; phone: string; email: string | null } | null;
  visitor: { name: string; phone: string; email: string | null } | null;
  ticket: { name: string } | null;
  ticketBatch: { name: string } | null;
};
export type RegistrationPage = {
  items: RegistrationSummary[];
  pagination: { page: number; totalPages: number; total: number };
};
export type OrganizerFinancialAmounts = {
  grossAmount: string;
  platformFeeAmount: string;
  netAmount: string;
  count: number;
};
export type OrganizerFinancialPending = { amount: string; count: number };
export type OrganizerEventFinancial = {
  eventId: string;
  realized: OrganizerFinancialAmounts;
  pending: OrganizerFinancialPending;
  reversed: OrganizerFinancialPending;
  refundPending: OrganizerFinancialPending;
  cancelled: { count: number };
  noCharge: { count: number };
  inconsistent: { count: number };
  tickets: Array<{
    ticketId: string | null;
    ticketName: string;
    realized: OrganizerFinancialAmounts;
    pending: OrganizerFinancialPending;
    reversed: OrganizerFinancialPending;
    inconsistent: { count: number };
  }>;
};
export type TicketOccupancy = {
  registered: number;
  sold: number;
  pending: number;
  total: number | null;
  remaining: number | null;
};
export type EventTicketOccupancy = {
  id: string;
  name: string;
  occupancy: TicketOccupancy;
};
export type EventTicketOccupancyPage = {
  tickets: EventTicketOccupancy[];
  occupancy: TicketOccupancy;
};

function isTicketOccupancy(value: unknown): value is TicketOccupancy {
  if (!value || typeof value !== "object") return false;
  const occupancy = value as TicketOccupancy;
  return typeof occupancy.registered === "number" &&
    typeof occupancy.sold === "number" &&
    typeof occupancy.pending === "number" &&
    (occupancy.total === null || typeof occupancy.total === "number") &&
    (occupancy.remaining === null || typeof occupancy.remaining === "number");
}

function isEventTicketOccupancy(value: unknown): value is EventTicketOccupancy {
  if (!value || typeof value !== "object") return false;
  const ticket = value as EventTicketOccupancy;
  return typeof ticket.id === "string" && typeof ticket.name === "string" &&
    isTicketOccupancy(ticket.occupancy);
}

const moneyPattern = /^-?\d+\.\d{2}$/;

function isMoney(value: unknown) {
  return typeof value === "string" && moneyPattern.test(value);
}

function isCount(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isFinancialAmounts(value: unknown): value is OrganizerFinancialAmounts {
  if (!value || typeof value !== "object") return false;
  const amounts = value as OrganizerFinancialAmounts;
  return isMoney(amounts.grossAmount) && isMoney(amounts.platformFeeAmount) &&
    isMoney(amounts.netAmount) && isCount(amounts.count);
}

function isFinancialPending(value: unknown): value is OrganizerFinancialPending {
  if (!value || typeof value !== "object") return false;
  const pending = value as OrganizerFinancialPending;
  return isMoney(pending.amount) && isCount(pending.count);
}

function isOrganizerEventFinancial(value: unknown): value is OrganizerEventFinancial {
  if (!value || typeof value !== "object") return false;
  const summary = value as OrganizerEventFinancial;
  return typeof summary.eventId === "string" && summary.eventId.length > 0 &&
    isFinancialAmounts(summary.realized) && isFinancialPending(summary.pending) &&
    isFinancialPending(summary.reversed) && isFinancialPending(summary.refundPending) &&
    isCount(summary.cancelled?.count) && isCount(summary.noCharge?.count) &&
    isCount(summary.inconsistent?.count) && Array.isArray(summary.tickets) &&
    summary.tickets.every((ticket) => ticket && typeof ticket.ticketName === "string" &&
      (ticket.ticketId === null || typeof ticket.ticketId === "string") &&
      isFinancialAmounts(ticket.realized) && isFinancialPending(ticket.pending) &&
      isFinancialPending(ticket.reversed) && isCount(ticket.inconsistent?.count));
}

function isEventTicketOccupancyPage(value: unknown): value is EventTicketOccupancyPage {
  if (!value || typeof value !== "object") return false;
  const page = value as EventTicketOccupancyPage;
  return Array.isArray(page.tickets) && page.tickets.every(isEventTicketOccupancy) &&
    isTicketOccupancy(page.occupancy);
}

export function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<Session>;
  return typeof data.user?.email === "string" && typeof data.user?.role === "string" &&
    typeof data.church?.name === "string" && typeof data.church?.status === "string";
}

export function readSession(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">): Session | null {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (isSession(value)) {
      const snapshot = { user: value.user, church: value.church };
      if ("token" in value) storage.setItem(SESSION_KEY, JSON.stringify(snapshot));
      return snapshot;
    }
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
  if (typeof window !== "undefined") return "";
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.NODE_ENV === "development") return "http://localhost:3002";
  throw new Error("O endereço da API de Eventos não foi configurado.");
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${apiBaseUrl()}${path}`, { ...init, headers, cache: "no-store", credentials: "include" });
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
  return {
    user: session.user,
    church: session.church
  };
}

export async function logout() {
  await fetch(`${apiBaseUrl()}/auth/logout`, {
    method: "POST",
    cache: "no-store",
    credentials: "include"
  }).catch(() => undefined);
}

export async function restoreSession(): Promise<Session | null> {
  try {
    const session = await request<Session>("/auth/session", {});
    if (!isSession(session)) {
      try { localStorage.removeItem(SESSION_KEY); } catch { /* Snapshot is not proof of access. */ }
      return null;
    }
    const snapshot = { user: session.user, church: session.church };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot)); } catch { /* Cookie remains the session. */ }
    return snapshot;
  } catch {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* Snapshot is not proof of access. */ }
    return null;
  }
}

export function listEvents(page: number, search: string, signal: AbortSignal) {
  const query = new URLSearchParams({ page: String(page), limit: "20" });
  if (search.trim()) query.set("search", search.trim());
  return request<EventPage>(`/api/events?${query}`, { signal });
}

export async function loadEventCover(eventId: string, signal: AbortSignal) {
  const response = await fetch(`${apiBaseUrl()}/api/events/${encodeURIComponent(eventId)}/cover`, {
    cache: "no-store", credentials: "include", signal
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new ApiError(response.status, "EVENT_COVER_UNAVAILABLE", "Capa indisponível.");
  return response.blob();
}

export async function getOrganizerEventFinancial(eventId: string, signal: AbortSignal) {
  const data = await request<unknown>(
    `/api/events/${encodeURIComponent(eventId)}/organizer-financial`,
    { signal }
  );
  if (!isOrganizerEventFinancial(data) || data.eventId !== eventId) {
    throw new Error("A API retornou uma resposta inválida.");
  }
  return data;
}

export async function listEventTickets(eventId: string, signal: AbortSignal) {
  const data = await request<unknown>(
    `/api/events/${encodeURIComponent(eventId)}/tickets?occupancy=1`,
    { signal }
  );
  if (!isEventTicketOccupancyPage(data)) {
    throw new Error("A API retornou uma resposta inválida.");
  }
  return {
    occupancy: data.occupancy,
    tickets: data.tickets.map((ticket) => ({
      id: ticket.id,
      name: ticket.name,
      occupancy: ticket.occupancy
    }))
  };
}

export function listRegistrations(
  eventId: string,
  page: number,
  search: string,
  signal: AbortSignal
) {
  const query = new URLSearchParams({ page: String(page), limit: "20" });
  if (search.trim()) query.set("search", search.trim());
  return request<RegistrationPage>(
    `/api/events/${encodeURIComponent(eventId)}/registrations?${query}`,
    { signal }
  );
}

export async function checkIn(eventId: string, code: string) {
  const result = await request<CheckInResult>("/api/events/registrations/check-in-token", {
    method: "POST", body: JSON.stringify({ eventId, checkInToken: code.trim() }),
  });
  if (result.status !== "CHECKED_IN" || result.event?.id !== eventId || !result.id) {
    throw new Error("Não foi possível confirmar o check-in. Confira a inscrição antes de tentar novamente.");
  }
  return result;
}
