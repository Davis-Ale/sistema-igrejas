"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type LoginSession = {
  token: string;
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

export function CreateEventModal({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDate, setCreateDate] = useState("");
  const [createCapacity, setCreateCapacity] = useState("50");
  const [createPrice, setCreatePrice] = useState("0");
  const [createIsPublic, setCreateIsPublic] = useState(false);
  const [
    createPublicRegistrationEnabled,
    setCreatePublicRegistrationEnabled
  ] = useState(false);
  const [createWaitlistEnabled, setCreateWaitlistEnabled] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setCreateTitle("");
    setCreateDate("");
    setCreateCapacity("50");
    setCreatePrice("0");
    setCreateIsPublic(false);
    setCreatePublicRegistrationEnabled(false);
    setCreateWaitlistEnabled(true);
    setCreateError(null);
  }, [open]);

  function closeCreateEventModal() {
    if (isCreatingEvent) {
      return;
    }

    onClose();
    setCreateError(null);
  }

  async function handleCreateEvent(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();

    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    const slug = createSlug(createTitle);

    if (!slug) {
      setCreateError(
        "Informe um título válido para gerar o slug do evento."
      );
      return;
    }

    setCreateError(null);
    setIsCreatingEvent(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/events`, {
        body: JSON.stringify({
          capacity: Number(createCapacity),
          date: new Date(createDate).toISOString(),
          isPaid: Number(createPrice) > 0,
          isPublic: createIsPublic,
          price: Number(createPrice),
          publicRegistrationEnabled: createPublicRegistrationEnabled,
          slug,
          title: createTitle,
          waitlistEnabled: createWaitlistEnabled
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
        setCreateError(
          "message" in data && data.message
            ? data.message
            : "Não foi possível cadastrar o evento."
        );
        return;
      }

      if (!("id" in data) || !data.id) {
        setCreateError("Não foi possível cadastrar o evento.");
        return;
      }

      onClose();
      router.push(`/dashboard/eventos/${data.id}`);
    } catch {
      setCreateError("Não foi possível cadastrar o evento agora.");
    } finally {
      setIsCreatingEvent(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div
      onClick={closeCreateEventModal}
      style={{
        alignItems: "center",
        background: "rgba(2, 6, 23, 0.72)",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        padding: "24px",
        position: "fixed",
        zIndex: 60
      }}
    >
      <div
        onClick={(clickEvent) => clickEvent.stopPropagation()}
        style={{
          background:
            "linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.96))",
          border: "1px solid rgba(148, 163, 184, 0.22)",
          borderRadius: "28px",
          boxShadow: "0 28px 90px rgba(2, 6, 23, 0.48)",
          display: "grid",
          gap: "28px",
          maxHeight: "calc(100vh - 48px)",
          maxWidth: "760px",
          overflow: "auto",
          padding: "36px",
          width: "100%"
        }}
      >
        <header
          style={{
            display: "grid",
            gap: "8px"
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
            Módulo Eventos
          </p>

          <h2
            style={{
              color: "#ffffff",
              fontSize: "28px",
              letterSpacing: "-0.03em",
              margin: 0
            }}
          >
            Criar evento
          </h2>

          <p
            style={{
              color: "#94a3b8",
              lineHeight: 1.6,
              margin: 0
            }}
          >
            Cadastre um novo evento com os dados principais e a
            configuração de publicação.
          </p>
        </header>

        {createError ? (
          <p
            style={{
              background: "rgba(127, 29, 29, 0.32)",
              border: "1px solid rgba(248, 113, 113, 0.28)",
              borderRadius: "14px",
              color: "#fecaca",
              margin: 0,
              padding: "14px"
            }}
          >
            {createError}
          </p>
        ) : null}

        <form
          onSubmit={handleCreateEvent}
          style={{
            display: "grid",
            gap: "28px"
          }}
        >
          <section
            style={{
              background: "rgba(15, 23, 42, 0.72)",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              borderRadius: "22px",
              display: "grid",
              gap: "18px",
              padding: "24px"
            }}
          >
            <h3
              style={{
                color: "#ffffff",
                fontSize: "18px",
                margin: 0
              }}
            >
              Dados principais
            </h3>

            <div
              style={{
                display: "grid",
                gap: "16px",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))"
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
                Título

                <input
                  onChange={(changeEvent) =>
                    setCreateTitle(changeEvent.target.value)
                  }
                  required
                  style={{
                    background: "#0f172a",
                    border: "1px solid rgba(148, 163, 184, 0.3)",
                    borderRadius: "12px",
                    color: "#ffffff",
                    font: "inherit",
                    padding: "13px 14px"
                  }}
                  type="text"
                  value={createTitle}
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
                Data e hora

                <input
                  onChange={(changeEvent) =>
                    setCreateDate(changeEvent.target.value)
                  }
                  required
                  style={{
                    background: "#0f172a",
                    border: "1px solid rgba(148, 163, 184, 0.3)",
                    borderRadius: "12px",
                    color: "#ffffff",
                    font: "inherit",
                    padding: "13px 14px"
                  }}
                  type="datetime-local"
                  value={createDate}
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
                  min="1"
                  onChange={(changeEvent) =>
                    setCreateCapacity(changeEvent.target.value)
                  }
                  required
                  style={{
                    background: "#0f172a",
                    border: "1px solid rgba(148, 163, 184, 0.3)",
                    borderRadius: "12px",
                    color: "#ffffff",
                    font: "inherit",
                    padding: "13px 14px"
                  }}
                  type="number"
                  value={createCapacity}
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
                  min="0"
                  onChange={(changeEvent) =>
                    setCreatePrice(changeEvent.target.value)
                  }
                  required
                  step="0.01"
                  style={{
                    background: "#0f172a",
                    border: "1px solid rgba(148, 163, 184, 0.3)",
                    borderRadius: "12px",
                    color: "#ffffff",
                    font: "inherit",
                    padding: "13px 14px"
                  }}
                  type="number"
                  value={createPrice}
                />
              </label>
            </div>
          </section>

          <section
            style={{
              background: "rgba(15, 23, 42, 0.72)",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              borderRadius: "22px",
              display: "grid",
              gap: "18px",
              padding: "24px"
            }}
          >
            <h3
              style={{
                color: "#ffffff",
                fontSize: "18px",
                margin: 0
              }}
            >
              Publicação
            </h3>

            <label
              style={{
                alignItems: "center",
                color: "#e2e8f0",
                display: "flex",
                fontWeight: 800,
                gap: "10px"
              }}
            >
              <input
                checked={createIsPublic}
                onChange={(changeEvent) => {
                  const checked = changeEvent.target.checked;

                  setCreateIsPublic(checked);

                  if (!checked) {
                    setCreatePublicRegistrationEnabled(false);
                  }
                }}
                type="checkbox"
              />
              Evento público
            </label>

            <label
              style={{
                alignItems: "center",
                color: "#e2e8f0",
                display: "flex",
                fontWeight: 800,
                gap: "10px"
              }}
            >
              <input
                checked={createPublicRegistrationEnabled}
                onChange={(changeEvent) =>
                  setCreatePublicRegistrationEnabled(
                    changeEvent.target.checked
                  )
                }
                type="checkbox"
              />
              Inscrições públicas abertas
            </label>

            <label
              style={{
                alignItems: "center",
                color: "#e2e8f0",
                display: "flex",
                fontWeight: 800,
                gap: "10px"
              }}
            >
              <input
                checked={createWaitlistEnabled}
                onChange={(changeEvent) =>
                  setCreateWaitlistEnabled(changeEvent.target.checked)
                }
                type="checkbox"
              />
              Lista de espera habilitada
            </label>
          </section>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              justifyContent: "flex-end"
            }}
          >
            <button
              disabled={isCreatingEvent}
              onClick={closeCreateEventModal}
              style={{
                background: "rgba(15, 23, 42, 0.68)",
                border: "1px solid rgba(148, 163, 184, 0.3)",
                borderRadius: "12px",
                color: "#e2e8f0",
                cursor: isCreatingEvent ? "not-allowed" : "pointer",
                fontWeight: 900,
                opacity: isCreatingEvent ? 0.72 : 1,
                padding: "12px 18px"
              }}
              type="button"
            >
              Cancelar
            </button>

            <button
              disabled={isCreatingEvent}
              style={{
                background: "#2563eb",
                border: 0,
                borderRadius: "12px",
                color: "#ffffff",
                cursor: isCreatingEvent ? "not-allowed" : "pointer",
                fontWeight: 900,
                opacity: isCreatingEvent ? 0.72 : 1,
                padding: "12px 18px"
              }}
              type="submit"
            >
              {isCreatingEvent ? "Criando..." : "Criar evento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
