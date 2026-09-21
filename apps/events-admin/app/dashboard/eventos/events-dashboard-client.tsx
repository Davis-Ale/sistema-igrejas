"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { CreateEventModal } from "./create-event-modal";
import {
  EventModuleChrome,
  persistSelectedEventId,
  resolveAuthorizedSelectedEventId,
  type EventModuleEventOption
} from "./event-module-chrome";

type LoginSession = {
  token: string;
};

type EventListItem = {
  id: string;
  title: string;
  date: string;
  capacity: number;
  isPublic: boolean;
  registrationCount: number;
};

type EventListResponse = {
  items: EventListItem[];
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

function formatDateTimeCompact(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export function EventsDashboardClient({
  openCreateEvent = false
}: {
  openCreateEvent?: boolean;
}) {
  const [items, setItems] = useState<EventListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [navEvents, setNavEvents] = useState<EventModuleEventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");

  function openCreateEventModal() {
    setIsCreateModalOpen(true);
  }

  useEffect(() => {
    if (!openCreateEvent) {
      return;
    }

    openCreateEventModal();
  }, [openCreateEvent]);

  async function loadEvents(currentPage: number, currentSearch = search) {
    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", String(PAGE_LIMIT));

      if (currentSearch) {
        params.set("search", currentSearch);
      }

      const response = await fetch(
        `${API_BASE_URL}/api/events?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;
        setError(data.message ?? "Não foi possível carregar os eventos.");
        return;
      }

      const data = (await response.json()) as EventListResponse;

      setItems(data.items ?? []);
      setTotal(data.pagination.total);
      setTotalPages(data.pagination.totalPages);
      setPage(data.pagination.currentPage);
    } catch {
      setError("Não foi possível carregar os eventos agora.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents(1, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    async function loadNavEvents() {
      const token = getSessionToken();

      if (!token) {
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/events?limit=100`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as {
          items: EventModuleEventOption[];
        };
        const list = (data.items ?? []).map((item) => ({
          id: item.id,
          title: item.title
        }));

        setNavEvents(list);
        setSelectedEventId((current) => {
          const nextId = resolveAuthorizedSelectedEventId(list, current);

          if (nextId) {
            persistSelectedEventId(nextId);
          }

          return nextId;
        });
      } catch {
        return;
      }
    }

    void loadNavEvents();
  }, []);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_LIMIT + 1;
  const showingTo = Math.min(page * PAGE_LIMIT, total);
  const hasSearch = Boolean(search);

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
        .events-dashboard-list-header,
        .events-dashboard-list-row {
          align-items: start;
          display: grid;
          gap: 12px;
          grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.8fr) minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 0.7fr);
        }
        .events-dashboard-list-header {
          border-bottom: 1px solid rgba(148, 163, 184, 0.16);
          color: #94a3b8;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
          padding: 0 2px 10px;
          text-transform: uppercase;
        }
        .events-dashboard-list-row {
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
          padding: 14px 2px;
        }
        .events-dashboard-col-label {
          display: none;
        }
        .events-dashboard-search {
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
          .events-dashboard-list-header {
            display: none;
          }
          .events-dashboard-list-row {
            grid-template-columns: 1fr;
          }
          .events-dashboard-col-label {
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
          margin: 0,
          width: "100%",
          minWidth: 0
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
                Meus eventos
              </h1>
              <p
                style={{
                  color: "#94a3b8",
                  fontSize: "14px",
                  margin: "8px 0 0"
                }}
              >
                Eventos desta igreja. Abra um item para gerenciar.
              </p>
            </header>
          }
          events={navEvents}
          onCreateEvent={openCreateEventModal}
          onSelectedEventIdChange={(nextEventId) => {
            persistSelectedEventId(nextEventId);
            setSelectedEventId(nextEventId);
          }}
          productActive="events"
          selectedEventId={selectedEventId}
          variant="product"
        >
          <form
            onSubmit={handleSearch}
            style={{
              display: "grid",
              gap: "10px",
              gridTemplateColumns: "1fr auto"
            }}
          >
            <label
              htmlFor="events-dashboard-search"
              style={{
                display: "grid",
                gap: "8px"
              }}
            >
              <span
                style={{
                  color: "#94a3b8",
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase"
                }}
              >
                Buscar eventos
              </span>
              <input
                className="events-dashboard-search"
                id="events-dashboard-search"
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={"Buscar por título"}
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

          {isLoading ? (
            <p style={{ color: "#cbd5e1", margin: 0 }}>
              Carregando eventos...
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

          {!isLoading && !error && items.length === 0 ? (
            <div
              style={{
                display: "grid",
                gap: "14px",
                justifyItems: "start"
              }}
            >
              <p style={{ color: "#94a3b8", margin: 0 }}>
                {hasSearch
                  ? "Nenhum evento encontrado."
                  : "Nenhum evento cadastrado ainda."}
              </p>
              {!hasSearch ? (
                <button
                  onClick={openCreateEventModal}
                  style={{
                    background: "#2563eb",
                    border: 0,
                    borderRadius: "12px",
                    color: "#ffffff",
                    cursor: "pointer",
                    fontWeight: 900,
                    padding: "12px 18px"
                  }}
                  type="button"
                >
                  Criar evento
                </button>
              ) : null}
            </div>
          ) : null}

          {!isLoading && !error && items.length > 0 ? (
            <div style={{ display: "grid", gap: 0 }}>
              <div className="events-dashboard-list-header">
                <span>Status</span>
                <span>Evento</span>
                <span>Quando</span>
                <span>Inscrições</span>
                <span>Ação</span>
              </div>

              {items.map((item) => {
                const filled =
                  item.capacity > 0
                    ? Math.min(
                        100,
                        (item.registrationCount / item.capacity) * 100
                      )
                    : 0;

                return (
                  <div className="events-dashboard-list-row" key={item.id}>
                    <span>
                      <span className="events-dashboard-col-label">Status</span>
                      <span
                        style={{
                          background: item.isPublic
                            ? "rgba(6, 78, 59, 0.42)"
                            : "rgba(15, 23, 42, 0.62)",
                          borderRadius: "999px",
                          color: item.isPublic ? "#a7f3d0" : "#cbd5e1",
                          display: "inline-flex",
                          fontSize: "11px",
                          fontWeight: 800,
                          padding: "3px 8px"
                        }}
                      >
                        {item.isPublic ? "Público" : "Rascunho"}
                      </span>
                    </span>
                    <span>
                      <span className="events-dashboard-col-label">Evento</span>
                      <strong
                        style={{
                          color: "#ffffff",
                          fontSize: "14px",
                          fontWeight: 700
                        }}
                      >
                        {item.title}
                      </strong>
                    </span>
                    <span style={{ color: "#cbd5e1", fontSize: "13px" }}>
                      <span className="events-dashboard-col-label">Quando</span>
                      {formatDateTimeCompact(item.date)}
                    </span>
                    <span>
                      <span className="events-dashboard-col-label">
                        Inscrições
                      </span>
                      <span
                        style={{
                          color: "#e2e8f0",
                          display: "grid",
                          fontSize: "13px",
                          fontWeight: 700,
                          gap: "6px"
                        }}
                      >
                        {item.registrationCount} / {item.capacity}
                        <span
                          style={{
                            background: "rgba(148, 163, 184, 0.18)",
                            borderRadius: "999px",
                            display: "block",
                            height: "4px",
                            overflow: "hidden"
                          }}
                        >
                          <span
                            style={{
                              background: "#2563eb",
                              display: "block",
                              height: "4px",
                              width: `${filled}%`
                            }}
                          />
                        </span>
                      </span>
                    </span>
                    <span>
                      <span className="events-dashboard-col-label">Ação</span>
                      <Link
                        href={`/dashboard/eventos/${item.id}`}
                        onClick={() => persistSelectedEventId(item.id)}
                        style={{
                          color: "#93c5fd",
                          fontSize: "14px",
                          fontWeight: 800,
                          textDecoration: "none"
                        }}
                      >
                        Gerenciar
                      </Link>
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
                    void loadEvents(nextPage);
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
                    void loadEvents(nextPage);
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
                {total.toLocaleString("pt-BR")}
              </p>
            </div>
          ) : null}
        </EventModuleChrome>
      </section>

      <CreateEventModal
        onClose={() => setIsCreateModalOpen(false)}
        open={isCreateModalOpen}
      />
    </main>
  );
}
