"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import QRCode from "react-qr-code";
import {
  FormEvent,
  useEffect,
  useState
} from "react";

type ApiErrorResponse = {
  message?: string;
};

type PublicTicketBatch = {
  id: string;
  name: string;
  quantity: number;
  price: string | number;
  salesStart: string;
  salesEnd: string;
  _count: {
    registrations: number;
  };
};

type PublicTicket = {
  id: string;
  name: string;
  description: string | null;
  isFree: boolean;
  batches: PublicTicketBatch[];
};

type PublicFormField = {
  id: string;
  label: string;
  type:
    | "TEXT"
    | "PARAGRAPH"
    | "SELECT"
    | "SINGLE_CHOICE"
    | "MULTIPLE_CHOICE";
  isRequired: boolean;
  isSensitive: boolean;
  options: Array<{
    id: string;
    label: string;
    value: string;
  }>;
  ticketScopes: Array<{
    ticketId: string;
  }>;
};

type PublicEvent = {
  id: string;
  title: string;
  slug: string;
  publicSlug: string | null;
  date: string;
  price: string | number;
  isPaid: boolean;
  ticketTypes: PublicTicket[];
  formFields: PublicFormField[];
};

type PublicRegistration = {
  id: string;
  status:
    | "PENDING"
    | "CONFIRMED"
    | "CANCELLED"
    | "CHECKED_IN";
  paymentStatus: string;
  checkInToken: string | null;
  waitlistedAt: string | null;
  paymentCheckout?: {
    method: "PIX";
    pix: {
      encodedImage: string;
      payload: string;
      expirationDate: string;
    };
  };
  emailSent?: boolean;
  event: {
    title: string;
    slug: string;
    publicSlug: string | null;
    date: string;
    isPaid: boolean;
    church: {
      slug: string;
    };
  };
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3333";

const EVENTS_APP_BASE_URL =
  process.env.NEXT_PUBLIC_EVENTS_APP_BASE_URL ??
  "http://localhost:3001";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatMoney(value: string | number) {
  const numberValue =
    typeof value === "string"
      ? Number(value)
      : value;

  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency"
  }).format(
    Number.isFinite(numberValue)
      ? numberValue
      : 0
  );
}

function getSuccessMessage(
  registration: PublicRegistration
) {
  if (registration.waitlistedAt) {
    return "Sua inscrição entrou na lista de espera.";
  }

  if (registration.event.isPaid) {
    return "Sua inscrição foi recebida e ficará pendente até a confirmação do pagamento.";
  }

  return "Sua inscrição foi confirmada.";
}

function getAppUrl(
  event: PublicEvent
) {
  const publicSlug =
    event.publicSlug ?? event.slug;

  return `${EVENTS_APP_BASE_URL}/${encodeURIComponent(publicSlug)}#aplicativo`;
}

export default function PublicEventPage() {
  const params =
    useParams<{ eventId: string }>();

  const eventId = params.eventId;

  const [
    event,
    setEvent
  ] = useState<PublicEvent | null>(null);

  const [
    registration,
    setRegistration
  ] = useState<PublicRegistration | null>(null);

  const [
    name,
    setName
  ] = useState("");

  const [
    phone,
    setPhone
  ] = useState("");

  const [
    email,
    setEmail
  ] = useState(
    process.env.NEXT_PUBLIC_EVENT_TEST_EMAIL ??
      ""
  );

  const [
    error,
    setError
  ] = useState<string | null>(null);

  const [
    isLoading,
    setIsLoading
  ] = useState(true);

  const [
    isRegistering,
    setIsRegistering
  ] = useState(false);

  const [ticketId, setTicketId] =
    useState("");

  const [ticketBatchId, setTicketBatchId] =
    useState("");

  const [answers, setAnswers] =
    useState<Record<string, string | string[]>>({});

  async function loadEvent() {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/public/events/${eventId}`,
        {
          cache: "no-store"
        }
      );

      if (!response.ok) {
        const data =
          await response.json() as ApiErrorResponse;

        setError(
          data.message ??
            "Não foi possível carregar este evento."
        );

        return;
      }

      const data =
        await response.json() as PublicEvent;

      setEvent(data);

      const firstTicket =
        data.ticketTypes[0] ?? null;

      setTicketId(firstTicket?.id ?? "");
      setTicketBatchId(
        firstTicket?.batches[0]?.id ?? ""
      );
    } catch {
      setError(
        "Não foi possível carregar este evento agora."
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegister(
    formEvent: FormEvent<HTMLFormElement>
  ) {
    formEvent.preventDefault();

    setError(null);
    setRegistration(null);
    setIsRegistering(true);

    if (!ticketId || !ticketBatchId) {
      setError("Selecione o ingresso e o lote.");
      setIsRegistering(false);
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/public/events/${eventId}/register`,
        {
          body: JSON.stringify({
            email: email.trim() || undefined,
            name,
            phone,
            ticketId,
            ticketBatchId,
            answers: Object.entries(answers).map(
              ([fieldId, value]) => ({
                fieldId,
                value
              })
            )
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );

      if (!response.ok) {
        const data =
          await response.json() as ApiErrorResponse;

        setError(
          data.message ??
            "Não foi possível realizar a inscrição."
        );

        return;
      }

      const data =
        await response.json() as PublicRegistration;

      setRegistration(data);
      setName("");
      setPhone("");
      setAnswers({});
    } catch {
      setError(
        "Não foi possível realizar a inscrição agora."
      );
    } finally {
      setIsRegistering(false);
    }
  }

  useEffect(() => {
    void loadEvent();
  }, [eventId]);

  const selectedTicket =
    event?.ticketTypes.find(
      (ticket) => ticket.id === ticketId
    ) ?? null;

  const availableBatches =
    selectedTicket?.batches.filter((batch) => {
      const now = Date.now();

      return (
        new Date(batch.salesStart).getTime() <= now &&
        new Date(batch.salesEnd).getTime() >= now &&
        batch._count.registrations < batch.quantity
      );
    }) ?? [];

  const visibleFields =
    event?.formFields.filter(
      (field) =>
        field.ticketScopes.length === 0 ||
        field.ticketScopes.some(
          (scope) => scope.ticketId === ticketId
        )
    ) ?? [];

  function setAnswer(
    fieldId: string,
    value: string | string[]
  ) {
    setAnswers((current) => ({
      ...current,
      [fieldId]: value
    }));
  }

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
      <section
        style={{
          display: "grid",
          gap: "22px",
          margin: "0 auto",
          maxWidth: "1040px"
        }}
      >
        <Link
          href="/"
          style={{
            color: "#93c5fd",
            fontSize: "14px",
            fontWeight: 800,
            textDecoration: "none"
          }}
        >
          Voltar para o início
        </Link>

        {isLoading ? (
          <p
            style={{
              color: "#cbd5e1",
              margin: 0
            }}
          >
            Carregando evento...
          </p>
        ) : null}

        {!isLoading && error && !event ? (
          <section
            style={{
              background:
                "rgba(127, 29, 29, 0.32)",
              border:
                "1px solid rgba(248, 113, 113, 0.28)",
              borderRadius: "24px",
              padding: "28px"
            }}
          >
            <h1
              style={{
                color: "#ffffff",
                fontSize: "28px",
                margin: "0 0 10px"
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
          <section
            style={{
              display: "grid",
              gap: "22px",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(320px, 1fr))"
            }}
          >
            <article
              style={{
                background:
                  "rgba(15, 23, 42, 0.86)",
                border:
                  "1px solid rgba(148, 163, 184, 0.2)",
                borderRadius: "28px",
                boxShadow:
                  "0 28px 90px rgba(2, 6, 23, 0.36)",
                display: "grid",
                gap: "18px",
                padding: "30px"
              }}
            >
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

              <p
                style={{
                  color: "#cbd5e1",
                  fontSize: "16px",
                  lineHeight: 1.7,
                  margin: 0
                }}
              >
                Faça sua inscrição e guarde o QR Code
                para apresentar no dia do evento.
              </p>

              <div
                style={{
                  display: "grid",
                  gap: "12px",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(160px, 1fr))"
                }}
              >
                <div
                  style={{
                    background:
                      "rgba(2, 6, 23, 0.42)",
                    borderRadius: "18px",
                    padding: "16px"
                  }}
                >
                  <strong>Data</strong>

                  <p
                    style={{
                      color: "#cbd5e1",
                      margin: "8px 0 0"
                    }}
                  >
                    {formatDate(event.date)}
                  </p>
                </div>

                <div
                  style={{
                    background:
                      "rgba(2, 6, 23, 0.42)",
                    borderRadius: "18px",
                    padding: "16px"
                  }}
                >
                  <strong>Valor</strong>

                  <p
                    style={{
                      color: "#cbd5e1",
                      margin: "8px 0 0"
                    }}
                  >
                    {event.isPaid
                      ? formatMoney(event.price)
                      : "Gratuito"}
                  </p>
                </div>
              </div>
            </article>

            <aside
              style={{
                background:
                  "rgba(15, 23, 42, 0.86)",
                border:
                  "1px solid rgba(148, 163, 184, 0.2)",
                borderRadius: "28px",
                display: "grid",
                gap: "16px",
                padding: "24px"
              }}
            >
              {!registration ? (
                <>
                  <h2
                    style={{
                      color: "#ffffff",
                      fontSize: "22px",
                      margin: 0
                    }}
                  >
                    Fazer inscrição
                  </h2>

                  <form
                    onSubmit={handleRegister}
                    style={{
                      display: "grid",
                      gap: "14px"
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
                      Nome completo

                      <input
                        onChange={(item) =>
                          setName(item.target.value)
                        }
                        required
                        style={{
                          borderRadius: "14px",
                          font: "inherit",
                          padding: "13px 14px"
                        }}
                        value={name}
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
                      Telefone

                      <input
                        onChange={(item) =>
                          setPhone(item.target.value)
                        }
                        required
                        style={{
                          borderRadius: "14px",
                          font: "inherit",
                          padding: "13px 14px"
                        }}
                        type="tel"
                        value={phone}
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
                      E-mail

                      <input
                        onChange={(item) =>
                          setEmail(item.target.value)
                        }
                        required
                        style={{
                          borderRadius: "14px",
                          font: "inherit",
                          padding: "13px 14px"
                        }}
                        type="email"
                        value={email}
                      />
                    </label>

                    <button
                      disabled={isRegistering}
                      style={{
                        background: "#2563eb",
                        border: 0,
                        borderRadius: "14px",
                        color: "#ffffff",
                        cursor: isRegistering
                          ? "not-allowed"
                          : "pointer",
                        font: "inherit",
                        fontWeight: 900,
                        opacity:
                          isRegistering ? 0.72 : 1,
                        padding: "14px 18px"
                      }}
                      type="submit"
                    >
                      {isRegistering
                        ? "Enviando..."
                        : "Confirmar inscrição"}
                    </button>
                  </form>
                </>
              ) : (
                <section
                  style={{
                    background:
                      "rgba(34, 197, 94, 0.14)",
                    border:
                      "1px solid rgba(74, 222, 128, 0.26)",
                    borderRadius: "18px",
                    display: "grid",
                    gap: "16px",
                    padding: "20px"
                  }}
                >
                  <strong
                    style={{
                      color: "#ffffff",
                      fontSize: "20px"
                    }}
                  >
                    Inscrição recebida
                  </strong>

                  <p
                    style={{
                      color: "#bbf7d0",
                      lineHeight: 1.6,
                      margin: 0
                    }}
                  >
                    {getSuccessMessage(registration)}
                  </p>

                  {registration.paymentStatus ===
                    "PENDING" &&
                  registration.paymentCheckout ? (
                    <>
                      <div
                        style={{
                          background: "#ffffff",
                          borderRadius: "18px",
                          justifySelf: "center",
                          padding: "14px"
                        }}
                      >
                        <QRCode
                          bgColor="#ffffff"
                          fgColor="#020617"
                          size={210}
                          value={
                            registration
                              .paymentCheckout
                              .pix.payload
                          }
                        />
                      </div>

                      <div
                        style={{
                          background:
                            "rgba(2, 6, 23, 0.48)",
                          borderRadius: "14px",
                          display: "grid",
                          gap: "8px",
                          padding: "14px"
                        }}
                      >
                        <span
                          style={{
                            color: "#94a3b8",
                            fontSize: "12px"
                          }}
                        >
                          Pix Copia e Cola
                        </span>

                        <strong
                          style={{
                            color: "#ffffff",
                            fontFamily:
                              "monospace",
                            fontSize: "12px",
                            wordBreak:
                              "break-all"
                          }}
                        >
                          {
                            registration
                              .paymentCheckout
                              .pix.payload
                          }
                        </strong>
                      </div>
                    </>
                  ) : registration.checkInToken ? (
                    <>
                        <div
                          style={{
                            background: "#ffffff",
                            borderRadius: "18px",
                            justifySelf: "center",
                            padding: "14px"
                          }}
                        >
                          <QRCode
                            bgColor="#ffffff"
                            fgColor="#020617"
                            size={210}
                            value={
                              registration.checkInToken
                            }
                          />
                        </div>

                        <div
                          style={{
                            background:
                              "rgba(2, 6, 23, 0.48)",
                            borderRadius: "14px",
                            padding: "14px"
                          }}
                        >
                          <span
                            style={{
                              color: "#94a3b8",
                              display: "block",
                              fontSize: "12px",
                              marginBottom: "7px"
                            }}
                          >
                            Código de check-in
                          </span>

                          <strong
                            style={{
                              color: "#ffffff",
                              display: "block",
                              fontFamily: "monospace",
                              wordBreak: "break-all"
                            }}
                          >
                            {registration.checkInToken}
                          </strong>
                        </div>
                    </>
                  ) : null}

                  <p
                    style={{
                      color: registration.emailSent
                        ? "#bbf7d0"
                        : "#fde68a",
                      fontSize: "14px",
                      lineHeight: 1.6,
                      margin: 0
                    }}
                  >
                    O QR Code e o acesso ao aplicativo serão enviados para este e-mail após a confirmação do pagamento.
                  </p>

                  {(
                    !registration.event.isPaid ||
                    registration.paymentStatus ===
                      "PAID"
                  ) && (
                        <a
                          href={getAppUrl(event)}
                          style={{
                            background: "#2563eb",
                            borderRadius: "14px",
                            color: "#ffffff",
                            fontWeight: 900,
                            padding: "14px 18px",
                            textAlign: "center",
                            textDecoration: "none"
                          }}
                        >
                          Acessar aplicativo do evento
                        </a>
                  )}
                </section>
              )}

              {error ? (
                <p
                  style={{
                    background:
                      "rgba(239, 68, 68, 0.14)",
                    borderRadius: "14px",
                    color: "#fecaca",
                    lineHeight: 1.6,
                    margin: 0,
                    padding: "12px 14px"
                  }}
                >
                  {error}
                </p>
              ) : null}
            </aside>
          </section>
        ) : null}
      </section>
    </main>
  );
}
