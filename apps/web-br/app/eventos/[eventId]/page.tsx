"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

type ApiErrorResponse = {
  message?: string;
};

type PublicEvent = {
  id: string;
  title: string;
  date: string;
  capacity: number;
  price: string | number;
  isPaid: boolean;
  waitlistEnabled: boolean;
  registrations: {
    id: string;
    status: "PENDING" | "CONFIRMED" | "CANCELLED" | "CHECKED_IN";
    waitlistedAt: string | null;
  }[];
};

type PublicRegistration = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "CHECKED_IN";
  paymentStatus: string;
  checkInToken: string;
  waitlistedAt: string | null;
  event: {
    isPaid: boolean;
  };
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3333";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatMoney(value: string | number) {
  const numberValue = typeof value === "string" ? Number(value) : value;

  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency"
  }).format(Number.isFinite(numberValue) ? numberValue : 0);
}

function getSuccessMessage(registration: PublicRegistration) {
  if (registration.waitlistedAt) {
    return "Sua inscrição entrou na lista de espera.";
  }

  if (registration.event.isPaid) {
    return "Sua inscrição foi recebida e ficará pendente até a confirmação do pagamento.";
  }

  return "Sua inscrição foi confirmada.";
}

export default function PublicEventPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId;

  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [registration, setRegistration] = useState<PublicRegistration | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);

  const activeRegistrations = useMemo(() => {
    return event?.registrations.filter(
      (item) => item.status !== "CANCELLED" && !item.waitlistedAt
    ) ?? [];
  }, [event]);

  const waitlistRegistrations = useMemo(() => {
    return event?.registrations.filter(
      (item) => item.status !== "CANCELLED" && item.waitlistedAt
    ) ?? [];
  }, [event]);

  const availableSpots = event ? Math.max(event.capacity - activeRegistrations.length, 0) : 0;

  async function loadEvent() {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/public/events/${eventId}`, {
        cache: "no-store"
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível carregar este evento.");
        return;
      }

      const data = (await response.json()) as PublicEvent;

      setEvent(data);
    } catch {
      setError("Não foi possível carregar este evento agora.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegister(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();

    setError(null);
    setRegistration(null);
    setIsRegistering(true);

    try {
      const response = await fetch(`${API_BASE_URL}/public/events/${eventId}/register`, {
        body: JSON.stringify({
          email: email.trim() || undefined,
          name,
          phone
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível realizar a inscrição.");
        return;
      }

      const data = (await response.json()) as PublicRegistration;

      setRegistration(data);
      setName("");
      setPhone("");
      setEmail("");
      await loadEvent();
    } catch {
      setError("Não foi possível realizar a inscrição agora.");
    } finally {
      setIsRegistering(false);
    }
  }

  useEffect(() => {
    void loadEvent();
  }, [eventId]);

  return (
    <main
      style={{
        background:
          "radial-gradient(circle at top left, rgba(37, 99, 235, 0.24), transparent 34%), linear-gradient(135deg, #020617 0%, #0f172a 50%, #111827 100%)",
        color: "#f8fafc",
        minHeight: "100vh",
        padding: "32px"
      }}
    >
      <section style={{ display: "grid", gap: "22px", margin: "0 auto", maxWidth: "1040px" }}>
        <Link href="/" style={{ color: "#93c5fd", fontSize: "14px", fontWeight: 800, textDecoration: "none" }}>
          Voltar para o início
        </Link>

        {isLoading ? (
          <p style={{ color: "#cbd5e1", margin: 0 }}>Carregando evento...</p>
        ) : null}

        {!isLoading && error && !event ? (
          <section
            style={{
              background: "rgba(127, 29, 29, 0.32)",
              border: "1px solid rgba(248, 113, 113, 0.28)",
              borderRadius: "24px",
              padding: "28px"
            }}
          >
            <h1 style={{ color: "#ffffff", fontSize: "28px", margin: "0 0 10px" }}>
              Evento indisponível
            </h1>

            <p style={{ color: "#fecaca", lineHeight: 1.6, margin: 0 }}>{error}</p>
          </section>
        ) : null}

        {event ? (
          <section
            style={{
              display: "grid",
              gap: "22px",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))"
            }}
          >
            <article
              style={{
                background: "rgba(15, 23, 42, 0.86)",
                border: "1px solid rgba(148, 163, 184, 0.2)",
                borderRadius: "28px",
                boxShadow: "0 28px 90px rgba(2, 6, 23, 0.36)",
                display: "grid",
                gap: "18px",
                padding: "30px"
              }}
            >
              <p
                style={{
                  color: "#60a5fa",
                  fontSize: "13px",
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  margin: 0,
                  textTransform: "uppercase"
                }}
              >
                Inscrição pública
              </p>

              <h1
                style={{
                  color: "#ffffff",
                  fontSize: "40px",
                  letterSpacing: "-0.05em",
                  lineHeight: 1.05,
                  margin: 0
                }}
              >
                {event.title}
              </h1>

              <p style={{ color: "#cbd5e1", fontSize: "16px", lineHeight: 1.7, margin: 0 }}>
                Faça sua inscrição e guarde o código gerado para o check-in no dia do evento.
              </p>

              <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                <div style={{ background: "rgba(2, 6, 23, 0.42)", borderRadius: "18px", padding: "16px" }}>
                  <strong>Data</strong>
                  <p style={{ color: "#cbd5e1", margin: "8px 0 0" }}>{formatDate(event.date)}</p>
                </div>

                <div style={{ background: "rgba(2, 6, 23, 0.42)", borderRadius: "18px", padding: "16px" }}>
                  <strong>Valor</strong>
                  <p style={{ color: "#cbd5e1", margin: "8px 0 0" }}>
                    {event.isPaid ? formatMoney(event.price) : "Gratuito"}
                  </p>
                </div>

                <div style={{ background: "rgba(2, 6, 23, 0.42)", borderRadius: "18px", padding: "16px" }}>
                  <strong>Vagas</strong>
                  <p style={{ color: "#cbd5e1", margin: "8px 0 0" }}>
                    {availableSpots > 0 ? `${availableSpots} disponíveis` : "Lista de espera"}
                  </p>
                </div>
              </div>

              <p style={{ color: "#bfdbfe", fontSize: "14px", lineHeight: 1.6, margin: 0 }}>
                Inscrições confirmadas: {activeRegistrations.length}/{event.capacity}. Lista de espera:{" "}
                {event.waitlistEnabled ? waitlistRegistrations.length : "desativada"}.
              </p>
            </article>

            <aside
              style={{
                background: "rgba(15, 23, 42, 0.86)",
                border: "1px solid rgba(148, 163, 184, 0.2)",
                borderRadius: "28px",
                display: "grid",
                gap: "16px",
                padding: "24px"
              }}
            >
              <h2 style={{ color: "#ffffff", fontSize: "22px", margin: 0 }}>Fazer inscrição</h2>

              <form onSubmit={handleRegister} style={{ display: "grid", gap: "14px" }}>
                <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                  Nome completo
                  <input onChange={(item) => setName(item.target.value)} required style={{ borderRadius: "14px", font: "inherit", padding: "13px 14px" }} value={name} />
                </label>

                <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                  Telefone
                  <input onChange={(item) => setPhone(item.target.value)} required style={{ borderRadius: "14px", font: "inherit", padding: "13px 14px" }} type="tel" value={phone} />
                </label>

                <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                  E-mail
                  <input onChange={(item) => setEmail(item.target.value)} style={{ borderRadius: "14px", font: "inherit", padding: "13px 14px" }} type="email" value={email} />
                </label>

                <button
                  disabled={isRegistering}
                  style={{
                    background: "#2563eb",
                    border: 0,
                    borderRadius: "14px",
                    color: "#ffffff",
                    cursor: isRegistering ? "not-allowed" : "pointer",
                    font: "inherit",
                    fontWeight: 900,
                    opacity: isRegistering ? 0.72 : 1,
                    padding: "14px 18px"
                  }}
                  type="submit"
                >
                  {isRegistering ? "Enviando..." : "Confirmar inscrição"}
                </button>
              </form>

              {error ? (
                <p style={{ background: "rgba(239, 68, 68, 0.14)", borderRadius: "14px", color: "#fecaca", lineHeight: 1.6, margin: 0, padding: "12px 14px" }}>
                  {error}
                </p>
              ) : null}

              {registration ? (
                <section style={{ background: "rgba(34, 197, 94, 0.14)", borderRadius: "18px", display: "grid", gap: "10px", padding: "16px" }}>
                  <strong>Inscrição recebida</strong>
                  <p style={{ color: "#bbf7d0", lineHeight: 1.6, margin: 0 }}>{getSuccessMessage(registration)}</p>
                  <p style={{ color: "#ffffff", fontFamily: "monospace", fontWeight: 900, margin: 0, wordBreak: "break-all" }}>
                    {registration.checkInToken}
                  </p>
                </section>
              ) : null}
            </aside>
          </section>
        ) : null}
      </section>
    </main>
  );
}
