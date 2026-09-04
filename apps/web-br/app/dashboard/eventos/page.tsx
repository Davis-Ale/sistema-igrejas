"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { DashboardAuthGuard } from "../dashboard-auth-guard";

type LoginSession = {
  token: string;
};

type EventListItem = {
  id: string;
  title: string;
  slug: string;
  date: string;
  capacity: number;
  price: string | number;
  isPublic: boolean;
  isPaid: boolean;
  publicRegistrationEnabled: boolean;
  waitlistEnabled: boolean;
  registrationCount?: number;
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3333";

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

function createSlug(title: string) {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export default function EventosPage() {
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [eventsResolved, setEventsResolved] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [capacity, setCapacity] = useState("50");
  const [price, setPrice] = useState("0");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const firstEvent = events[0];

    if (!firstEvent) {
      return;
    }

    window.location.replace(`/dashboard/eventos/${firstEvent.id}`);
  }, [events]);

  async function loadEvents() {
    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const eventsResponse = await fetch(`${API_BASE_URL}/api/events`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!eventsResponse.ok) {
        const data = (await eventsResponse.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível carregar os eventos.");
        return;
      }

      const eventsData = (await eventsResponse.json()) as EventListItem[];

      setEvents(eventsData);
    } catch {
      setError("Não foi possível carregar os dados de eventos agora.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    const slug = createSlug(title);

    if (!slug) {
      setError("Informe um título válido para gerar o slug do evento.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsCreating(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/events`, {
        body: JSON.stringify({
          capacity: Number(capacity),
          date: new Date(date).toISOString(),
          isPaid: Number(price) > 0,
          isPublic,
          price: Number(price),
          publicRegistrationEnabled: isPublic,
          slug,
          title,
          waitlistEnabled: true
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      const data = (await response.json()) as
        | { id: string }
        | ApiErrorResponse;

      if (!response.ok) {
        setError(
          "message" in data && data.message
            ? data.message
            : "Não foi possível cadastrar o evento."
        );
        return;
      }

      if (!("id" in data) || !data.id) {
        setError("Não foi possível cadastrar o evento.");
        return;
      }

      window.location.replace(`/dashboard/eventos/${data.id}`);
    } catch {
      setError("Não foi possível cadastrar o evento agora.");
    } finally {
      setIsCreating(false);
    }
  }

  useEffect(() => {
    let active = true;

    void loadEvents().finally(() => {
      if (active) {
        setEventsResolved(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  if (!eventsResolved || events.length > 0) {
    return (
      <DashboardAuthGuard>
        <main
          style={{
            alignItems: "center",
            background:
              "linear-gradient(135deg, #0f172a 0%, #020617 100%)",
            color: "#cbd5e1",
            display: "flex",
            justifyContent: "center",
            minHeight: "100vh"
          }}
        >
          Abrindo Eventos...
        </main>
      </DashboardAuthGuard>
    );
  }

  return (
    <DashboardAuthGuard>
      <main
        style={{
          background:
            "radial-gradient(circle at top left, rgba(59, 130, 246, 0.22), transparent 34%), linear-gradient(135deg, #0f172a 0%, #111827 45%, #020617 100%)",
          color: "#f8fafc",
          minHeight: "100vh",
          padding: "40px"
        }}
      >
        <section
          style={{
            background:
              "linear-gradient(135deg, rgba(15, 23, 42, 0.86), rgba(30, 41, 59, 0.74))",
            border: "1px solid rgba(148, 163, 184, 0.18)",
            borderRadius: "28px",
            boxShadow: "0 28px 90px rgba(2, 6, 23, 0.36)",
            display: "grid",
            gap: "28px",
            margin: "0 auto",
            maxWidth: "720px",
            padding: "28px"
          }}
        >
          <div>
            <Link
              href="/dashboard"
              style={{
                color: "#93c5fd",
                display: "inline-flex",
                fontSize: "14px",
                fontWeight: 800,
                marginBottom: "22px",
                textDecoration: "none"
              }}
            >
              Voltar ao painel
            </Link>

            <h1
              style={{
                color: "#ffffff",
                fontSize: "28px",
                margin: "0 0 8px"
              }}
            >
              Eventos
            </h1>

            <p
              style={{
                color: "#94a3b8",
                lineHeight: 1.6,
                margin: 0
              }}
            >
              Nenhum evento cadastrado ainda. Crie o primeiro para abrir o
              workspace.
            </p>
          </div>

          <form
            onSubmit={handleCreateEvent}
            style={{
              background: "rgba(15, 23, 42, 0.72)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "22px",
              display: "grid",
              gap: "16px",
              padding: "22px"
            }}
          >
            <h2
              style={{
                color: "#ffffff",
                fontSize: "20px",
                margin: 0
              }}
            >
              Cadastrar evento
            </h2>

            <div
              style={{
                display: "grid",
                gap: "14px",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
              }}
            >
              <label
                style={{
                  color: "#cbd5e1",
                  display: "grid",
                  fontSize: "14px",
                  fontWeight: 800,
                  gap: "8px"
                }}
              >
                Título
                <input
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  style={{
                    border: "1px solid rgba(148, 163, 184, 0.38)",
                    borderRadius: "14px",
                    font: "inherit",
                    padding: "13px 14px"
                  }}
                  type="text"
                  value={title}
                />
              </label>

              <label
                style={{
                  color: "#cbd5e1",
                  display: "grid",
                  fontSize: "14px",
                  fontWeight: 800,
                  gap: "8px"
                }}
              >
                Data e hora
                <input
                  onChange={(event) => setDate(event.target.value)}
                  required
                  style={{
                    border: "1px solid rgba(148, 163, 184, 0.38)",
                    borderRadius: "14px",
                    font: "inherit",
                    padding: "13px 14px"
                  }}
                  type="datetime-local"
                  value={date}
                />
              </label>

              <label
                style={{
                  color: "#cbd5e1",
                  display: "grid",
                  fontSize: "14px",
                  fontWeight: 800,
                  gap: "8px"
                }}
              >
                Capacidade
                <input
                  min="1"
                  onChange={(event) => setCapacity(event.target.value)}
                  required
                  style={{
                    border: "1px solid rgba(148, 163, 184, 0.38)",
                    borderRadius: "14px",
                    font: "inherit",
                    padding: "13px 14px"
                  }}
                  type="number"
                  value={capacity}
                />
              </label>

              <label
                style={{
                  color: "#cbd5e1",
                  display: "grid",
                  fontSize: "14px",
                  fontWeight: 800,
                  gap: "8px"
                }}
              >
                Valor
                <input
                  min="0"
                  onChange={(event) => setPrice(event.target.value)}
                  required
                  step="0.01"
                  style={{
                    border: "1px solid rgba(148, 163, 184, 0.38)",
                    borderRadius: "14px",
                    font: "inherit",
                    padding: "13px 14px"
                  }}
                  type="number"
                  value={price}
                />
              </label>

              <label
                style={{
                  alignItems: "center",
                  color: "#cbd5e1",
                  display: "flex",
                  fontSize: "14px",
                  fontWeight: 800,
                  gap: "10px",
                  paddingTop: "28px"
                }}
              >
                <input
                  checked={isPublic}
                  onChange={(event) => setIsPublic(event.target.checked)}
                  type="checkbox"
                />
                Evento público
              </label>
            </div>

            <button
              disabled={isCreating || isLoading}
              style={{
                background: "#2563eb",
                border: 0,
                borderRadius: "14px",
                color: "#ffffff",
                cursor:
                  isCreating || isLoading ? "not-allowed" : "pointer",
                font: "inherit",
                fontWeight: 900,
                justifySelf: "start",
                opacity: isCreating || isLoading ? 0.72 : 1,
                padding: "13px 18px"
              }}
              type="submit"
            >
              {isCreating ? "Cadastrando..." : "Cadastrar evento"}
            </button>
          </form>

          {error ? (
            <p
              style={{
                background: "rgba(239, 68, 68, 0.14)",
                border: "1px solid rgba(248, 113, 113, 0.26)",
                borderRadius: "14px",
                color: "#fecaca",
                fontSize: "14px",
                margin: 0,
                padding: "12px 14px"
              }}
            >
              {error}
            </p>
          ) : null}

          {successMessage ? (
            <p
              style={{
                background: "rgba(34, 197, 94, 0.14)",
                border: "1px solid rgba(74, 222, 128, 0.26)",
                borderRadius: "14px",
                color: "#bbf7d0",
                fontSize: "14px",
                margin: 0,
                padding: "12px 14px"
              }}
            >
              {successMessage}
            </p>
          ) : null}
        </section>
      </main>
    </DashboardAuthGuard>
  );
}
