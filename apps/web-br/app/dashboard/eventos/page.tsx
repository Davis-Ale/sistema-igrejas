"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { DashboardAuthGuard } from "../dashboard-auth-guard";

type LoginSession = {
  token: string;
};

type RegistrationStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "CHECKED_IN";

type ParticipantType = "member" | "visitor";

type Participant = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
};

type Member = Participant;

type Visitor = Participant;

type EventSummary = {
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
  registrations: Array<{
    id: string;
    status: RegistrationStatus;
    checkedInAt: string | null;
    person: Participant | null;
    visitor: Participant | null;
  }>;
  trailStage: {
    id: string;
    label: string;
  } | null;
};

type EventDetail = Omit<EventSummary, "registrations"> & {
  registrations: Array<{
    id: string;
    status: RegistrationStatus;
    checkedInAt: string | null;
    person: Participant | null;
    visitor: Participant | null;
  }>;
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3333";

const statusLabels: Record<RegistrationStatus, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
  CHECKED_IN: "Check-in realizado"
};

const participantTypeLabels: Record<ParticipantType, string> = {
  member: "Membro",
  visitor: "Visitante"
};

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
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

function getRegistrationParticipant(registration: {
  person: Participant | null;
  visitor: Participant | null;
}) {
  return registration.person ?? registration.visitor;
}

function getRegistrationParticipantType(registration: {
  person: Participant | null;
  visitor: Participant | null;
}) {
  return registration.person ? "Membro" : "Visitante";
}

export default function EventosPage() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<EventDetail | null>(null);
  const [participantType, setParticipantType] = useState<ParticipantType>("member");
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [capacity, setCapacity] = useState("50");
  const [price, setPrice] = useState("0");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const selectedEventSummary = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  const selectableParticipants = participantType === "member" ? members : visitors;

  async function loadEventsMembersAndVisitors() {
    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const [eventsResponse, membersResponse, visitorsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/events`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }),
        fetch(`${API_BASE_URL}/api/members`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }),
        fetch(`${API_BASE_URL}/api/visitors`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })
      ]);

      if (!eventsResponse.ok) {
        const data = (await eventsResponse.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível carregar os eventos.");
        return;
      }

      if (!membersResponse.ok) {
        const data = (await membersResponse.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível carregar os membros.");
        return;
      }

      if (!visitorsResponse.ok) {
        const data = (await visitorsResponse.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível carregar os visitantes.");
        return;
      }

      const eventsData = (await eventsResponse.json()) as EventSummary[];
      const membersData = (await membersResponse.json()) as Member[];
      const visitorsData = (await visitorsResponse.json()) as Visitor[];

      setEvents(eventsData);
      setMembers(membersData);
      setVisitors(visitorsData);

      const firstEvent = eventsData[0];

      if (!selectedEventId && firstEvent) {
        setSelectedEventId(firstEvent.id);
      }
    } catch {
      setError("Não foi possível carregar os dados de eventos agora.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSelectedEvent(eventId: string) {
    const token = getSessionToken();

    if (!token || !eventId) {
      setSelectedEvent(null);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/events/${eventId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível carregar os detalhes do evento.");
        return;
      }

      const data = (await response.json()) as EventDetail;

      setSelectedEvent(data);
    } catch {
      setError("Não foi possível carregar os detalhes do evento agora.");
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

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível cadastrar o evento.");
        return;
      }

      setTitle("");
      setDate("");
      setCapacity("50");
      setPrice("0");
      setIsPublic(false);
      setSuccessMessage("Evento cadastrado com sucesso.");
      await loadEventsMembersAndVisitors();
    } catch {
      setError("Não foi possível cadastrar o evento agora.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleCreateRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    if (!selectedEventId) {
      setError("Selecione um evento para fazer a inscrição.");
      return;
    }

    if (!selectedParticipantId) {
      setError("Selecione um membro ou visitante para fazer a inscrição.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsRegistering(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/events/registrations`, {
        body: JSON.stringify({
          eventId: selectedEventId,
          personId: participantType === "member" ? selectedParticipantId : undefined,
          visitorId: participantType === "visitor" ? selectedParticipantId : undefined
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível fazer a inscrição.");
        return;
      }

      setSelectedParticipantId("");
      setSuccessMessage("Inscrição realizada com sucesso.");
      await loadEventsMembersAndVisitors();
      await loadSelectedEvent(selectedEventId);
    } catch {
      setError("Não foi possível fazer a inscrição agora.");
    } finally {
      setIsRegistering(false);
    }
  }

  async function updateRegistrationStatus(registrationId: string, status: RegistrationStatus) {
    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsUpdatingStatus(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/events/registrations/status`, {
        body: JSON.stringify({
          registrationId,
          status
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;

        setError(data.message ?? "Não foi possível atualizar a inscrição.");
        return;
      }

      setSuccessMessage(
        status === "CHECKED_IN" ? "Check-in realizado com sucesso." : "Inscrição atualizada."
      );
      await loadEventsMembersAndVisitors();
      await loadSelectedEvent(selectedEventId);
    } catch {
      setError("Não foi possível atualizar a inscrição agora.");
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  useEffect(() => {
    void loadEventsMembersAndVisitors();
  }, []);

  useEffect(() => {
    void loadSelectedEvent(selectedEventId);
  }, [selectedEventId]);

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
            maxWidth: "1120px",
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

            <p
              style={{
                color: "#60a5fa",
                fontSize: "13px",
                fontWeight: 900,
                letterSpacing: "0.08em",
                margin: "0 0 14px",
                textTransform: "uppercase"
              }}
            >
              Eventos
            </p>

            <h1
              style={{
                color: "#ffffff",
                fontSize: "30px",
                letterSpacing: "-0.04em",
                lineHeight: 1.12,
                margin: "0 0 12px"
              }}
            >
              Gestão de eventos
            </h1>

            <p
              style={{
                color: "#cbd5e1",
                fontSize: "15px",
                lineHeight: 1.6,
                margin: 0,
                maxWidth: "780px"
              }}
            >
              Crie eventos, controle inscrições de membros e visitantes e faça check-in sem depender de fluxos genéricos de plataformas externas.
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
            <h2 style={{ color: "#ffffff", fontSize: "20px", margin: 0 }}>
              Cadastrar evento
            </h2>

            <div
              style={{
                display: "grid",
                gap: "14px",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
              }}
            >
              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Título
                <input
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  type="text"
                  value={title}
                />
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Data e hora
                <input
                  onChange={(event) => setDate(event.target.value)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  type="datetime-local"
                  value={date}
                />
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Capacidade
                <input
                  min="1"
                  onChange={(event) => setCapacity(event.target.value)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  type="number"
                  value={capacity}
                />
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Valor
                <input
                  min="0"
                  onChange={(event) => setPrice(event.target.value)}
                  required
                  step="0.01"
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  type="number"
                  value={price}
                />
              </label>

              <label style={{ alignItems: "center", color: "#cbd5e1", display: "flex", fontSize: "14px", fontWeight: 800, gap: "10px", paddingTop: "28px" }}>
                <input
                  checked={isPublic}
                  onChange={(event) => setIsPublic(event.target.checked)}
                  type="checkbox"
                />
                Evento público
              </label>
            </div>

            <button
              disabled={isCreating}
              style={{
                background: "#2563eb",
                border: 0,
                borderRadius: "14px",
                color: "#ffffff",
                cursor: isCreating ? "not-allowed" : "pointer",
                font: "inherit",
                fontWeight: 900,
                justifySelf: "start",
                opacity: isCreating ? 0.72 : 1,
                padding: "13px 18px"
              }}
              type="submit"
            >
              {isCreating ? "Cadastrando..." : "Cadastrar evento"}
            </button>
          </form>

          <form
            onSubmit={handleCreateRegistration}
            style={{
              background: "rgba(15, 23, 42, 0.72)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              borderRadius: "22px",
              display: "grid",
              gap: "16px",
              padding: "22px"
            }}
          >
            <h2 style={{ color: "#ffffff", fontSize: "20px", margin: 0 }}>
              Inscrever participante
            </h2>

            <div
              style={{
                display: "grid",
                gap: "14px",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
              }}
            >
              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Evento
                <select
                  onChange={(event) => setSelectedEventId(event.target.value)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  value={selectedEventId}
                >
                  <option value="">Selecione um evento</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                Tipo de participante
                <select
                  onChange={(event) => {
                    setParticipantType(event.target.value as ParticipantType);
                    setSelectedParticipantId("");
                  }}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  value={participantType}
                >
                  <option value="member">Membro</option>
                  <option value="visitor">Visitante</option>
                </select>
              </label>

              <label style={{ color: "#cbd5e1", display: "grid", fontSize: "14px", fontWeight: 800, gap: "8px" }}>
                {participantTypeLabels[participantType]}
                <select
                  onChange={(event) => setSelectedParticipantId(event.target.value)}
                  required
                  style={{ border: "1px solid rgba(148, 163, 184, 0.38)", borderRadius: "14px", font: "inherit", padding: "13px 14px" }}
                  value={selectedParticipantId}
                >
                  <option value="">
                    {participantType === "member" ? "Selecione um membro" : "Selecione um visitante"}
                  </option>
                  {selectableParticipants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participant.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              disabled={isRegistering || events.length === 0 || selectableParticipants.length === 0}
              style={{
                background: "#2563eb",
                border: 0,
                borderRadius: "14px",
                color: "#ffffff",
                cursor: isRegistering || events.length === 0 || selectableParticipants.length === 0 ? "not-allowed" : "pointer",
                font: "inherit",
                fontWeight: 900,
                justifySelf: "start",
                opacity: isRegistering || events.length === 0 || selectableParticipants.length === 0 ? 0.72 : 1,
                padding: "13px 18px"
              }}
              type="submit"
            >
              {isRegistering ? "Inscrevendo..." : "Inscrever participante"}
            </button>
          </form>

          {error ? (
            <p style={{ background: "rgba(239, 68, 68, 0.14)", border: "1px solid rgba(248, 113, 113, 0.26)", borderRadius: "14px", color: "#fecaca", fontSize: "14px", margin: 0, padding: "12px 14px" }}>
              {error}
            </p>
          ) : null}

          {successMessage ? (
            <p style={{ background: "rgba(34, 197, 94, 0.14)", border: "1px solid rgba(74, 222, 128, 0.26)", borderRadius: "14px", color: "#bbf7d0", fontSize: "14px", margin: 0, padding: "12px 14px" }}>
              {successMessage}
            </p>
          ) : null}

          <section
            style={{
              background: "rgba(15, 23, 42, 0.58)",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              borderRadius: "22px",
              display: "grid",
              gap: "14px",
              padding: "22px"
            }}
          >
            <h2 style={{ color: "#ffffff", fontSize: "20px", margin: 0 }}>
              Eventos cadastrados
            </h2>

            {isLoading ? (
              <p style={{ color: "#cbd5e1", margin: 0 }}>Carregando eventos...</p>
            ) : null}

            {!isLoading && events.length === 0 ? (
              <p style={{ color: "#cbd5e1", margin: 0 }}>
                Nenhum evento cadastrado ainda.
              </p>
            ) : null}

            {!isLoading && events.length > 0 ? (
              <div style={{ display: "grid", gap: "12px" }}>
                {events.map((event) => {
                  const activeRegistrations = event.registrations.filter(
                    (registration) => registration.status !== "CANCELLED"
                  );
                  const checkedInRegistrations = event.registrations.filter(
                    (registration) => registration.status === "CHECKED_IN"
                  );
                  const visitorRegistrations = event.registrations.filter(
                    (registration) => registration.visitor
                  );

                  return (
                    <article
                      key={event.id}
                      style={{
                        background: "rgba(15, 23, 42, 0.82)",
                        border: "1px solid rgba(148, 163, 184, 0.16)",
                        borderRadius: "18px",
                        display: "grid",
                        gap: "10px",
                        padding: "16px"
                      }}
                    >
                      <div style={{ alignItems: "start", display: "flex", gap: "12px", justifyContent: "space-between" }}>
                        <div>
                          <h3 style={{ color: "#ffffff", fontSize: "17px", margin: "0 0 6px" }}>
                            {event.title}
                          </h3>

                          <p style={{ color: "#cbd5e1", fontSize: "14px", lineHeight: 1.5, margin: 0 }}>
                            {formatDate(event.date)} - {formatMoney(event.price)}
                          </p>

                          <p style={{ color: "#94a3b8", fontSize: "13px", lineHeight: 1.5, margin: "6px 0 0" }}>
                            Slug: {event.slug} - {event.isPublic ? "Público" : "Interno"}
                          </p>
                        </div>

                        <span style={{ background: "rgba(37, 99, 235, 0.18)", border: "1px solid rgba(96, 165, 250, 0.22)", borderRadius: "999px", color: "#bfdbfe", fontSize: "12px", fontWeight: 900, padding: "6px 10px", whiteSpace: "nowrap" }}>
                          {activeRegistrations.length}/{event.capacity} inscritos
                        </span>
                      </div>

                      <p style={{ color: "#cbd5e1", fontSize: "14px", margin: 0 }}>
                        Check-ins: {checkedInRegistrations.length} - Visitantes inscritos: {visitorRegistrations.length}
                      </p>

                      {event.isPublic && event.publicRegistrationEnabled ? (
                        <div style={{ background: "rgba(37, 99, 235, 0.12)", border: "1px solid rgba(96, 165, 250, 0.2)", borderRadius: "14px", display: "grid", gap: "8px", padding: "12px" }}>
                          <p style={{ color: "#bfdbfe", fontSize: "13px", fontWeight: 900, margin: 0 }}>
                            Link público de inscrição
                          </p>

                          <Link href={"/eventos/" + event.id} style={{ color: "#93c5fd", fontSize: "14px", fontWeight: 800, textDecoration: "none", wordBreak: "break-all" }}>
                            {"/eventos/" + event.id}
                          </Link>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : null}
          </section>

          {selectedEventSummary ? (
            <section
              style={{
                background: "rgba(15, 23, 42, 0.58)",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                borderRadius: "22px",
                display: "grid",
                gap: "14px",
                padding: "22px"
              }}
            >
              <h2 style={{ color: "#ffffff", fontSize: "20px", margin: 0 }}>
                Check-in: {selectedEventSummary.title}
              </h2>

              {!selectedEvent || selectedEvent.registrations.length === 0 ? (
                <p style={{ color: "#cbd5e1", margin: 0 }}>
                  Nenhuma inscrição neste evento ainda.
                </p>
              ) : null}

              {selectedEvent && selectedEvent.registrations.length > 0 ? (
                <div style={{ display: "grid", gap: "10px" }}>
                  {selectedEvent.registrations.map((registration) => {
                    const participant = getRegistrationParticipant(registration);

                    if (!participant) {
                      return null;
                    }

                    return (
                      <article
                        key={registration.id}
                        style={{
                          alignItems: "center",
                          background: "rgba(15, 23, 42, 0.82)",
                          border: "1px solid rgba(148, 163, 184, 0.16)",
                          borderRadius: "18px",
                          display: "flex",
                          gap: "12px",
                          justifyContent: "space-between",
                          padding: "14px"
                        }}
                      >
                        <div>
                          <h3 style={{ color: "#ffffff", fontSize: "16px", margin: "0 0 4px" }}>
                            {participant.name}
                          </h3>

                          <p style={{ color: "#cbd5e1", fontSize: "14px", margin: 0 }}>
                            {getRegistrationParticipantType(registration)} - {participant.phone} - {statusLabels[registration.status]}
                          </p>
                        </div>

                        <button
                          disabled={isUpdatingStatus || registration.status === "CHECKED_IN"}
                          onClick={() => updateRegistrationStatus(registration.id, "CHECKED_IN")}
                          style={{
                            background: registration.status === "CHECKED_IN" ? "#16a34a" : "#2563eb",
                            border: 0,
                            borderRadius: "14px",
                            color: "#ffffff",
                            cursor: isUpdatingStatus || registration.status === "CHECKED_IN" ? "not-allowed" : "pointer",
                            font: "inherit",
                            fontWeight: 900,
                            opacity: isUpdatingStatus ? 0.72 : 1,
                            padding: "10px 14px",
                            whiteSpace: "nowrap"
                          }}
                          type="button"
                        >
                          {registration.status === "CHECKED_IN" ? "Presente" : "Fazer check-in"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </section>
          ) : null}
        </section>
      </main>
    </DashboardAuthGuard>
  );
}
