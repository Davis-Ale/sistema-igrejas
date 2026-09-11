"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { CreateEventModal } from "../create-event-modal";
import {
  EventModuleChrome,
  persistSelectedEventId,
  resolveAuthorizedSelectedEventId
} from "../event-module-chrome";

type LoginSession = {
  token: string;
};

type EventListItem = {
  id: string;
  title: string;
};

type EventFinancialSummary = {
  eventSales: {
    grossAmount: string | number;
    platformFeeAmount: string | number;
    netAmount: string | number;
  };
  counts: {
    paid: number;
    pending: number;
    cancelled: number;
    reversed: number;
  };
};

type EventFinancialTransaction = {
  id: string;
  eventId: string;
  eventTitle: string;
  participantName: string;
  ticketName: string | null;
  batchName: string | null;
  paymentLabel: string;
  method: "PIX" | "CARD" | "CASH" | "BOLETO";
  amount: string | number;
  grossAmount: number | null;
  platformFeeAmount: number | null;
  netAmount: number | null;
  at: string;
};

type EventFinancialListResponse = {
  items: EventFinancialTransaction[];
  pagination: {
    page: number;
    currentPage: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3333";

const PAGE_LIMIT = 50;

function getSessionToken() {
  const storedSession = localStorage.getItem("sistema-igrejas.session");

  if (!storedSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(storedSession) as LoginSession;

    return parsedSession.token;
  } catch {
    localStorage.removeItem("sistema-igrejas.session");
    return null;
  }
}

function formatMoney(value: string | number) {
  const numberValue =
    typeof value === "string" ? Number(value) : value;

  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency"
  }).format(Number.isFinite(numberValue) ? numberValue : 0);
}

function formatSnapshotAmount(value: number | null) {
  if (value == null) {
    return "—";
  }

  return formatMoney(value);
}

function formatDateTimeCompact(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function startOfDayIso(dateValue: string) {
  return new Date(`${dateValue}T00:00:00`).toISOString();
}

function endOfDayIso(dateValue: string) {
  return new Date(`${dateValue}T23:59:59.999`).toISOString();
}

function getMethodLabel(method: EventFinancialTransaction["method"]) {
  if (method === "PIX") {
    return "PIX";
  }

  if (method === "CARD") {
    return "Cartão";
  }

  if (method === "CASH") {
    return "Dinheiro";
  }

  if (method === "BOLETO") {
    return "Boleto";
  }

  return method;
}

function getPaymentTone(label: string): "success" | "warning" | "danger" | "muted" {
  if (label === "Pago") {
    return "success";
  }

  if (label === "Pendente" || label === "Reembolso em processamento") {
    return "warning";
  }

  if (
    label === "Cancelado" ||
    label === "Reembolsado"
  ) {
    return "danger";
  }

  return "muted";
}

function getToneStyles(tone: ReturnType<typeof getPaymentTone>) {
  if (tone === "success") {
    return {
      background: "rgba(6, 78, 59, 0.42)",
      color: "#a7f3d0"
    };
  }

  if (tone === "warning") {
    return {
      background: "rgba(120, 53, 15, 0.42)",
      color: "#fde68a"
    };
  }

  if (tone === "danger") {
    return {
      background: "rgba(127, 29, 29, 0.42)",
      color: "#fecaca"
    };
  }

  return {
    background: "rgba(15, 23, 42, 0.62)",
    color: "#cbd5e1"
  };
}

function getTicketLabel(item: EventFinancialTransaction) {
  if (item.ticketName && item.batchName) {
    return `${item.ticketName} • ${item.batchName}`;
  }

  if (item.ticketName || item.batchName) {
    return item.ticketName ?? item.batchName ?? "—";
  }

  return item.participantName === "Lançamento interno"
    ? "—"
    : "Sem ingresso";
}

type EventFinancialManagementClientProps = {
  fromEventId?: string;
};

export function EventFinancialManagementClient({
  fromEventId: _fromEventId = ""
}: EventFinancialManagementClientProps) {
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [summary, setSummary] = useState<EventFinancialSummary | null>(null);
  const [items, setItems] = useState<EventFinancialTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [eventId, setEventId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("ALL");
  const [method, setMethod] = useState("ALL");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState("");

  const hasActiveFilters = useMemo(
    () =>
      Boolean(search) ||
      Boolean(eventId) ||
      Boolean(from) ||
      Boolean(to) ||
      paymentStatus !== "ALL" ||
      method !== "ALL",
    [eventId, from, method, paymentStatus, search, to]
  );

  function buildFilterParams(includeListFilters = true) {
    const params = new URLSearchParams();

    if (eventId) {
      params.set("eventId", eventId);
    }

    if (from) {
      params.set("from", startOfDayIso(from));
    }

    if (to) {
      params.set("to", endOfDayIso(to));
    }

    if (method !== "ALL") {
      params.set("method", method);
    }

    if (includeListFilters && search) {
      params.set("search", search);
    }

    if (includeListFilters && paymentStatus !== "ALL") {
      params.set("paymentStatus", paymentStatus);
    }

    return params;
  }

  async function loadEvents(token: string) {
    const response = await fetch(`${API_BASE_URL}/api/events?limit=100`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const data = (await response.json()) as ApiErrorResponse;
      throw new Error(data.message ?? "Não foi possível carregar os eventos.");
    }

    const data = (await response.json()) as { items: EventListItem[] };
    const list = data.items ?? [];
    setEvents(list);
    setSelectedEventId((current) => {
      const nextId = resolveAuthorizedSelectedEventId(list, current);

      if (nextId) {
        persistSelectedEventId(nextId);
      }

      return nextId;
    });
  }

  async function loadFinancial(token: string, currentPage: number) {
    const summaryParams = buildFilterParams(false);
    const listParams = buildFilterParams(true);
    listParams.set("page", String(currentPage));
    listParams.set("limit", String(PAGE_LIMIT));

    const [summaryResponse, listResponse] = await Promise.all([
      fetch(
        `${API_BASE_URL}/api/events/financial/summary?${summaryParams.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      ),
      fetch(
        `${API_BASE_URL}/api/events/financial/transactions?${listParams.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )
    ]);

    if (!summaryResponse.ok) {
      const data = (await summaryResponse.json()) as ApiErrorResponse;
      throw new Error(
        data.message ?? "Não foi possível carregar o resumo financeiro."
      );
    }

    if (!listResponse.ok) {
      const data = (await listResponse.json()) as ApiErrorResponse;
      throw new Error(
        data.message ?? "Não foi possível carregar as movimentações."
      );
    }

    const summaryData = (await summaryResponse.json()) as EventFinancialSummary;
    const listData = (await listResponse.json()) as EventFinancialListResponse;

    setSummary(summaryData);
    setItems(listData.items);
    setTotal(listData.pagination.total);
    setTotalPages(listData.pagination.totalPages);
    setPage(listData.pagination.currentPage);
  }

  async function refresh(currentPage = page) {
    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      await Promise.all([
        events.length === 0 ? loadEvents(token) : Promise.resolve(),
        loadFinancial(token, currentPage)
      ]);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar a gestão financeira de eventos."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, from, to, paymentStatus, method, search]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  function handleClearFilters() {
    setSearchInput("");
    setSearch("");
    setEventId("");
    setFrom("");
    setTo("");
    setPaymentStatus("ALL");
    setMethod("ALL");
    setPage(1);
  }

  async function handleExport() {
    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      const params = buildFilterParams(true);
      const response = await fetch(
        `${API_BASE_URL}/api/events/financial/export?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;
        setError(data.message ?? "Não foi possível exportar o borderô.");
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10);
      link.href = objectUrl;
      link.download = `bordero-eventos-${today}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setError("Não foi possível exportar o borderô.");
    } finally {
      setIsExporting(false);
    }
  }

  const showingFrom =
    total === 0 ? 0 : (page - 1) * PAGE_LIMIT + 1;
  const showingTo = Math.min(page * PAGE_LIMIT, total);

  return (
    <main
      style={{
        background:
          "radial-gradient(circle at top left, rgba(37, 99, 235, 0.22), transparent 34%), linear-gradient(135deg, #020617 0%, #0f172a 50%, #111827 100%)",
        color: "#f8fafc",
        minHeight: "100vh",
        padding: "32px"
      }}
    >
      <style>{`
        .event-financial-summary-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .event-financial-count-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        .event-financial-filters {
          display: grid;
          gap: 14px;
        }
        .event-financial-filters-row {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(5, minmax(0, 1fr)) auto;
        }
        .event-financial-actions {
          align-items: end;
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }
        .event-financial-list-header,
        .event-financial-list-row {
          align-items: start;
          display: grid;
          gap: 12px;
          grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 0.9fr) minmax(0, 0.6fr) minmax(0, 0.8fr) minmax(0, 0.7fr) minmax(0, 0.8fr) minmax(0, 0.8fr);
        }
        .event-financial-list-header {
          border-bottom: 1px solid rgba(148, 163, 184, 0.16);
          color: #94a3b8;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
          padding: 0 2px 10px;
          text-transform: uppercase;
        }
        .event-financial-list-row {
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
          padding: 14px 2px;
        }
        .event-financial-col-label {
          display: none;
        }
        .event-financial-filter-label {
          color: #94a3b8;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .event-financial-control {
          background: #0f172a;
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 10px;
          color: #ffffff;
          font: inherit;
          min-width: 0;
          padding: 10px 12px;
          width: 100%;
        }
        @media (max-width: 980px) {
          .event-financial-summary-grid,
          .event-financial-count-grid,
          .event-financial-filters-row {
            grid-template-columns: 1fr;
          }
          .event-financial-list-header {
            display: none;
          }
          .event-financial-list-row {
            grid-template-columns: 1fr;
          }
          .event-financial-col-label {
            color: #64748b;
            display: inline;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.04em;
            margin-right: 6px;
            text-transform: uppercase;
          }
        }
      `}</style>

      <section
        style={{
          display: "grid",
          gap: "24px",
          margin: "0 auto",
          maxWidth: "1180px"
        }}
      >
        <EventModuleChrome
          header={
            <header
              style={{
                background:
                  "linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.78))",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                borderRadius: "28px",
                padding: "28px"
              }}
            >
              <p
                style={{
                  color: "#60a5fa",
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  margin: "0 0 4px",
                  textTransform: "uppercase"
                }}
              >
                Eventos
              </p>
              <h1
                style={{
                  fontSize: "28px",
                  fontWeight: 800,
                  margin: 0
                }}
              >
                Gestão financeira de eventos
              </h1>
              <p
                style={{
                  color: "#94a3b8",
                  fontSize: "14px",
                  margin: "8px 0 0"
                }}
              >
                Movimentações de todos os eventos desta igreja.
              </p>
            </header>
          }
          events={events}
          onCreateEvent={() => setIsCreateModalOpen(true)}
          onSelectedEventIdChange={(nextEventId) => {
            persistSelectedEventId(nextEventId);
            setSelectedEventId(nextEventId);
          }}
          productActive="financial"
          selectedEventId={selectedEventId}
          variant="product"
        >
        {isLoading ? (
          <p style={{ color: "#cbd5e1", margin: 0 }}>
            Carregando gestão financeira...
          </p>
        ) : null}

        {error ? (
          <div
            style={{
              background: "rgba(127, 29, 29, 0.28)",
              border: "1px solid rgba(248, 113, 113, 0.28)",
              borderRadius: "12px",
              color: "#fecaca",
              fontSize: "14px",
              lineHeight: 1.5,
              padding: "12px 14px"
            }}
          >
            {error}
          </div>
        ) : null}

        {!isLoading && !error && summary ? (
          <>
            <div className="event-financial-summary-grid">
              {(
                [
                  {
                    label: "Valor bruto",
                    value: formatMoney(summary.eventSales.grossAmount),
                    color: "#a7f3d0"
                  },
                  {
                    label: "Taxa da plataforma",
                    value: formatMoney(summary.eventSales.platformFeeAmount),
                    color: "#fca5a5"
                  },
                  {
                    label: "Valor líquido",
                    value: formatMoney(summary.eventSales.netAmount),
                    color: "#e2e8f0"
                  }
                ] as const
              ).map((card) => (
                <article
                  key={card.label}
                  style={{
                    background: "rgba(15, 23, 42, 0.55)",
                    border: "1px solid rgba(148, 163, 184, 0.16)",
                    borderRadius: "12px",
                    padding: "12px 14px"
                  }}
                >
                  <strong
                    style={{
                      color: "#94a3b8",
                      fontSize: "11px",
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase"
                    }}
                  >
                    {card.label}
                  </strong>
                  <p
                    style={{
                      color: card.color,
                      fontSize: "22px",
                      fontWeight: 800,
                      letterSpacing: "-0.02em",
                      margin: "6px 0 0"
                    }}
                  >
                    {card.value}
                  </p>
                </article>
              ))}
            </div>

            <div className="event-financial-count-grid">
              {(
                [
                  { label: "Pagos", value: summary.counts.paid },
                  { label: "Pendentes", value: summary.counts.pending },
                  { label: "Cancelados", value: summary.counts.cancelled },
                  { label: "Estornados", value: summary.counts.reversed }
                ] as const
              ).map((card) => (
                <article
                  key={card.label}
                  style={{
                    background: "rgba(15, 23, 42, 0.55)",
                    border: "1px solid rgba(148, 163, 184, 0.16)",
                    borderRadius: "12px",
                    padding: "12px 14px"
                  }}
                >
                  <strong
                    style={{
                      color: "#94a3b8",
                      fontSize: "11px",
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase"
                    }}
                  >
                    {card.label}
                  </strong>
                  <p
                    style={{
                      color: "#e2e8f0",
                      fontSize: "22px",
                      fontWeight: 800,
                      margin: "6px 0 0"
                    }}
                  >
                    {card.value}
                  </p>
                </article>
              ))}
            </div>
          </>
        ) : null}

        <section
          style={{
            background: "rgba(15, 23, 42, 0.42)",
            border: "1px solid rgba(148, 163, 184, 0.16)",
            borderRadius: "22px",
            display: "grid",
            gap: "18px",
            padding: "22px"
          }}
        >
          <div className="event-financial-filters">
            <form
              onSubmit={handleSearch}
              style={{
                display: "grid",
                gap: "10px",
                gridTemplateColumns: "1fr auto"
              }}
            >
              <label className="event-financial-filter-field" htmlFor="event-financial-search">
                <span className="event-financial-filter-label">
                  Buscar movimentações
                </span>
                <input
                  className="event-financial-control"
                  id="event-financial-search"
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Participante, e-mail, telefone, ingresso ou evento"
                  type="search"
                  value={searchInput}
                />
              </label>
              <button
                style={{
                  alignSelf: "end",
                  background: "#2563eb",
                  border: 0,
                  borderRadius: "10px",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontWeight: 800,
                  padding: "10px 16px"
                }}
                type="submit"
              >
                Pesquisar
              </button>
            </form>

            <div className="event-financial-filters-row">
              <label className="event-financial-filter-field">
                <span className="event-financial-filter-label">Evento</span>
                <select
                  className="event-financial-control"
                  onChange={(event) => {
                    setEventId(event.target.value);
                    setPage(1);
                  }}
                  value={eventId}
                >
                  <option value="">Todos os eventos</option>
                  {events.map((eventItem) => (
                    <option key={eventItem.id} value={eventItem.id}>
                      {eventItem.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="event-financial-filter-field">
                <span className="event-financial-filter-label">De</span>
                <input
                  className="event-financial-control"
                  onChange={(event) => {
                    setFrom(event.target.value);
                    setPage(1);
                  }}
                  type="date"
                  value={from}
                />
              </label>

              <label className="event-financial-filter-field">
                <span className="event-financial-filter-label">Até</span>
                <input
                  className="event-financial-control"
                  onChange={(event) => {
                    setTo(event.target.value);
                    setPage(1);
                  }}
                  type="date"
                  value={to}
                />
              </label>

              <label className="event-financial-filter-field">
                <span className="event-financial-filter-label">Status</span>
                <select
                  className="event-financial-control"
                  onChange={(event) => {
                    setPaymentStatus(event.target.value);
                    setPage(1);
                  }}
                  value={paymentStatus}
                >
                  <option value="ALL">Todos os status</option>
                  <option value="PAID">Pago</option>
                  <option value="PENDING">Pendente</option>
                  <option value="NO_CHARGE">Sem cobrança</option>
                  <option value="REFUND_PENDING">
                    Reembolso em processamento
                  </option>
                  <option value="CANCELLED">Cancelado</option>
                  <option value="REFUNDED">Reembolsado</option>
                </select>
              </label>

              <label className="event-financial-filter-field">
                <span className="event-financial-filter-label">Método</span>
                <select
                  className="event-financial-control"
                  onChange={(event) => {
                    setMethod(event.target.value);
                    setPage(1);
                  }}
                  value={method}
                >
                  <option value="ALL">Todos</option>
                  <option value="PIX">PIX</option>
                  <option value="CARD">Cartão</option>
                </select>
              </label>

              <div className="event-financial-actions">
                <button
                  onClick={handleClearFilters}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(148, 163, 184, 0.28)",
                    borderRadius: "10px",
                    color: "#e2e8f0",
                    cursor: "pointer",
                    fontWeight: 800,
                    padding: "10px 14px",
                    whiteSpace: "nowrap"
                  }}
                  type="button"
                >
                  Limpar filtros
                </button>
                <button
                  disabled={isExporting}
                  onClick={() => {
                    void handleExport();
                  }}
                  style={{
                    background: "#2563eb",
                    border: 0,
                    borderRadius: "10px",
                    color: "#ffffff",
                    cursor: isExporting ? "not-allowed" : "pointer",
                    fontWeight: 800,
                    padding: "10px 14px",
                    whiteSpace: "nowrap"
                  }}
                  type="button"
                >
                  {isExporting ? "Exportando..." : "Exportar borderô"}
                </button>
              </div>
            </div>
          </div>

          {!isLoading && !error && items.length === 0 ? (
            <p style={{ color: "#94a3b8", margin: 0 }}>
              {hasActiveFilters
                ? "Nenhuma movimentação encontrada para estes filtros."
                : "Nenhuma movimentação de eventos."}
            </p>
          ) : null}

          {!isLoading && !error && items.length > 0 ? (
            <div style={{ display: "grid", gap: 0 }}>
              <div className="event-financial-list-header">
                <span>Evento</span>
                <span>Participante / origem</span>
                <span>Ingresso / lote</span>
                <span>Pagamento / status</span>
                <span>Método</span>
                <span>Valor bruto</span>
                <span>Taxa</span>
                <span>Valor líquido</span>
                <span>Data</span>
              </div>

              {items.map((item) => {
                const tone = getPaymentTone(item.paymentLabel);

                return (
                  <div className="event-financial-list-row" key={item.id}>
                    <span>
                      <span className="event-financial-col-label">Evento</span>
                      <Link
                        href={`/dashboard/eventos/${item.eventId}`}
                        style={{
                          color: "#93c5fd",
                          fontSize: "14px",
                          fontWeight: 700,
                          textDecoration: "none"
                        }}
                      >
                        {item.eventTitle || "Evento"}
                      </Link>
                    </span>
                    <span>
                      <span className="event-financial-col-label">
                        Participante / origem
                      </span>
                      <strong
                        style={{
                          color: "#ffffff",
                          fontSize: "14px",
                          fontWeight: 700
                        }}
                      >
                        {item.participantName}
                      </strong>
                    </span>
                    <span style={{ color: "#e2e8f0", fontSize: "13px" }}>
                      <span className="event-financial-col-label">
                        Ingresso / lote
                      </span>
                      {getTicketLabel(item)}
                    </span>
                    <span>
                      <span className="event-financial-col-label">
                        Pagamento / status
                      </span>
                      <span
                        style={{
                          borderRadius: "999px",
                          display: "inline-flex",
                          fontSize: "11px",
                          fontWeight: 800,
                          padding: "3px 8px",
                          ...getToneStyles(tone)
                        }}
                      >
                        {item.paymentLabel}
                      </span>
                    </span>
                    <span style={{ color: "#e2e8f0", fontSize: "13px" }}>
                      <span className="event-financial-col-label">Método</span>
                      {getMethodLabel(item.method)}
                    </span>
                    <span
                      style={{
                        color: "#a7f3d0",
                        fontSize: "14px",
                        fontWeight: 800
                      }}
                    >
                      <span className="event-financial-col-label">
                        Valor bruto
                      </span>
                      {formatSnapshotAmount(item.grossAmount)}
                    </span>
                    <span
                      style={{
                        color: "#fca5a5",
                        fontSize: "14px",
                        fontWeight: 800
                      }}
                    >
                      <span className="event-financial-col-label">Taxa</span>
                      {formatSnapshotAmount(item.platformFeeAmount)}
                    </span>
                    <span
                      style={{
                        color: "#e2e8f0",
                        fontSize: "14px",
                        fontWeight: 800
                      }}
                    >
                      <span className="event-financial-col-label">
                        Valor líquido
                      </span>
                      {formatSnapshotAmount(item.netAmount)}
                    </span>
                    <span style={{ color: "#cbd5e1", fontSize: "13px" }}>
                      <span className="event-financial-col-label">Data</span>
                      {formatDateTimeCompact(item.at)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}

          {!isLoading && !error && total > 0 ? (
            <div style={{ display: "grid", gap: "10px" }}>
              <div
                style={{
                  alignItems: "center",
                  display: "flex",
                  gap: "12px",
                  justifyContent: "space-between"
                }}
              >
                <button
                  disabled={isLoading || page <= 1}
                  onClick={() => {
                    const nextPage = Math.max(1, page - 1);
                    setPage(nextPage);
                    void refresh(nextPage);
                  }}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(148, 163, 184, 0.28)",
                    borderRadius: "10px",
                    color: "#e2e8f0",
                    cursor: page <= 1 ? "not-allowed" : "pointer",
                    fontWeight: 800,
                    padding: "10px 14px"
                  }}
                  type="button"
                >
                  Anterior
                </button>
                <span style={{ color: "#94a3b8", fontSize: "13px" }}>
                  Página {page} de {Math.max(totalPages, 1)}
                </span>
                <button
                  disabled={isLoading || page >= totalPages}
                  onClick={() => {
                    const nextPage = page + 1;
                    setPage(nextPage);
                    void refresh(nextPage);
                  }}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(148, 163, 184, 0.28)",
                    borderRadius: "10px",
                    color: "#e2e8f0",
                    cursor:
                      page >= totalPages ? "not-allowed" : "pointer",
                    fontWeight: 800,
                    padding: "10px 14px"
                  }}
                  type="button"
                >
                  Próxima
                </button>
              </div>
              <p
                style={{
                  color: "#64748b",
                  fontSize: "12px",
                  margin: 0
                }}
              >
                Mostrando {showingFrom.toLocaleString("pt-BR")}
                –
                {showingTo.toLocaleString("pt-BR")} de{" "}
                {total.toLocaleString("pt-BR")} movimentações
              </p>
            </div>
          ) : null}
        </section>
        </EventModuleChrome>
      </section>

      <CreateEventModal
        onClose={() => setIsCreateModalOpen(false)}
        open={isCreateModalOpen}
      />
    </main>
  );
}
