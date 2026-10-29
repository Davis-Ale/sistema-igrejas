"use client";

import settings from "../event-settings.module.css";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CreateEventModal } from "../create-event-modal";
import {
  EventModuleChrome,
  persistSelectedEventId,
  resolveAuthorizedSelectedEventId
} from "../event-module-chrome";

type LoginSession = {
  token: string;
  user?: { role?: string };
};

type EventListItem = {
  id: string;
  title: string;
};

type EventsReceivingAccountMasked = {
  bankCode: string;
  institutionName: string | null;
  bankAccountType: "CONTA_CORRENTE" | "CONTA_POUPANCA";
  agencyMasked: string;
  accountMasked: string;
  ownerNameMasked: string;
  documentMasked: string;
  updatedAt: string;
};

type EventsReceivingAccountView = {
  configured: boolean;
  canUpdate: boolean;
  account: EventsReceivingAccountMasked | null;
};

type EventApiKeyItem = {
  id: string;
  revokedAt: string | null;
};

type IntegrationStatus = "DISCONNECTED" | "CONNECTED" | "ERROR";

type IntegrationItem = {
  name: string;
  status: IntegrationStatus;
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3002";

function getSession(): LoginSession | null {
  const storedSession = localStorage.getItem("sistema-igrejas.session");

  if (!storedSession) {
    return null;
  }

  try {
    return JSON.parse(storedSession) as LoginSession;
  } catch {
    localStorage.removeItem("sistema-igrejas.session");
    return null;
  }
}

function getSessionToken() {
  return getSession()?.token ?? null;
}

function canManageChurchSettings(session: LoginSession | null) {
  return (
    session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "PASTOR"
  );
}

function roleLabel(role: string | undefined) {
  if (role === "SUPER_ADMIN") {
    return "Super administrador";
  }

  if (role === "PASTOR") {
    return "Pastor";
  }

  if (role === "LEADER") {
    return "Líder";
  }

  return role ?? "—";
}

function bankAccountTypeLabel(
  type: EventsReceivingAccountMasked["bankAccountType"]
) {
  return type === "CONTA_POUPANCA" ? "Poupança" : "Conta corrente";
}

function readErrorMessage(data: ApiErrorResponse, fallback: string) {
  return data.message ?? fallback;
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const data = (await response.json()) as T | ApiErrorResponse;

  if (!response.ok) {
    throw new Error(readErrorMessage(data as ApiErrorResponse, fallback));
  }

  return data as T;
}

export function EventGeneralSettingsClient() {
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [role, setRole] = useState<string | undefined>();
  const [canManage, setCanManage] = useState(false);
  const [receivingAccount, setReceivingAccount] =
    useState<EventsReceivingAccountView | null>(null);
  const [apiKeys, setApiKeys] = useState<EventApiKeyItem[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);

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

  useEffect(() => {
    async function load() {
      const session = getSession();
      const token = session?.token ?? getSessionToken();

      if (!token) {
        window.location.href = "/login";
        return;
      }

      setRole(session?.user?.role);
      setCanManage(canManageChurchSettings(session));
      setIsLoading(true);
      setError(null);

      try {
        const headers = {
          Authorization: `Bearer ${token}`
        };
        const [
          eventsResult,
          accountResult,
          keysResult,
          integrationsResult
        ] = await Promise.allSettled([
          loadEvents(token),
          fetch(`${API_BASE_URL}/api/events/financial/receiving-account`, {
            cache: "no-store",
            headers
          }).then((response) =>
            readJson<EventsReceivingAccountView>(
              response,
              "Não foi possível carregar a conta de recebimento."
            )
          ),
          fetch(`${API_BASE_URL}/api/events/api-keys`, {
            cache: "no-store",
            headers
          }).then((response) =>
            readJson<EventApiKeyItem[]>(
              response,
              "Não foi possível carregar as chaves de API."
            )
          ),
          fetch(`${API_BASE_URL}/api/events/integrations`, {
            cache: "no-store",
            headers
          }).then((response) =>
            readJson<IntegrationItem[]>(
              response,
              "Não foi possível carregar as integrações."
            )
          )
        ]);

        if (accountResult.status === "fulfilled") {
          setReceivingAccount(accountResult.value);
        }

        if (keysResult.status === "fulfilled") {
          setApiKeys(Array.isArray(keysResult.value) ? keysResult.value : []);
        }

        if (integrationsResult.status === "fulfilled") {
          setIntegrations(
            Array.isArray(integrationsResult.value)
              ? integrationsResult.value
              : []
          );
        }

        const failures = [
          eventsResult,
          accountResult,
          keysResult,
          integrationsResult
        ].filter((result) => result.status === "rejected");

        if (failures.length > 0) {
          const firstFailure = failures[0];
          setError(
            firstFailure && firstFailure.status === "rejected"
              ? firstFailure.reason instanceof Error
                ? firstFailure.reason.message
                : "Não foi possível carregar as configurações gerais."
              : "Não foi possível carregar as configurações gerais."
          );
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar as configurações gerais."
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, []);

  const activeApiKeys = apiKeys.filter((item) => !item.revokedAt).length;
  const connectedIntegrations = integrations.filter(
    (item) => item.status === "CONNECTED"
  ).length;
  const account = receivingAccount?.account ?? null;

  return (
    <div className={settings.page}>
      <div className={settings.surface}>
        <EventModuleChrome
          header={
            <header className={settings.header}>
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
                Configurações gerais
              </h1>
              <p
                style={{
                  color: "#94a3b8",
                  fontSize: "14px",
                  margin: "8px 0 0"
                }}
              >
                Configuração da igreja no produto Eventos. Cadastros e
                alterações continuam nas telas já existentes.
              </p>
            </header>
          }
          events={events}
          onCreateEvent={() => setIsCreateModalOpen(true)}
          onSelectedEventIdChange={(nextEventId) => {
            persistSelectedEventId(nextEventId);
            setSelectedEventId(nextEventId);
          }}
          productActive="settings"
          selectedEventId={selectedEventId}
          variant="product"
        >
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

          {isLoading ? (
            <p style={{ color: "#94a3b8", margin: 0 }}>
              Carregando configurações...
            </p>
          ) : (
            <>
              <section className={settings.card}>
                <h2
                  style={{
                    color: "#ffffff",
                    fontSize: "18px",
                    margin: 0
                  }}
                >
                  Permissões
                </h2>
                <p style={{ color: "#cbd5e1", fontSize: "14px", margin: 0 }}>
                  Papel atual: {roleLabel(role)}
                </p>
                <ul
                  style={{
                    color: "#cbd5e1",
                    display: "grid",
                    fontSize: "14px",
                    gap: "8px",
                    lineHeight: 1.5,
                    margin: 0,
                    paddingLeft: "18px"
                  }}
                >
                  <li>
                    Conta de recebimento, API Keys e Integrações: alteração
                    somente Super administrador ou Pastor.
                  </li>
                  <li>
                    Estorno administrativo: somente Super administrador, na
                    Gestão Financeira.
                  </li>
                  <li>
                    Líder visualiza estes dados e não altera conta, chaves ou
                    conexões.
                  </li>
                </ul>
                {!canManage ? (
                  <p style={{ color: "#94a3b8", fontSize: "13px", margin: 0 }}>
                    Seu papel não altera estas configurações.
                  </p>
                ) : null}
              </section>

              <section className={settings.card}>
                <h2
                  style={{
                    color: "#ffffff",
                    fontSize: "18px",
                    margin: 0
                  }}
                >
                  Conta de recebimento
                </h2>
                {account && receivingAccount?.configured ? (
                  <p style={{ color: "#cbd5e1", fontSize: "14px", margin: 0 }}>
                    {account.institutionName
                      ? `${account.bankCode} — ${account.institutionName}`
                      : `Banco ${account.bankCode}`}
                    {" · "}
                    {account.ownerNameMasked}
                    {" · "}
                    {account.documentMasked}
                    {" · "}
                    {bankAccountTypeLabel(account.bankAccountType)}
                    {" · agência "}
                    {account.agencyMasked}
                    {" · conta "}
                    {account.accountMasked}
                  </p>
                ) : (
                  <p style={{ color: "#cbd5e1", fontSize: "14px", margin: 0 }}>
                    Conta não cadastrada.
                  </p>
                )}
                <div className={settings.actions}>
                  <Link
                    className={settings.button}
                    href="/dashboard/eventos/gestao-financeira"
                  >
                    {receivingAccount?.canUpdate
                      ? "Abrir na Gestão Financeira"
                      : "Ver na Gestão Financeira"}
                  </Link>
                </div>
              </section>

              <section className={settings.card}>
                <h2
                  style={{
                    color: "#ffffff",
                    fontSize: "18px",
                    margin: 0
                  }}
                >
                  API Keys
                </h2>
                <p style={{ color: "#cbd5e1", fontSize: "14px", margin: 0 }}>
                  {activeApiKeys} chave{activeApiKeys === 1 ? "" : "s"} ativa
                  {activeApiKeys === 1 ? "" : "s"}
                  {apiKeys.length > activeApiKeys
                    ? ` · ${apiKeys.length - activeApiKeys} revogada${
                        apiKeys.length - activeApiKeys === 1 ? "" : "s"
                      }`
                    : ""}
                  .
                </p>
                <div className={settings.actions}>
                  <Link
                    className={settings.button}
                    href="/dashboard/eventos/api-keys"
                  >
                    {canManage ? "Gerenciar API Keys" : "Ver API Keys"}
                  </Link>
                </div>
              </section>

              <section className={settings.card}>
                <h2
                  style={{
                    color: "#ffffff",
                    fontSize: "18px",
                    margin: 0
                  }}
                >
                  Integrações
                </h2>
                <p style={{ color: "#cbd5e1", fontSize: "14px", margin: 0 }}>
                  {connectedIntegrations} de {integrations.length}{" "}
                  {integrations.length === 1 ? "conexão" : "conexões"}{" "}
                  {connectedIntegrations === 1 ? "ativa" : "ativas"}.
                </p>
                {integrations.length > 0 ? (
                  <ul
                    style={{
                      color: "#cbd5e1",
                      display: "grid",
                      fontSize: "14px",
                      gap: "6px",
                      margin: 0,
                      paddingLeft: "18px"
                    }}
                  >
                    {integrations.map((item) => (
                      <li key={item.name}>
                        {item.name}:{" "}
                        {item.status === "CONNECTED"
                          ? "conectado"
                          : item.status === "ERROR"
                            ? "erro"
                            : "não conectado"}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className={settings.actions}>
                  <Link
                    className={settings.button}
                    href="/dashboard/eventos/integracoes"
                  >
                    {canManage ? "Gerenciar Integrações" : "Ver Integrações"}
                  </Link>
                </div>
              </section>
            </>
          )}
        </EventModuleChrome>
      </div>
      <CreateEventModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
}
