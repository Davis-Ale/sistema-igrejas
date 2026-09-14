"use client";

import { FormEvent, useEffect, useState } from "react";
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

type EventApiKeyScope =
  | "events:read"
  | "registrations:read"
  | "participants:read";

type EventApiKeyItem = {
  id: string;
  name: string;
  description: string | null;
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
};

type CreatedEventApiKey = EventApiKeyItem & {
  token: string;
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3333";

const SCOPE_OPTIONS: Array<{
  value: EventApiKeyScope;
  label: string;
}> = [
  { value: "events:read", label: "events:read" },
  { value: "registrations:read", label: "registrations:read" },
  { value: "participants:read", label: "participants:read" }
];

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

function formatDateTimeCompact(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export function EventApiKeysClient() {
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [items, setItems] = useState<EventApiKeyItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<EventApiKeyScope[]>([
    "events:read"
  ]);
  const [revokingKey, setRevokingKey] = useState<EventApiKeyItem | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  async function loadEvents(token: string) {
    const response = await fetch(`${API_BASE_URL}/api/events?limit=100`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      return;
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

  async function loadApiKeys(token: string) {
    const response = await fetch(`${API_BASE_URL}/api/events/api-keys`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = (await response.json()) as EventApiKeyItem[] | ApiErrorResponse;

    if (!response.ok) {
      throw new Error(
        "message" in data && data.message
          ? data.message
          : "Não foi possível carregar as chaves de API."
      );
    }

    setItems(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    async function load() {
      const token = getSessionToken();

      if (!token) {
        window.location.href = "/login";
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        await Promise.all([loadEvents(token), loadApiKeys(token)]);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar as chaves de API."
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, []);

  function toggleScope(scope: EventApiKeyScope) {
    setSelectedScopes((current) => {
      if (current.includes(scope)) {
        return current.filter((item) => item !== scope);
      }

      return [...current, scope];
    });
  }

  async function handleCreateKey(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();

    const token = getSessionToken();

    if (!token) {
      window.location.href = "/login";
      return;
    }

    const trimmedName = name.trim();

    if (!trimmedName || selectedScopes.length === 0) {
      setError("Informe o nome e ao menos um escopo.");
      return;
    }

    setIsCreating(true);
    setError(null);
    setCopyMessage(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/events/api-keys`, {
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim() || undefined,
          scopes: selectedScopes
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      const data = (await response.json()) as
        | CreatedEventApiKey
        | ApiErrorResponse;

      if (!response.ok) {
        setError(
          "message" in data && data.message
            ? data.message
            : "Não foi possível criar a chave."
        );
        return;
      }

      if (!("token" in data) || !data.token) {
        setError("Não foi possível criar a chave.");
        return;
      }

      const { token: createdToken, ...createdKey } = data;
      setRevealedToken(createdToken);
      setItems((current) => [createdKey, ...current]);
      setName("");
      setDescription("");
      setSelectedScopes(["events:read"]);
    } catch {
      setError("Não foi possível criar a chave agora.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleCopyToken() {
    if (!revealedToken) {
      return;
    }

    try {
      await navigator.clipboard.writeText(revealedToken);
      setCopyMessage("Chave copiada.");
    } catch {
      setCopyMessage("Não foi possível copiar a chave.");
    }
  }

  function closeRevealBanner() {
    setRevealedToken(null);
    setCopyMessage(null);
  }

  async function handleRevokeKey() {
    if (!revokingKey) {
      return;
    }

    const token = getSessionToken();

    if (!token) {
      window.location.href = "/login";
      return;
    }

    setIsRevoking(true);
    setRevokeError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/api-keys/${revokingKey.id}/revoke`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
          method: "POST"
        }
      );

      const data = (await response.json()) as EventApiKeyItem | ApiErrorResponse;

      if (!response.ok) {
        setRevokeError(
          "message" in data && data.message
            ? data.message
            : "Não foi possível revogar a chave."
        );
        return;
      }

      if (!("id" in data)) {
        setRevokeError("Não foi possível revogar a chave.");
        return;
      }

      setItems((current) =>
        current.map((item) => (item.id === data.id ? data : item))
      );
      setRevokingKey(null);
    } catch {
      setRevokeError("Não foi possível revogar a chave agora.");
    } finally {
      setIsRevoking(false);
    }
  }

  return (
    <main
      style={{
        color: "#e2e8f0",
        minHeight: "100vh",
        padding: "28px 24px 48px"
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
                API Keys
              </h1>
              <p
                style={{
                  color: "#94a3b8",
                  fontSize: "14px",
                  margin: "8px 0 0"
                }}
              >
                Chaves da igreja para a API pública de Eventos.
              </p>
            </header>
          }
          events={events}
          onCreateEvent={() => setIsCreateModalOpen(true)}
          onSelectedEventIdChange={(nextEventId) => {
            persistSelectedEventId(nextEventId);
            setSelectedEventId(nextEventId);
          }}
          productActive="api-keys"
          selectedEventId={selectedEventId}
          variant="product"
        >
          {revealedToken ? (
            <div
              style={{
                background: "rgba(5, 150, 105, 0.16)",
                border: "1px solid rgba(52, 211, 153, 0.26)",
                borderRadius: "14px",
                display: "grid",
                gap: "12px",
                padding: "16px"
              }}
            >
              <p
                style={{
                  color: "#a7f3d0",
                  fontSize: "14px",
                  lineHeight: 1.5,
                  margin: 0
                }}
              >
                Copie a chave agora. Ela não será mostrada de novo.
              </p>
              <code
                style={{
                  background: "rgba(2, 6, 23, 0.5)",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  borderRadius: "12px",
                  color: "#bfdbfe",
                  fontSize: "13px",
                  padding: "12px 14px",
                  wordBreak: "break-all"
                }}
              >
                {revealedToken}
              </code>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "10px"
                }}
              >
                <button
                  onClick={() => {
                    void handleCopyToken();
                  }}
                  style={{
                    background: "#2563eb",
                    border: 0,
                    borderRadius: "10px",
                    color: "#ffffff",
                    cursor: "pointer",
                    fontWeight: 800,
                    padding: "10px 14px"
                  }}
                  type="button"
                >
                  Copiar
                </button>
                <button
                  onClick={closeRevealBanner}
                  style={{
                    background: "rgba(15, 23, 42, 0.68)",
                    border: "1px solid rgba(148, 163, 184, 0.3)",
                    borderRadius: "10px",
                    color: "#e2e8f0",
                    cursor: "pointer",
                    fontWeight: 800,
                    padding: "10px 14px"
                  }}
                  type="button"
                >
                  Entendi
                </button>
              </div>
              {copyMessage ? (
                <p
                  style={{
                    color: "#a7f3d0",
                    fontSize: "13px",
                    margin: 0
                  }}
                >
                  {copyMessage}
                </p>
              ) : null}
            </div>
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

          <section
            style={{
              background: "rgba(15, 23, 42, 0.82)",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              borderRadius: "20px",
              display: "grid",
              gap: "16px",
              padding: "22px"
            }}
          >
            <h2
              style={{
                color: "#ffffff",
                fontSize: "18px",
                margin: 0
              }}
            >
              Criar chave
            </h2>
            <form
              onSubmit={handleCreateKey}
              style={{
                display: "grid",
                gap: "14px"
              }}
            >
              <label
                style={{
                  color: "#e2e8f0",
                  display: "grid",
                  fontSize: "13px",
                  fontWeight: 800,
                  gap: "8px"
                }}
              >
                Nome
                <input
                  onChange={(changeEvent) => setName(changeEvent.target.value)}
                  required
                  style={{
                    background: "#0f172a",
                    border: "1px solid rgba(148, 163, 184, 0.3)",
                    borderRadius: "12px",
                    color: "#ffffff",
                    font: "inherit",
                    padding: "11px 12px"
                  }}
                  type="text"
                  value={name}
                />
              </label>
              <label
                style={{
                  color: "#e2e8f0",
                  display: "grid",
                  fontSize: "13px",
                  fontWeight: 800,
                  gap: "8px"
                }}
              >
                Descrição (opcional)
                <input
                  onChange={(changeEvent) =>
                    setDescription(changeEvent.target.value)
                  }
                  style={{
                    background: "#0f172a",
                    border: "1px solid rgba(148, 163, 184, 0.3)",
                    borderRadius: "12px",
                    color: "#ffffff",
                    font: "inherit",
                    padding: "11px 12px"
                  }}
                  type="text"
                  value={description}
                />
              </label>
              <fieldset
                style={{
                  border: 0,
                  display: "grid",
                  gap: "8px",
                  margin: 0,
                  padding: 0
                }}
              >
                <legend
                  style={{
                    color: "#94a3b8",
                    fontSize: "12px",
                    fontWeight: 800,
                    padding: 0
                  }}
                >
                  Escopos
                </legend>
                {SCOPE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    style={{
                      alignItems: "center",
                      color: "#e2e8f0",
                      display: "flex",
                      fontSize: "13px",
                      fontWeight: 700,
                      gap: "8px"
                    }}
                  >
                    <input
                      checked={selectedScopes.includes(option.value)}
                      onChange={() => toggleScope(option.value)}
                      type="checkbox"
                    />
                    {option.label}
                  </label>
                ))}
              </fieldset>
              <button
                disabled={isCreating || selectedScopes.length === 0}
                style={{
                  background: "#2563eb",
                  border: 0,
                  borderRadius: "12px",
                  color: "#ffffff",
                  cursor:
                    isCreating || selectedScopes.length === 0
                      ? "not-allowed"
                      : "pointer",
                  fontWeight: 900,
                  justifySelf: "start",
                  opacity:
                    isCreating || selectedScopes.length === 0 ? 0.72 : 1,
                  padding: "11px 16px"
                }}
                type="submit"
              >
                {isCreating ? "Criando..." : "Criar chave"}
              </button>
            </form>
          </section>

          <section
            style={{
              background: "rgba(15, 23, 42, 0.82)",
              border: "1px solid rgba(148, 163, 184, 0.18)",
              borderRadius: "20px",
              display: "grid",
              gap: "14px",
              padding: "22px"
            }}
          >
            <h2
              style={{
                color: "#ffffff",
                fontSize: "18px",
                margin: 0
              }}
            >
              Chaves
            </h2>
            {isLoading ? (
              <p style={{ color: "#cbd5e1", margin: 0 }}>
                Carregando chaves...
              </p>
            ) : null}
            {!isLoading && items.length === 0 ? (
              <p style={{ color: "#94a3b8", margin: 0 }}>
                Nenhuma chave cadastrada.
              </p>
            ) : null}
            {!isLoading
              ? items.map((item) => {
                  const isRevoked = Boolean(item.revokedAt);

                  return (
                    <article
                      key={item.id}
                      style={{
                        border: "1px solid rgba(148, 163, 184, 0.16)",
                        borderRadius: "14px",
                        display: "grid",
                        gap: "8px",
                        padding: "14px"
                      }}
                    >
                      <div
                        style={{
                          alignItems: "center",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "10px",
                          justifyContent: "space-between"
                        }}
                      >
                        <strong
                          style={{
                            color: "#ffffff",
                            fontSize: "14px"
                          }}
                        >
                          {item.name}
                        </strong>
                        <span
                          style={{
                            background: isRevoked
                              ? "rgba(127, 29, 29, 0.28)"
                              : "rgba(6, 78, 59, 0.42)",
                            borderRadius: "999px",
                            color: isRevoked ? "#fecaca" : "#a7f3d0",
                            fontSize: "11px",
                            fontWeight: 800,
                            padding: "3px 8px"
                          }}
                        >
                          {isRevoked ? "Revogada" : "Ativa"}
                        </span>
                      </div>
                      {item.description ? (
                        <p
                          style={{
                            color: "#94a3b8",
                            fontSize: "13px",
                            margin: 0
                          }}
                        >
                          {item.description}
                        </p>
                      ) : null}
                      <p
                        style={{
                          color: "#cbd5e1",
                          fontSize: "12px",
                          margin: 0
                        }}
                      >
                        Prefixo {item.keyPrefix} · {item.scopes.join(", ")}
                      </p>
                      <p
                        style={{
                          color: "#94a3b8",
                          fontSize: "12px",
                          margin: 0
                        }}
                      >
                        Criada {formatDateTimeCompact(item.createdAt)} · Último
                        uso {formatDateTimeCompact(item.lastUsedAt)}
                      </p>
                      {!isRevoked ? (
                        <button
                          onClick={() => {
                            setRevokeError(null);
                            setRevokingKey(item);
                          }}
                          style={{
                            background: "rgba(127, 29, 29, 0.2)",
                            border: "1px solid rgba(252, 165, 165, 0.28)",
                            borderRadius: "10px",
                            color: "#fca5a5",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: 800,
                            justifySelf: "start",
                            padding: "8px 12px"
                          }}
                          type="button"
                        >
                          Revogar
                        </button>
                      ) : null}
                    </article>
                  );
                })
              : null}
          </section>
        </EventModuleChrome>
      </section>

      <CreateEventModal
        onClose={() => setIsCreateModalOpen(false)}
        open={isCreateModalOpen}
      />

      {revokingKey ? (
        <div
          onClick={() => {
            if (!isRevoking) {
              setRevokingKey(null);
              setRevokeError(null);
            }
          }}
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
              display: "grid",
              gap: "18px",
              maxWidth: "520px",
              padding: "28px",
              width: "100%"
            }}
          >
            <h2
              style={{
                color: "#ffffff",
                fontSize: "22px",
                margin: 0
              }}
            >
              Revogar chave
            </h2>
            <p
              style={{
                color: "#94a3b8",
                lineHeight: 1.5,
                margin: 0
              }}
            >
              A chave {revokingKey.name} deixará de autenticar a API pública.
            </p>
            {revokeError ? (
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
                {revokeError}
              </p>
            ) : null}
            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end"
              }}
            >
              <button
                disabled={isRevoking}
                onClick={() => {
                  setRevokingKey(null);
                  setRevokeError(null);
                }}
                style={{
                  background: "rgba(15, 23, 42, 0.68)",
                  border: "1px solid rgba(148, 163, 184, 0.3)",
                  borderRadius: "12px",
                  color: "#e2e8f0",
                  cursor: isRevoking ? "not-allowed" : "pointer",
                  fontWeight: 900,
                  padding: "11px 16px"
                }}
                type="button"
              >
                Cancelar
              </button>
              <button
                disabled={isRevoking}
                onClick={() => {
                  void handleRevokeKey();
                }}
                style={{
                  background: "rgba(127, 29, 29, 0.2)",
                  border: "1px solid rgba(252, 165, 165, 0.35)",
                  borderRadius: "12px",
                  color: "#fca5a5",
                  cursor: isRevoking ? "not-allowed" : "pointer",
                  fontWeight: 900,
                  padding: "11px 16px"
                }}
                type="button"
              >
                {isRevoking ? "Revogando..." : "Revogar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
