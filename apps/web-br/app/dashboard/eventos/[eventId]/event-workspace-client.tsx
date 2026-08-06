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
    checkInToken: string;
    checkedInAt: string | null;
    waitlistedAt: string | null;
    person: {
      id: string;
      name: string;
      phone: string;
      email: string | null;
    } | null;
    visitor: {
      id: string;
      name: string;
      phone: string;
      email: string | null;
    } | null;
    ticket: {
      id: string;
      name: string;
    } | null;
    ticketBatch: {
      id: string;
      name: string;
    } | null;
    formAnswers: Array<{
      id: string;
      value: unknown;
      field: {
        id: string;
        label: string;
        isSensitive: boolean;
        order: number;
      };
    }>;
  }>;
};

type ApiErrorResponse = {
  message?: string;
};

type TicketBatch = {
  id: string;
  name: string;
  quantity: number;
  price: string | number;
  salesStart: string;
  salesEnd: string;
  isVisible: boolean;
  _count: {
    registrations: number;
  };
};

type EventTicket = {
  id: string;
  name: string;
  description: string | null;
  isFree: boolean;
  isVisible: boolean;
  batches: TicketBatch[];
  _count: {
    registrations: number;
  };
};

type EventWorkspaceClientProps = {
  eventId: string;
};

type EventWorkspaceSection =
  | "overview"
  | "information"
  | "tickets"
  | "registration-form"
  | "participants"
  | "event-app";

type EventFormFieldType =
  | "TEXT"
  | "PARAGRAPH"
  | "SELECT"
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE";

type EventFormField = {
  id: string;
  label: string;
  type: EventFormFieldType;
  isRequired: boolean;
  isSensitive: boolean;
  isActive: boolean;
  order: number;
  options: Array<{
    id: string;
    label: string;
    value: string;
    order: number;
  }>;
  ticketScopes: Array<{
    ticket: {
      id: string;
      name: string;
    };
  }>;
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
  const [isEditingInformation, setIsEditingInformation] =
    useState(false);
  const [isSavingInformation, setIsSavingInformation] =
    useState(false);
  const [informationMessage, setInformationMessage] =
    useState<string | null>(null);
  const [tickets, setTickets] = useState<EventTicket[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] =
    useState(true);
  const [isCreatingTicket, setIsCreatingTicket] =
    useState(false);
  const [isCreatingBatch, setIsCreatingBatch] =
    useState(false);
  const [ticketMessage, setTicketMessage] =
    useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] =
    useState("");
  const [ticketIsFree, setTicketIsFree] =
    useState(true);
  const [activeSection, setActiveSection] =
    useState<EventWorkspaceSection>("overview");
  const [formFields, setFormFields] =
    useState<EventFormField[]>([]);
  const [isLoadingFormFields, setIsLoadingFormFields] =
    useState(true);
  const [isCreatingFormField, setIsCreatingFormField] =
    useState(false);
  const [formFieldMessage, setFormFieldMessage] =
    useState<string | null>(null);
  const [formFieldType, setFormFieldType] =
    useState<EventFormFieldType>("TEXT");
  const [participantSearch, setParticipantSearch] =
    useState("");
  const [participantStatus, setParticipantStatus] =
    useState("ALL");
  const [participantPayment, setParticipantPayment] =
    useState("ALL");
  const [participantTicket, setParticipantTicket] =
    useState("ALL");

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

  async function loadTickets() {
    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    setIsLoadingTickets(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/${eventId}/tickets`,
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await response.json() as
        | EventTicket[]
        | ApiErrorResponse;

      if (!response.ok) {
        setError(
          !Array.isArray(data) && data.message
            ? data.message
            : "Não foi possível carregar os ingressos."
        );
        return;
      }

      const loadedTickets = data as EventTicket[];

      setTickets(loadedTickets);
      setSelectedTicketId((current) =>
        current || loadedTickets[0]?.id || ""
      );
    } catch {
      setError(
        "Não foi possível carregar os ingressos agora."
      );
    } finally {
      setIsLoadingTickets(false);
    }
  }

  useEffect(() => {
    void loadTickets();
  }, [eventId]);

  async function loadFormFields() {
    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    setIsLoadingFormFields(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/${eventId}/form-fields`,
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await response.json() as
        | EventFormField[]
        | ApiErrorResponse;

      if (!response.ok) {
        setError(
          !Array.isArray(data) && data.message
            ? data.message
            : "Não foi possível carregar o formulário."
        );
        return;
      }

      setFormFields(data as EventFormField[]);
    } catch {
      setError(
        "Não foi possível carregar o formulário agora."
      );
    } finally {
      setIsLoadingFormFields(false);
    }
  }

  useEffect(() => {
    void loadFormFields();
  }, [eventId]);

  async function handleCreateTicket(
    formEvent: React.FormEvent<HTMLFormElement>
  ) {
    formEvent.preventDefault();

    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    const form = formEvent.currentTarget;
    const formData = new FormData(form);

    setError(null);
    setTicketMessage(null);
    setIsCreatingTicket(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/${eventId}/tickets`,
        {
          body: JSON.stringify({
            name: String(
              formData.get("ticketName") ?? ""
            ).trim(),
            description:
              String(
                formData.get("ticketDescription") ?? ""
              ).trim() || undefined,
            isFree:
              String(formData.get("ticketType")) ===
              "free",
            isVisible:
              formData.get("ticketVisible") === "on"
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );

      const data = await response.json() as
        | EventTicket
        | ApiErrorResponse;

      if (!response.ok) {
        setError(
          "message" in data && data.message
            ? data.message
            : "Não foi possível criar o ingresso."
        );
        return;
      }

      const createdTicket = data as EventTicket;

      setTickets((current) => [
        ...current,
        createdTicket
      ]);
      setSelectedTicketId(createdTicket.id);
      setTicketMessage("Ingresso criado.");
      form.reset();
      setTicketIsFree(true);
    } catch {
      setError(
        "Não foi possível criar o ingresso agora."
      );
    } finally {
      setIsCreatingTicket(false);
    }
  }

  async function handleCreateBatch(
    formEvent: React.FormEvent<HTMLFormElement>
  ) {
    formEvent.preventDefault();

    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    const form = formEvent.currentTarget;
    const formData = new FormData(form);
    const selectedTicket = tickets.find(
      (ticket) => ticket.id === selectedTicketId
    );

    if (!selectedTicket) {
      setError("Selecione um ingresso.");
      return;
    }

    setError(null);
    setTicketMessage(null);
    setIsCreatingBatch(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/${eventId}/ticket-batches`,
        {
          body: JSON.stringify({
            ticketId: selectedTicket.id,
            name: String(
              formData.get("batchName") ?? ""
            ).trim(),
            quantity: Number(
              formData.get("batchQuantity")
            ),
            price: selectedTicket.isFree
              ? 0
              : Number(formData.get("batchPrice")),
            salesStart: String(
              formData.get("salesStart") ?? ""
            ),
            salesEnd: String(
              formData.get("salesEnd") ?? ""
            ),
            isVisible:
              formData.get("batchVisible") === "on"
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );

      const data = await response.json() as
        | TicketBatch
        | ApiErrorResponse;

      if (!response.ok) {
        setError(
          "message" in data && data.message
            ? data.message
            : "Não foi possível criar o lote."
        );
        return;
      }

      const createdBatch = data as TicketBatch;

      setTickets((current) =>
        current.map((ticket) =>
          ticket.id === selectedTicket.id
            ? {
                ...ticket,
                batches: [
                  ...ticket.batches,
                  createdBatch
                ]
              }
            : ticket
        )
      );
      setTicketMessage("Lote criado.");
      form.reset();
    } catch {
      setError(
        "Não foi possível criar o lote agora."
      );
    } finally {
      setIsCreatingBatch(false);
    }
  }

  async function handleCreateFormField(
    formEvent: React.FormEvent<HTMLFormElement>
  ) {
    formEvent.preventDefault();

    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    const form = formEvent.currentTarget;
    const formData = new FormData(form);
    const options = String(
      formData.get("fieldOptions") ?? ""
    )
      .split("\n")
      .map((option) => option.trim())
      .filter(Boolean)
      .map((option) => ({
        label: option,
        value: option
          .normalize("NFD")
          .replace(/[\\u0300-\\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
      }));

    setError(null);
    setFormFieldMessage(null);
    setIsCreatingFormField(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/${eventId}/form-fields`,
        {
          body: JSON.stringify({
            label: String(
              formData.get("fieldLabel") ?? ""
            ).trim(),
            type: formFieldType,
            isRequired:
              formData.get("fieldRequired") === "on",
            isSensitive:
              formData.get("fieldSensitive") === "on",
            isActive: true,
            ticketIds: formData
              .getAll("fieldTicketIds")
              .map(String),
            options
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );

      const data = await response.json() as
        | EventFormField
        | ApiErrorResponse;

      if (!response.ok) {
        setError(
          "message" in data && data.message
            ? data.message
            : "Não foi possível criar o campo."
        );
        return;
      }

      setFormFields((current) => [
        ...current,
        data as EventFormField
      ]);
      setFormFieldMessage("Campo criado.");
      setFormFieldType("TEXT");
      form.reset();
    } catch {
      setError(
        "Não foi possível criar o campo agora."
      );
    } finally {
      setIsCreatingFormField(false);
    }
  }

  async function handleToggleFormField(
    field: EventFormField
  ) {
    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    setError(null);
    setFormFieldMessage(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/${eventId}/form-fields/${field.id}`,
        {
          body: JSON.stringify({
            isActive: !field.isActive
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "PATCH"
        }
      );

      const data = await response.json() as
        | EventFormField
        | ApiErrorResponse;

      if (!response.ok) {
        setError(
          "message" in data && data.message
            ? data.message
            : "Não foi possível atualizar o campo."
        );
        return;
      }

      setFormFields((current) =>
        current.map((currentField) =>
          currentField.id === field.id
            ? data as EventFormField
            : currentField
        )
      );
    } catch {
      setError(
        "Não foi possível atualizar o campo agora."
      );
    }
  }

  async function handleMoveFormField(
    fieldId: string,
    direction: -1 | 1
  ) {
    const currentIndex = formFields.findIndex(
      (field) => field.id === fieldId
    );
    const targetIndex = currentIndex + direction;

    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= formFields.length
    ) {
      return;
    }

    const reordered = [...formFields];
    const [field] = reordered.splice(currentIndex, 1);

    if (!field) {
      return;
    }

    reordered.splice(targetIndex, 0, field);

    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/${eventId}/form-fields-order`,
        {
          body: JSON.stringify({
            fieldIds: reordered.map(
              (currentField) => currentField.id
            )
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "PATCH"
        }
      );

      const data = await response.json() as
        | EventFormField[]
        | ApiErrorResponse;

      if (!response.ok) {
        setError(
          !Array.isArray(data) && data.message
            ? data.message
            : "Não foi possível alterar a ordem."
        );
        return;
      }

      setFormFields(data as EventFormField[]);
    } catch {
      setError(
        "Não foi possível alterar a ordem agora."
      );
    }
  }

  const filteredParticipants =
    event?.registrations.filter((registration) => {
      const participant =
        registration.person ?? registration.visitor;

      if (!participant) {
        return false;
      }

      const search = participantSearch
        .trim()
        .toLowerCase();

      const matchesSearch =
        !search ||
        participant.name
          .toLowerCase()
          .includes(search) ||
        participant.phone
          .toLowerCase()
          .includes(search) ||
        participant.email
          ?.toLowerCase()
          .includes(search) ||
        registration.checkInToken
          .toLowerCase()
          .includes(search);

      const matchesStatus =
        participantStatus === "ALL" ||
        registration.status === participantStatus;

      const matchesPayment =
        participantPayment === "ALL" ||
        registration.paymentStatus ===
          participantPayment;

      const matchesTicket =
        participantTicket === "ALL" ||
        registration.ticket?.id ===
          participantTicket;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPayment &&
        matchesTicket
      );
    }) ?? [];

  const publicRegistrationUrl = event
    ? `${WEB_BASE_URL}/eventos/${event.id}`
    : "#";

  const eventAppUrl = event
    ? `${EVENTS_APP_BASE_URL}/${encodeURIComponent(event.church.slug)}/${encodeURIComponent(event.slug)}`
    : "#";

  function formatDateTimeLocal(value: string) {
    const date = new Date(value);
    const timezoneOffset = date.getTimezoneOffset() * 60_000;

    return new Date(date.getTime() - timezoneOffset)
      .toISOString()
      .slice(0, 16);
  }

  async function handleSaveInformation(
    formEvent: React.FormEvent<HTMLFormElement>
  ) {
    formEvent.preventDefault();

    if (!event) {
      return;
    }

    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    const formData = new FormData(formEvent.currentTarget);
    const title = String(formData.get("title") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    const date = String(formData.get("date") ?? "");
    const capacity = Number(formData.get("capacity"));
    const price = Number(formData.get("price"));

    setError(null);
    setInformationMessage(null);
    setIsSavingInformation(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/${event.id}`,
        {
          body: JSON.stringify({
            title,
            slug,
            date,
            capacity,
            price,
            isPaid: price > 0,
            isPublic: formData.get("isPublic") === "on",
            publicRegistrationEnabled:
              formData.get("publicRegistrationEnabled") === "on",
            waitlistEnabled:
              formData.get("waitlistEnabled") === "on"
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "PATCH"
        }
      );

      const data = await response.json() as
        | EventDetail
        | ApiErrorResponse;

      if (!response.ok) {
        setError(
          "message" in data && data.message
            ? data.message
            : "Não foi possível atualizar o evento."
        );
        return;
      }

      const updatedEvent = data as EventDetail;

      setEvent((current) =>
        current
          ? {
              ...current,
              ...updatedEvent
            }
          : current
      );
      setInformationMessage(
        "Informações do evento atualizadas."
      );
      setIsEditingInformation(false);
    } catch {
      setError(
        "Não foi possível atualizar o evento agora."
      );
    } finally {
      setIsSavingInformation(false);
    }
  }

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

            <div
              style={{
                alignItems: "start",
                display: "grid",
                gap: "24px",
                gridTemplateColumns:
                  "minmax(210px, 250px) minmax(0, 1fr)"
              }}
            >
              <nav
                style={{
                  background: "rgba(15, 23, 42, 0.82)",
                  border:
                    "1px solid rgba(148, 163, 184, 0.18)",
                  borderRadius: "20px",
                  display: "grid",
                  gap: "8px",
                  padding: "12px",
                  position: "sticky",
                  top: "24px"
                }}
              >
                {[
                  ["overview", "Visão geral"],
                  ["information", "Informações"],
                  ["tickets", "Ingressos"],
                  ["registration-form", "Formulário de inscrição"],
                  ["participants", "Participantes"],
                  ["event-app", "Aplicativo do Evento"]
                ].map(([section, label]) => (
                  <button
                    key={section}
                    onClick={() =>
                      setActiveSection(
                        section as EventWorkspaceSection
                      )
                    }
                    style={{
                      background:
                        activeSection === section
                          ? "#2563eb"
                          : "transparent",
                      border: 0,
                      borderRadius: "12px",
                      color:
                        activeSection === section
                          ? "#ffffff"
                          : "#cbd5e1",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: 900,
                      padding: "12px 14px",
                      textAlign: "left"
                    }}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </nav>

              <div
                style={{
                  display: "grid",
                  gap: "20px",
                  minWidth: 0
                }}
              >
            {activeSection === "overview" ? (
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
            ) : null}

            {activeSection === "information" ? (
              <section
              id="informacoes"
              style={{
                background: "rgba(15, 23, 42, 0.82)",
                border:
                  "1px solid rgba(148, 163, 184, 0.18)",
                borderRadius: "26px",
                display: "grid",
                gap: "22px",
                padding: "26px"
              }}
            >
              <header
                style={{
                  alignItems: "center",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "16px",
                  justifyContent: "space-between"
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
                    Informações do evento
                  </p>

                  <h2
                    style={{
                      color: "#ffffff",
                      fontSize: "24px",
                      margin: 0
                    }}
                  >
                    Dados principais e publicação
                  </h2>
                </div>

                {!isEditingInformation ? (
                  <button
                    onClick={() => {
                      setError(null);
                      setInformationMessage(null);
                      setIsEditingInformation(true);
                    }}
                    style={{
                      background: "#2563eb",
                      border: 0,
                      borderRadius: "12px",
                      color: "#ffffff",
                      cursor: "pointer",
                      fontWeight: 900,
                      padding: "11px 16px"
                    }}
                    type="button"
                  >
                    Editar informações
                  </button>
                ) : null}
              </header>

              {informationMessage ? (
                <p
                  style={{
                    background: "rgba(5, 150, 105, 0.16)",
                    border:
                      "1px solid rgba(52, 211, 153, 0.26)",
                    borderRadius: "14px",
                    color: "#a7f3d0",
                    margin: 0,
                    padding: "14px"
                  }}
                >
                  {informationMessage}
                </p>
              ) : null}

              {isEditingInformation ? (
                <form
                  onSubmit={handleSaveInformation}
                  style={{
                    display: "grid",
                    gap: "18px"
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gap: "16px",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(240px, 1fr))"
                    }}
                  >
                    <label
                      style={{
                        color: "#e2e8f0",
                        display: "grid",
                        fontWeight: 800,
                        gap: "8px"
                      }}
                    >
                      Nome do evento

                      <input
                        defaultValue={event.title}
                        name="title"
                        required
                        style={{
                          background: "#0f172a",
                          border:
                            "1px solid rgba(148, 163, 184, 0.3)",
                          borderRadius: "12px",
                          color: "#ffffff",
                          padding: "12px"
                        }}
                      />
                    </label>

                    <label
                      style={{
                        color: "#e2e8f0",
                        display: "grid",
                        fontWeight: 800,
                        gap: "8px"
                      }}
                    >
                      Endereço da página

                      <input
                        defaultValue={event.slug}
                        name="slug"
                        required
                        style={{
                          background: "#0f172a",
                          border:
                            "1px solid rgba(148, 163, 184, 0.3)",
                          borderRadius: "12px",
                          color: "#ffffff",
                          padding: "12px"
                        }}
                      />
                    </label>

                    <label
                      style={{
                        color: "#e2e8f0",
                        display: "grid",
                        fontWeight: 800,
                        gap: "8px"
                      }}
                    >
                      Data e horário

                      <input
                        defaultValue={formatDateTimeLocal(
                          event.date
                        )}
                        name="date"
                        required
                        style={{
                          background: "#0f172a",
                          border:
                            "1px solid rgba(148, 163, 184, 0.3)",
                          borderRadius: "12px",
                          color: "#ffffff",
                          padding: "12px"
                        }}
                        type="datetime-local"
                      />
                    </label>

                    <label
                      style={{
                        color: "#e2e8f0",
                        display: "grid",
                        fontWeight: 800,
                        gap: "8px"
                      }}
                    >
                      Capacidade

                      <input
                        defaultValue={event.capacity}
                        min="1"
                        name="capacity"
                        required
                        style={{
                          background: "#0f172a",
                          border:
                            "1px solid rgba(148, 163, 184, 0.3)",
                          borderRadius: "12px",
                          color: "#ffffff",
                          padding: "12px"
                        }}
                        type="number"
                      />
                    </label>

                    <label
                      style={{
                        color: "#e2e8f0",
                        display: "grid",
                        fontWeight: 800,
                        gap: "8px"
                      }}
                    >
                      Valor

                      <input
                        defaultValue={Number(event.price)}
                        min="0"
                        name="price"
                        required
                        step="0.01"
                        style={{
                          background: "#0f172a",
                          border:
                            "1px solid rgba(148, 163, 184, 0.3)",
                          borderRadius: "12px",
                          color: "#ffffff",
                          padding: "12px"
                        }}
                        type="number"
                      />
                    </label>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: "12px"
                    }}
                  >
                    <label
                      style={{
                        alignItems: "center",
                        color: "#e2e8f0",
                        display: "flex",
                        gap: "10px"
                      }}
                    >
                      <input
                        defaultChecked={event.isPublic}
                        name="isPublic"
                        type="checkbox"
                      />
                      Evento público
                    </label>

                    <label
                      style={{
                        alignItems: "center",
                        color: "#e2e8f0",
                        display: "flex",
                        gap: "10px"
                      }}
                    >
                      <input
                        defaultChecked={
                          event.publicRegistrationEnabled
                        }
                        name="publicRegistrationEnabled"
                        type="checkbox"
                      />
                      Inscrições públicas abertas
                    </label>

                    <label
                      style={{
                        alignItems: "center",
                        color: "#e2e8f0",
                        display: "flex",
                        gap: "10px"
                      }}
                    >
                      <input
                        defaultChecked={event.waitlistEnabled}
                        name="waitlistEnabled"
                        type="checkbox"
                      />
                      Lista de espera habilitada
                    </label>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "10px"
                    }}
                  >
                    <button
                      disabled={isSavingInformation}
                      style={{
                        background: "#2563eb",
                        border: 0,
                        borderRadius: "12px",
                        color: "#ffffff",
                        cursor: "pointer",
                        fontWeight: 900,
                        padding: "12px 18px"
                      }}
                      type="submit"
                    >
                      {isSavingInformation
                        ? "Salvando..."
                        : "Salvar informações"}
                    </button>

                    <button
                      disabled={isSavingInformation}
                      onClick={() =>
                        setIsEditingInformation(false)
                      }
                      style={{
                        background: "transparent",
                        border:
                          "1px solid rgba(148, 163, 184, 0.3)",
                        borderRadius: "12px",
                        color: "#e2e8f0",
                        cursor: "pointer",
                        fontWeight: 900,
                        padding: "12px 18px"
                      }}
                      type="button"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gap: "14px",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(210px, 1fr))"
                  }}
                >
                  <article>
                    <strong style={{ color: "#94a3b8" }}>
                      Data e horário
                    </strong>
                    <p style={{ marginBottom: 0 }}>
                      {formatDate(event.date)}
                    </p>
                  </article>

                  <article>
                    <strong style={{ color: "#94a3b8" }}>
                      Capacidade
                    </strong>
                    <p style={{ marginBottom: 0 }}>
                      {event.capacity}
                    </p>
                  </article>

                  <article>
                    <strong style={{ color: "#94a3b8" }}>
                      Valor
                    </strong>
                    <p style={{ marginBottom: 0 }}>
                      {event.isPaid
                        ? formatMoney(event.price)
                        : "Gratuito"}
                    </p>
                  </article>

                  <article>
                    <strong style={{ color: "#94a3b8" }}>
                      Publicação
                    </strong>
                    <p style={{ marginBottom: 0 }}>
                      {event.isPublic
                        ? "Publicado"
                        : "Não publicado"}
                    </p>
                  </article>
                </div>
              )}
            </section>

            ) : null}

            {activeSection === "tickets" ? (
              <section
                id="ingressos"
                style={{
                  background: "rgba(15, 23, 42, 0.82)",
                  border:
                    "1px solid rgba(148, 163, 184, 0.18)",
                  borderRadius: "20px",
                  display: "grid",
                  gap: "22px",
                  padding: "24px"
                }}
              >
                <header>
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
                    Ingressos
                  </p>
                  <h2
                    style={{
                      color: "#ffffff",
                      fontSize: "24px",
                      margin: 0
                    }}
                  >
                    Ingressos e lotes
                  </h2>
                </header>

                {ticketMessage ? (
                  <p
                    style={{
                      background: "rgba(5, 150, 105, 0.16)",
                      border:
                        "1px solid rgba(52, 211, 153, 0.26)",
                      borderRadius: "12px",
                      color: "#a7f3d0",
                      margin: 0,
                      padding: "12px"
                    }}
                  >
                    {ticketMessage}
                  </p>
                ) : null}

                <div
                  style={{
                    display: "grid",
                    gap: "18px",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(280px, 1fr))"
                  }}
                >
                  <form
                    onSubmit={handleCreateTicket}
                    style={{
                      border:
                        "1px solid rgba(148, 163, 184, 0.16)",
                      borderRadius: "16px",
                      display: "grid",
                      gap: "12px",
                      padding: "18px"
                    }}
                  >
                    <h3 style={{ margin: 0 }}>
                      Criar ingresso
                    </h3>

                    <input
                      name="ticketName"
                      placeholder="Nome do ingresso"
                      required
                      style={{
                        borderRadius: "10px",
                        padding: "12px"
                      }}
                    />

                    <textarea
                      name="ticketDescription"
                      placeholder="Descrição"
                      rows={3}
                      style={{
                        borderRadius: "10px",
                        padding: "12px"
                      }}
                    />

                    <select
                      defaultValue="free"
                      name="ticketType"
                      onChange={(event) =>
                        setTicketIsFree(
                          event.target.value === "free"
                        )
                      }
                      style={{
                        borderRadius: "10px",
                        padding: "12px"
                      }}
                    >
                      <option value="free">Gratuito</option>
                      <option value="paid">Pago</option>
                    </select>

                    <label>
                      <input
                        defaultChecked
                        name="ticketVisible"
                        type="checkbox"
                      />{" "}
                      Visível para inscrição
                    </label>

                    <button
                      disabled={isCreatingTicket}
                      style={{
                        background: "#2563eb",
                        border: 0,
                        borderRadius: "10px",
                        color: "#ffffff",
                        fontWeight: 900,
                        padding: "12px"
                      }}
                      type="submit"
                    >
                      {isCreatingTicket
                        ? "Criando..."
                        : ticketIsFree
                          ? "Criar ingresso gratuito"
                          : "Criar ingresso pago"}
                    </button>
                  </form>

                  <form
                    onSubmit={handleCreateBatch}
                    style={{
                      border:
                        "1px solid rgba(148, 163, 184, 0.16)",
                      borderRadius: "16px",
                      display: "grid",
                      gap: "12px",
                      padding: "18px"
                    }}
                  >
                    <h3 style={{ margin: 0 }}>Criar lote</h3>

                    <select
                      onChange={(event) =>
                        setSelectedTicketId(
                          event.target.value
                        )
                      }
                      required
                      style={{
                        borderRadius: "10px",
                        padding: "12px"
                      }}
                      value={selectedTicketId}
                    >
                      <option value="">Selecione o ingresso</option>
                      {tickets.map((ticket) => (
                        <option
                          key={ticket.id}
                          value={ticket.id}
                        >
                          {ticket.name}
                        </option>
                      ))}
                    </select>

                    <input
                      name="batchName"
                      placeholder="Nome do lote"
                      required
                      style={{
                        borderRadius: "10px",
                        padding: "12px"
                      }}
                    />

                    <input
                      min="1"
                      name="batchQuantity"
                      placeholder="Quantidade"
                      required
                      type="number"
                      style={{
                        borderRadius: "10px",
                        padding: "12px"
                      }}
                    />

                    <input
                      disabled={
                        tickets.find(
                          (ticket) =>
                            ticket.id === selectedTicketId
                        )?.isFree ?? true
                      }
                      min="0"
                      name="batchPrice"
                      placeholder="Preço"
                      required
                      step="0.01"
                      type="number"
                      style={{
                        borderRadius: "10px",
                        padding: "12px"
                      }}
                    />

                    <input
                      name="salesStart"
                      required
                      type="datetime-local"
                      style={{
                        borderRadius: "10px",
                        padding: "12px"
                      }}
                    />

                    <input
                      name="salesEnd"
                      required
                      type="datetime-local"
                      style={{
                        borderRadius: "10px",
                        padding: "12px"
                      }}
                    />

                    <label>
                      <input
                        defaultChecked
                        name="batchVisible"
                        type="checkbox"
                      />{" "}
                      Lote visível
                    </label>

                    <button
                      disabled={
                        isCreatingBatch ||
                        !selectedTicketId
                      }
                      style={{
                        background: "#2563eb",
                        border: 0,
                        borderRadius: "10px",
                        color: "#ffffff",
                        fontWeight: 900,
                        padding: "12px"
                      }}
                      type="submit"
                    >
                      {isCreatingBatch
                        ? "Criando..."
                        : "Criar lote"}
                    </button>
                  </form>
                </div>

                {isLoadingTickets ? (
                  <p>Carregando ingressos...</p>
                ) : null}

                {!isLoadingTickets &&
                tickets.length === 0 ? (
                  <p>Nenhum ingresso cadastrado.</p>
                ) : null}

                {tickets.map((ticket) => (
                  <article
                    key={ticket.id}
                    style={{
                      border:
                        "1px solid rgba(148, 163, 184, 0.16)",
                      borderRadius: "16px",
                      padding: "18px"
                    }}
                  >
                    <h3 style={{ marginTop: 0 }}>
                      {ticket.name}
                    </h3>
                    <p>
                      {ticket.isFree ? "Gratuito" : "Pago"}
                      {" - "}
                      {ticket.isVisible
                        ? "Visível"
                        : "Oculto"}
                    </p>

                    {ticket.batches.map((batch) => {
                      const sold =
                        batch._count.registrations;
                      const available = Math.max(
                        batch.quantity - sold,
                        0
                      );

                      return (
                        <div
                          key={batch.id}
                          style={{
                            background: "#0f172a",
                            borderRadius: "12px",
                            marginTop: "10px",
                            padding: "14px"
                          }}
                        >
                          <strong>{batch.name}</strong>
                          <p>
                            {formatMoney(batch.price)}
                            {" - "}
                            {sold} vendidos
                            {" - "}
                            {available} disponíveis
                          </p>
                          <small>
                            {formatDate(batch.salesStart)}
                            {" até "}
                            {formatDate(batch.salesEnd)}
                          </small>
                        </div>
                      );
                    })}
                  </article>
                ))}
              </section>
            ) : null}

            {activeSection === "registration-form" ? (
  <section
    style={{
      background: "rgba(15, 23, 42, 0.82)",
      border: "1px solid rgba(148, 163, 184, 0.18)",
      borderRadius: "20px",
      display: "grid",
      gap: "20px",
      padding: "24px"
    }}
  >
    <header>
      <p style={{ color: "#60a5fa", fontWeight: 900 }}>
        FORMULÁRIO DE INSCRIÇÃO
      </p>
      <h2>Campos do participante</h2>
    </header>

    {formFieldMessage ? <p>{formFieldMessage}</p> : null}

    <form
      onSubmit={(event) => {
        setFormFieldType("TEXT");
        void handleCreateFormField(event);
      }}
      style={{
        display: "grid",
        gap: "14px"
      }}
    >
      <label
        style={{
          display: "grid",
          gap: "8px"
        }}
      >
        Campo do participante

        <input
          name="fieldLabel"
          required
          style={{
            borderRadius: "10px",
            padding: "12px"
          }}
        />
      </label>

      <fieldset>
        <legend>Aplicar aos ingressos</legend>
        {tickets.length === 0 ? (
          <p>Todos os ingressos</p>
        ) : (
          tickets.map((ticket) => (
            <label
              key={ticket.id}
              style={{ display: "block", margin: "8px 0" }}
            >
              <input
                name="fieldTicketIds"
                type="checkbox"
                value={ticket.id}
              />{" "}
              {ticket.name}
            </label>
          ))
        )}
      </fieldset>

      <label>
        <input
          name="fieldRequired"
          type="checkbox"
        />{" "}
        Campo obrigatório
      </label>

      <label>
        <input
          name="fieldSensitive"
          type="checkbox"
        />{" "}
        Dado sensível
      </label>

      <button
        disabled={isCreatingFormField}
        style={{
          background: "#2563eb",
          border: 0,
          borderRadius: "10px",
          color: "#ffffff",
          fontWeight: 900,
          padding: "12px"
        }}
        type="submit"
      >
        {isCreatingFormField
          ? "Criando..."
          : "Adicionar campo"}
      </button>
    </form>

    {isLoadingFormFields ? (
      <p>Carregando campos...</p>
    ) : null}

    {!isLoadingFormFields &&
    formFields.length === 0 ? (
      <p>Nenhum campo configurado.</p>
    ) : null}

    {formFields.map((field, index) => (
      <article
        key={field.id}
        style={{
          border:
            "1px solid rgba(148, 163, 184, 0.2)",
          borderRadius: "14px",
          padding: "16px"
        }}
      >
        <strong>{field.label}</strong>

        <p>
          {field.type}
          {field.isRequired ? " - Obrigatório" : ""}
          {field.isSensitive ? " - Dado sensível" : ""}
        </p>

        <p>
          {field.ticketScopes.length > 0
            ? field.ticketScopes
                .map((scope) => scope.ticket.name)
                .join(", ")
            : "Todos os ingressos"}
        </p>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            disabled={index === 0}
            onClick={() =>
              handleMoveFormField(field.id, -1)
            }
            type="button"
          >
            Subir
          </button>

          <button
            disabled={index === formFields.length - 1}
            onClick={() =>
              handleMoveFormField(field.id, 1)
            }
            type="button"
          >
            Descer
          </button>

          <button
            onClick={() =>
              void handleToggleFormField(field)
            }
            type="button"
          >
            {field.isActive ? "Desativar" : "Ativar"}
          </button>
        </div>
      </article>
    ))}
  </section>
) : null}

{activeSection === "participants" ? (
  <section
    style={{
      background: "rgba(15, 23, 42, 0.82)",
      border: "1px solid rgba(148, 163, 184, 0.18)",
      borderRadius: "20px",
      display: "grid",
      gap: "18px",
      padding: "24px"
    }}
  >
    <header>
      <p
        style={{
          color: "#60a5fa",
          fontSize: "13px",
          fontWeight: 900,
          margin: "0 0 6px",
          textTransform: "uppercase"
        }}
      >
        Participantes
      </p>

      <h2 style={{ margin: 0 }}>
        Inscrições do evento
      </h2>
    </header>

    <div
      style={{
        display: "grid",
        gap: "10px",
        gridTemplateColumns:
          "minmax(220px, 2fr) repeat(3, minmax(145px, 1fr))"
      }}
    >
      <input
        onChange={(event) =>
          setParticipantSearch(event.target.value)
        }
        placeholder="Buscar por nome, e-mail, telefone ou código"
        style={{
          borderRadius: "10px",
          padding: "11px 12px"
        }}
        value={participantSearch}
      />

      <select
        onChange={(event) =>
          setParticipantStatus(event.target.value)
        }
        style={{
          borderRadius: "10px",
          padding: "11px 12px"
        }}
        value={participantStatus}
      >
        <option value="ALL">
          Todas as inscrições
        </option>
        <option value="PENDING">Pendentes</option>
        <option value="CONFIRMED">Confirmadas</option>
        <option value="CHECKED_IN">
          Check-in realizado
        </option>
        <option value="CANCELLED">Canceladas</option>
      </select>

      <select
        onChange={(event) =>
          setParticipantPayment(event.target.value)
        }
        style={{
          borderRadius: "10px",
          padding: "11px 12px"
        }}
        value={participantPayment}
      >
        <option value="ALL">
          Todos os pagamentos
        </option>
        <option value="PAID">Pago</option>
        <option value="PENDING">Pendente</option>
        <option value="NOT_REQUIRED">
          Não necessário
        </option>
        <option value="CANCELLED">Cancelado</option>
      </select>

      <select
        onChange={(event) =>
          setParticipantTicket(event.target.value)
        }
        style={{
          borderRadius: "10px",
          padding: "11px 12px"
        }}
        value={participantTicket}
      >
        <option value="ALL">
          Todos os ingressos
        </option>
        {tickets.map((ticket) => (
          <option
            key={ticket.id}
            value={ticket.id}
          >
            {ticket.name}
          </option>
        ))}
      </select>
    </div>

    <p
      style={{
        color: "#94a3b8",
        margin: 0
      }}
    >
      {filteredParticipants.length} participante(s)
    </p>

    <div
      style={{
        display: "grid",
        gap: "10px"
      }}
    >
      {filteredParticipants.map((registration) => {
        const participant =
          registration.person ??
          registration.visitor;

        if (!participant) {
          return null;
        }

        return (
          <details
            key={registration.id}
            style={{
              border:
                "1px solid rgba(148, 163, 184, 0.18)",
              borderRadius: "12px",
              padding: "14px 16px"
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                display: "grid",
                gap: "10px",
                gridTemplateColumns:
                  "minmax(180px, 2fr) repeat(3, minmax(110px, 1fr))",
                listStyle: "none"
              }}
            >
              <strong>{participant.name}</strong>
              <span>
                {registration.ticket?.name ??
                  "Sem ingresso"}
              </span>
              <span>{registration.status}</span>
              <span>
                {registration.paymentStatus}
              </span>
            </summary>

            <div
              style={{
                display: "grid",
                gap: "8px",
                marginTop: "14px"
              }}
            >
              <span>{participant.email ?? "Sem e-mail"}</span>
              <span>{participant.phone}</span>
              <span>
                Lote:{" "}
                {registration.ticketBatch?.name ??
                  "Não informado"}
              </span>
              <span>
                Código: {registration.checkInToken}
              </span>

              {registration.formAnswers.map(
                (answer) => (
                  <div key={answer.id}>
                    <strong>
                      {answer.field.label}
                    </strong>
                    <p style={{ margin: "4px 0 0" }}>
                      {answer.field.isSensitive
                        ? "Dado protegido"
                        : Array.isArray(answer.value)
                          ? answer.value.join(", ")
                          : String(answer.value)}
                    </p>
                  </div>
                )
              )}
            </div>
          </details>
        );
      })}
    </div>
  </section>
) : null}

{activeSection === "event-app" ? (
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
            ) : null}
              </div>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
