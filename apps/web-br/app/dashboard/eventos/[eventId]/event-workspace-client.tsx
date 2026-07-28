"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type LoginSession = {
  token: string;
};

type RegistrationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "CHECKED_IN";

type EventDetail = {
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
  church: {
    name: string;
    slug: string;
  };
  registrations: Array<{
    id: string;
    status: RegistrationStatus;
    paymentStatus: string;
    checkedInAt: string | null;
    waitlistedAt: string | null;
  }>;
};

type ApiErrorResponse = {
  message?: string;
};

type EventWorkspaceClientProps = {
  eventId: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3333";

const WEB_BASE_URL =
  process.env.NEXT_PUBLIC_WEB_BASE_URL ?? "http://localhost:3000";

const EVENTS_APP_BASE_URL =
  process.env.NEXT_PUBLIC_EVENTS_APP_BASE_URL ?? "http://localhost:3001";

function getSessionToken() {
  const storedSession = localStorage.getItem("sistema-igrejas.session");

  if (!storedSession) {
    return null;
  }

  try {
    const session = JSON.parse(storedSession) as LoginSession;

    return session.token;
  } catch {
    localStorage.removeItem("sistema-igrejas.session");
    return null;
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatMoney(value: string | number) {
  const numberValue =
    typeof value === "string" ? Number(value) : value;

  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency"
  }).format(Number.isFinite(numberValue) ? numberValue : 0);
}

export function EventWorkspaceClient({
  eventId
}: EventWorkspaceClientProps) {
  const router = useRouter();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const statistics = useMemo(() => {
    const registrations = event?.registrations ?? [];

    return {
      active: registrations.filter(
        (registration) => registration.status !== "CANCELLED"
      ).length,
      checkedIn: registrations.filter(
        (registration) => registration.status === "CHECKED_IN"
      ).length,
      pendingPayments: registrations.filter(
        (registration) =>
          registration.paymentStatus === "PENDING" ||
          registration.paymentStatus === "WAITING_PAYMENT"
      ).length,
      waitlisted: registrations.filter(
        (registration) => registration.waitlistedAt
      ).length
    };
  }, [event]);

  useEffect(() => {
    async function loadEvent() {
      const token = getSessionToken();

      if (!token) {
        router.replace("/login");
        return;
      }

      setError(null);
      setIsLoading(true);

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/events/${eventId}`,
          {
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        if (!response.ok) {
          const data = await response.json() as ApiErrorResponse;

          setError(
            data.message ?? "Não foi possível carregar este evento."
          );
          return;
        }

        const data = await response.json() as EventDetail;

        setEvent(data);
      } catch {
        setError("Não foi possível carregar este evento agora.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadEvent();
  }, [eventId, router]);

  const publicRegistrationUrl = event
    ? `${WEB_BASE_URL}/eventos/${event.id}`
    : "#";

  const eventAppUrl = event
    ? `${EVENTS_APP_BASE_URL}/${encodeURIComponent(event.church.slug)}/${encodeURIComponent(event.slug)}`
    : "#";

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
      <section
        style={{
          display: "grid",
          gap: "24px",
          margin: "0 auto",
          maxWidth: "1180px"
        }}
      >
        <Link
          href="/dashboard/eventos"
          style={{
            color: "#93c5fd",
            fontSize: "14px",
            fontWeight: 800,
            textDecoration: "none"
          }}
        >
          Voltar para Eventos
        </Link>

        {isLoading ? (
          <p style={{ color: "#cbd5e1", margin: 0 }}>
            Carregando evento...
          </p>
        ) : null}

        {error ? (
          <section
            style={{
              background: "rgba(127, 29, 29, 0.32)",
              border: "1px solid rgba(248, 113, 113, 0.28)",
              borderRadius: "22px",
              padding: "22px"
            }}
          >
            <h1
              style={{
                color: "#ffffff",
                fontSize: "26px",
                margin: "0 0 8px"
              }}
            >
              Evento indisponível
            </h1>

            <p
              style={{
                color: "#fecaca",
                lineHeight: 1.6,
                margin: 0
              }}
            >
              {error}
            </p>
          </section>
        ) : null}

        {event ? (
          <>
            <header
              style={{
                alignItems: "flex-start",
                background:
                  "linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.78))",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                borderRadius: "28px",
                display: "flex",
                flexWrap: "wrap",
                gap: "20px",
                justifyContent: "space-between",
                padding: "28px"
              }}
            >
              <div>
                <p
                  style={{
                    color: "#60a5fa",
                    fontSize: "13px",
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    margin: "0 0 10px",
                    textTransform: "uppercase"
                  }}
                >
                  {event.church.name}
                </p>

                <h1
                  style={{
                    color: "#ffffff",
                    fontSize: "34px",
                    letterSpacing: "-0.04em",
                    margin: "0 0 10px"
                  }}
                >
                  {event.title}
                </h1>

                <p
                  style={{
                    color: "#cbd5e1",
                    lineHeight: 1.6,
                    margin: 0
                  }}
                >
                  {formatDate(event.date)}
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "10px"
                }}
              >
                <a
                  href={publicRegistrationUrl}
                  rel="noreferrer"
                  style={{
                    background: "rgba(15, 23, 42, 0.68)",
                    border: "1px solid rgba(148, 163, 184, 0.3)",
                    borderRadius: "14px",
                    color: "#e2e8f0",
                    fontSize: "14px",
                    fontWeight: 900,
                    padding: "12px 16px",
                    textDecoration: "none"
                  }}
                  target="_blank"
                >
                  Página de inscrição
                </a>

                <a
                  href={eventAppUrl}
                  rel="noreferrer"
                  style={{
                    background: "#2563eb",
                    borderRadius: "14px",
                    color: "#ffffff",
                    fontSize: "14px",
                    fontWeight: 900,
                    padding: "12px 16px",
                    textDecoration: "none"
                  }}
                  target="_blank"
                >
                  Abrir aplicativo
                </a>
              </div>
            </header>

            <nav
              style={{
                background: "rgba(15, 23, 42, 0.72)",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                borderRadius: "18px",
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                padding: "10px"
              }}
            >
              <a
                href="#visao-geral"
                style={{
                  background: "#2563eb",
                  borderRadius: "12px",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: 900,
                  padding: "10px 14px",
                  textDecoration: "none"
                }}
              >
                Visão geral
              </a>

              <a
                href="#aplicativo-do-evento"
                style={{
                  borderRadius: "12px",
                  color: "#cbd5e1",
                  fontSize: "14px",
                  fontWeight: 900,
                  padding: "10px 14px",
                  textDecoration: "none"
                }}
              >
                Aplicativo do Evento
              </a>
            </nav>

            <section
              id="visao-geral"
              style={{
                display: "grid",
                gap: "16px",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(190px, 1fr))"
              }}
            >
              <article
                style={{
                  background: "rgba(15, 23, 42, 0.82)",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  borderRadius: "20px",
                  padding: "20px"
                }}
              >
                <strong style={{ color: "#94a3b8", fontSize: "13px" }}>
                  Inscrições
                </strong>

                <p
                  style={{
                    color: "#ffffff",
                    fontSize: "28px",
                    fontWeight: 900,
                    margin: "10px 0 0"
                  }}
                >
                  {statistics.active}/{event.capacity}
                </p>
              </article>

              <article
                style={{
                  background: "rgba(15, 23, 42, 0.82)",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  borderRadius: "20px",
                  padding: "20px"
                }}
              >
                <strong style={{ color: "#94a3b8", fontSize: "13px" }}>
                  Check-ins
                </strong>

                <p
                  style={{
                    color: "#ffffff",
                    fontSize: "28px",
                    fontWeight: 900,
                    margin: "10px 0 0"
                  }}
                >
                  {statistics.checkedIn}
                </p>
              </article>

              <article
                style={{
                  background: "rgba(15, 23, 42, 0.82)",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  borderRadius: "20px",
                  padding: "20px"
                }}
              >
                <strong style={{ color: "#94a3b8", fontSize: "13px" }}>
                  Lista de espera
                </strong>

                <p
                  style={{
                    color: "#ffffff",
                    fontSize: "28px",
                    fontWeight: 900,
                    margin: "10px 0 0"
                  }}
                >
                  {statistics.waitlisted}
                </p>
              </article>

              <article
                style={{
                  background: "rgba(15, 23, 42, 0.82)",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  borderRadius: "20px",
                  padding: "20px"
                }}
              >
                <strong style={{ color: "#94a3b8", fontSize: "13px" }}>
                  Valor
                </strong>

                <p
                  style={{
                    color: "#ffffff",
                    fontSize: "24px",
                    fontWeight: 900,
                    margin: "10px 0 0"
                  }}
                >
                  {event.isPaid
                    ? formatMoney(event.price)
                    : "Gratuito"}
                </p>
              </article>
            </section>

            <section
              id="aplicativo-do-evento"
              style={{
                background:
                  "linear-gradient(135deg, rgba(30, 64, 175, 0.28), rgba(15, 23, 42, 0.86))",
                border: "1px solid rgba(96, 165, 250, 0.26)",
                borderRadius: "26px",
                display: "grid",
                gap: "18px",
                padding: "26px"
              }}
            >
              <div>
                <p
                  style={{
                    color: "#60a5fa",
                    fontSize: "13px",
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    margin: "0 0 8px",
                    textTransform: "uppercase"
                  }}
                >
                  Dentro deste evento
                </p>

                <h2
                  style={{
                    color: "#ffffff",
                    fontSize: "26px",
                    margin: "0 0 10px"
                  }}
                >
                  Aplicativo do Evento
                </h2>

                <p
                  style={{
                    color: "#cbd5e1",
                    lineHeight: 1.7,
                    margin: 0,
                    maxWidth: "760px"
                  }}
                >
                  Área do participante com credencial, QR Code,
                  programação, avisos, materiais e demais informações
                  deste evento.
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "12px"
                }}
              >
                <a
                  href={eventAppUrl}
                  rel="noreferrer"
                  style={{
                    background: "#2563eb",
                    borderRadius: "14px",
                    color: "#ffffff",
                    fontSize: "14px",
                    fontWeight: 900,
                    padding: "13px 18px",
                    textDecoration: "none"
                  }}
                  target="_blank"
                >
                  Visualizar aplicativo
                </a>

                <code
                  style={{
                    background: "rgba(2, 6, 23, 0.5)",
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                    borderRadius: "14px",
                    color: "#bfdbfe",
                    fontSize: "13px",
                    padding: "13px 16px",
                    wordBreak: "break-all"
                  }}
                >
                  /{event.church.slug}/{event.slug}
                </code>
              </div>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}
