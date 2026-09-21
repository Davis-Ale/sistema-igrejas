"use client";

import settings from "../event-settings.module.css";
import brands from "./integration-brands.module.css";

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

type IntegrationProvider =
  | "GOOGLE_ANALYTICS"
  | "GOOGLE_ADS"
  | "META_PIXEL"
  | "WHATSAPP_BUSINESS_CLOUD"
  | "MAILCHIMP"
  | "RD_STATION";

type IntegrationStatus = "DISCONNECTED" | "CONNECTED" | "ERROR";

const PROVIDER_LOGO: Record<IntegrationProvider, string> = {
  GOOGLE_ANALYTICS: "/integrations/google-analytics.svg",
  GOOGLE_ADS: "/integrations/google-ads.svg",
  META_PIXEL: "/integrations/meta.svg",
  WHATSAPP_BUSINESS_CLOUD: "/integrations/whatsapp.svg",
  MAILCHIMP: "/integrations/mailchimp.png",
  RD_STATION: "/integrations/rd-station.png"
};

type IntegrationPublicConfig = {
  measurementId: string | null;
  conversionId: string | null;
  conversionLabel: string | null;
  pixelId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  datacenter: string | null;
};

type IntegrationItem = {
  provider: IntegrationProvider;
  name: string;
  category: "Dados" | "Automação de marketing";
  description: string;
  status: IntegrationStatus;
  connectable: boolean;
  blockedReason: "PLATFORM_CREDENTIALS_REQUIRED" | null;
  missingRequirements: string[];
  publicConfig: IntegrationPublicConfig | null;
  secretHint: string | null;
  connectedAt: string | null;
  lastError: string | null;
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3333";

const PROVIDER_SLUG: Record<IntegrationProvider, string> = {
  GOOGLE_ANALYTICS: "google-analytics",
  GOOGLE_ADS: "google-ads",
  META_PIXEL: "meta-pixel",
  WHATSAPP_BUSINESS_CLOUD: "whatsapp-business-cloud",
  MAILCHIMP: "mailchimp",
  RD_STATION: "rd-station"
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

function statusLabel(status: IntegrationStatus) {
  if (status === "CONNECTED") {
    return "Conectado";
  }

  if (status === "ERROR") {
    return "Erro";
  }

  return "Não conectado";
}

function statusColors(status: IntegrationStatus) {
  if (status === "CONNECTED") {
    return {
      background: "rgba(6, 78, 59, 0.42)",
      color: "#a7f3d0"
    };
  }

  if (status === "ERROR") {
    return {
      background: "rgba(127, 29, 29, 0.28)",
      color: "#fecaca"
    };
  }

  return {
    background: "rgba(30, 41, 59, 0.72)",
    color: "#cbd5e1"
  };
}

function readErrorMessage(data: ApiErrorResponse, fallback: string) {
  return data.message ?? fallback;
}

export function EventIntegrationsClient() {
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [items, setItems] = useState<IntegrationItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [connectingProvider, setConnectingProvider] =
    useState<IntegrationItem | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] =
    useState<IntegrationItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [measurementId, setMeasurementId] = useState("");
  const [conversionId, setConversionId] = useState("");
  const [conversionLabel, setConversionLabel] = useState("");
  const [pixelId, setPixelId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");

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

  async function loadIntegrations(token: string) {
    const response = await fetch(`${API_BASE_URL}/api/events/integrations`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = (await response.json()) as
      | IntegrationItem[]
      | ApiErrorResponse;

    if (!response.ok) {
      throw new Error(
        readErrorMessage(
          data as ApiErrorResponse,
          "Não foi possível carregar as integrações."
        )
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
        await Promise.all([loadEvents(token), loadIntegrations(token)]);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar as integrações."
        );
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, []);

  function openConnectModal(item: IntegrationItem) {
    setConnectingProvider(item);
    setFormError(null);
    setMeasurementId(item.publicConfig?.measurementId ?? "");
    setConversionId(item.publicConfig?.conversionId ?? "");
    setConversionLabel(item.publicConfig?.conversionLabel ?? "");
    setPixelId(item.publicConfig?.pixelId ?? "");
    setApiKey("");
    setAccessToken("");
    setPhoneNumberId(item.publicConfig?.phoneNumberId ?? "");
  }

  function closeConnectModal() {
    if (isSaving) {
      return;
    }

    setConnectingProvider(null);
    setFormError(null);
    setApiKey("");
    setAccessToken("");
  }

  function buildConnectBody(provider: IntegrationProvider) {
    if (provider === "GOOGLE_ANALYTICS") {
      return { measurementId: measurementId.trim() };
    }

    if (provider === "GOOGLE_ADS") {
      return {
        conversionId: conversionId.trim(),
        conversionLabel: conversionLabel.trim()
      };
    }

    if (provider === "META_PIXEL") {
      return { pixelId: pixelId.trim() };
    }

    if (provider === "MAILCHIMP") {
      return { apiKey: apiKey.trim() };
    }

    if (provider === "WHATSAPP_BUSINESS_CLOUD") {
      return {
        accessToken: accessToken.trim(),
        phoneNumberId: phoneNumberId.trim()
      };
    }

    return {};
  }

  async function handleConnect(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();

    if (!connectingProvider) {
      return;
    }

    const token = getSessionToken();

    if (!token) {
      window.location.href = "/login";
      return;
    }

    setIsSaving(true);
    setFormError(null);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/integrations/${PROVIDER_SLUG[connectingProvider.provider]}/connect`,
        {
          body: JSON.stringify(buildConnectBody(connectingProvider.provider)),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );

      const data = (await response.json()) as
        | IntegrationItem
        | ApiErrorResponse;

      if (!response.ok) {
        setFormError(
          readErrorMessage(
            data as ApiErrorResponse,
            "Não foi possível conectar esta integração."
          )
        );
        return;
      }

      if (!("provider" in data)) {
        setFormError("Não foi possível conectar esta integração.");
        return;
      }

      setItems((current) =>
        current.map((item) =>
          item.provider === data.provider ? data : item
        )
      );
      setConnectingProvider(null);
      setApiKey("");
      setAccessToken("");
    } catch {
      setFormError("Não foi possível conectar esta integração agora.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!disconnectingProvider) {
      return;
    }

    const token = getSessionToken();

    if (!token) {
      window.location.href = "/login";
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/integrations/${PROVIDER_SLUG[disconnectingProvider.provider]}/disconnect`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
          method: "POST"
        }
      );

      const data = (await response.json()) as
        | IntegrationItem
        | ApiErrorResponse;

      if (!response.ok) {
        setFormError(
          readErrorMessage(
            data as ApiErrorResponse,
            "Não foi possível desconectar esta integração."
          )
        );
        return;
      }

      if (!("provider" in data)) {
        setFormError("Não foi possível desconectar esta integração.");
        return;
      }

      setItems((current) =>
        current.map((item) =>
          item.provider === data.provider ? data : item
        )
      );
      setDisconnectingProvider(null);
    } catch {
      setFormError("Não foi possível desconectar esta integração agora.");
    } finally {
      setIsSaving(false);
    }
  }

  function connectedSummary(item: IntegrationItem) {
    const config = item.publicConfig;

    if (!config) {
      return item.secretHint ? `Credencial ${item.secretHint}` : null;
    }

    const parts = [
      config.measurementId,
      config.conversionId,
      config.conversionLabel,
      config.pixelId,
      config.displayPhoneNumber ?? config.phoneNumberId,
      config.datacenter ? `dc ${config.datacenter}` : null,
      item.secretHint
    ].filter((value): value is string => Boolean(value));

    return parts.length > 0 ? parts.join(" · ") : null;
  }

  return (
    <main
      className={`${settings.page} ${settings.surface}`}
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
              className={settings.header}
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
                Integrações
              </h1>
              <p
                style={{
                  color: "#94a3b8",
                  fontSize: "14px",
                  margin: "8px 0 0"
                }}
              >
                Conecte ferramentas da igreja à página pública e à operação de
                Eventos. Credenciais nunca são exibidas depois de salvas.
              </p>
            </header>
          }
          events={events}
          onCreateEvent={() => setIsCreateModalOpen(true)}
          onSelectedEventIdChange={(nextEventId) => {
            persistSelectedEventId(nextEventId);
            setSelectedEventId(nextEventId);
          }}
          productActive="integrations"
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

          <section
            className={settings.integrationGrid}
          >
            {isLoading ? (
              <p style={{ color: "#cbd5e1", margin: 0 }}>
                Carregando integrações...
              </p>
            ) : null}
            {!isLoading
              ? items.map((item) => {
                  const colors = statusColors(item.status);
                  const summary = connectedSummary(item);
                  const canConnect =
                    item.connectable && item.status !== "CONNECTED";
                  const canDisconnect = item.status === "CONNECTED";

                  return (
                    <article
                      key={item.provider}
                      className={settings.integrationCard}
                    >
                      <div className={brands.heading}>
                        <div className={brands.identity}>
                          <span className={brands.logo} data-provider={item.provider} aria-hidden="true">
                            <img src={PROVIDER_LOGO[item.provider]} alt="" width={26} height={26} />
                          </span>
                          <strong>{item.name}</strong>
                        </div>
                        <span
                          className={brands.status}
                          style={{
                            background: colors.background,
                            borderRadius: "999px",
                            color: colors.color,
                            fontSize: "11px",
                            fontWeight: 800,
                            padding: "3px 8px"
                          }}
                        >
                          {statusLabel(item.status)}
                        </span>
                      </div>
                      <p
                        style={{
                          color: "#94a3b8",
                          fontSize: "12px",
                          fontWeight: 800,
                          margin: 0
                        }}
                      >
                        {item.category}
                      </p>
                      <p
                        style={{
                          color: "#cbd5e1",
                          fontSize: "13px",
                          lineHeight: 1.5,
                          margin: 0
                        }}
                      >
                        {item.description}
                      </p>
                      {summary ? (
                        <p
                          style={{
                            color: "#93c5fd",
                            fontSize: "12px",
                            margin: 0
                          }}
                        >
                          {summary}
                        </p>
                      ) : null}
                      {item.lastError ? (
                        <p
                          style={{
                            color: "#fecaca",
                            fontSize: "12px",
                            margin: 0
                          }}
                        >
                          {item.lastError}
                        </p>
                      ) : null}
                      {!item.connectable ? (
                        <p
                          style={{
                            color: "#fde68a",
                            fontSize: "13px",
                            lineHeight: 1.5,
                            margin: 0
                          }}
                        >
                          Não é possível conectar agora. Falta o aplicativo
                          OAuth RD Station da plataforma.
                          {item.missingRequirements.length > 0
                            ? ` ${item.missingRequirements.join(" ")}`
                            : ""}
                        </p>
                      ) : null}
                      <div
                        className={settings.actions}
                      >
                        {canConnect ? (
                          <button
                            onClick={() => openConnectModal(item)}
                            className={settings.primary}
                            type="button"
                          >
                            Conectar
                          </button>
                        ) : null}
                        {canDisconnect ? (
                          <button
                            onClick={() => {
                              setFormError(null);
                              setDisconnectingProvider(item);
                            }}
                            className={settings.danger}
                            type="button"
                          >
                            Desconectar
                          </button>
                        ) : null}
                      </div>
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

      {connectingProvider ? (
        <div
          onClick={closeConnectModal}
          className={settings.overlay}
        >
          <div
            onClick={(clickEvent) => clickEvent.stopPropagation()}
            className={settings.modal}
          >
            <h2
              style={{
                color: "#ffffff",
                fontSize: "22px",
                margin: 0
              }}
            >
              Conectar {connectingProvider.name}
            </h2>
            <p
              style={{
                color: "#94a3b8",
                lineHeight: 1.5,
                margin: 0
              }}
            >
              {connectingProvider.description}
            </p>
            {formError ? (
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
                {formError}
              </p>
            ) : null}
            <form
              onSubmit={handleConnect}
              className={settings.form}
            >
              {connectingProvider.provider === "GOOGLE_ANALYTICS" ? (
                <label className={settings.field}>
                  Measurement ID (GA4)
                  <input
                    onChange={(changeEvent) =>
                      setMeasurementId(changeEvent.target.value)
                    }
                    placeholder="G-XXXXXXXX"
                    required
                    className={settings.input}
                    type="text"
                    value={measurementId}
                  />
                </label>
              ) : null}
              {connectingProvider.provider === "GOOGLE_ADS" ? (
                <>
                  <label className={settings.field}>
                    Conversion ID
                    <input
                      onChange={(changeEvent) =>
                        setConversionId(changeEvent.target.value)
                      }
                      placeholder="AW-000000000"
                      required
                      className={settings.input}
                      type="text"
                      value={conversionId}
                    />
                  </label>
                  <label className={settings.field}>
                    Rótulo de conversão
                    <input
                      onChange={(changeEvent) =>
                        setConversionLabel(changeEvent.target.value)
                      }
                      required
                      className={settings.input}
                      type="text"
                      value={conversionLabel}
                    />
                  </label>
                </>
              ) : null}
              {connectingProvider.provider === "META_PIXEL" ? (
                <label className={settings.field}>
                  Pixel ID
                  <input
                    onChange={(changeEvent) =>
                      setPixelId(changeEvent.target.value)
                    }
                    required
                    className={settings.input}
                    type="text"
                    value={pixelId}
                  />
                </label>
              ) : null}
              {connectingProvider.provider === "MAILCHIMP" ? (
                <label className={settings.field}>
                  API key
                  <input
                    autoComplete="off"
                    onChange={(changeEvent) =>
                      setApiKey(changeEvent.target.value)
                    }
                    placeholder="chave-us14"
                    required
                    className={settings.input}
                    type="password"
                    value={apiKey}
                  />
                </label>
              ) : null}
              {connectingProvider.provider === "WHATSAPP_BUSINESS_CLOUD" ? (
                <>
                  <label className={settings.field}>
                    Token de acesso
                    <input
                      autoComplete="off"
                      onChange={(changeEvent) =>
                        setAccessToken(changeEvent.target.value)
                      }
                      required
                      className={settings.input}
                      type="password"
                      value={accessToken}
                    />
                  </label>
                  <label className={settings.field}>
                    Phone Number ID
                    <input
                      onChange={(changeEvent) =>
                        setPhoneNumberId(changeEvent.target.value)
                      }
                      required
                      className={settings.input}
                      type="text"
                      value={phoneNumberId}
                    />
                  </label>
                </>
              ) : null}
              <div
                className={settings.modalActions}
              >
                <button
                  disabled={isSaving}
                  onClick={closeConnectModal}
                  className={settings.button}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  disabled={isSaving}
                  className={settings.primary}
                  type="submit"
                >
                  {isSaving ? "Conectando..." : "Conectar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {disconnectingProvider ? (
        <div
          onClick={() => {
            if (!isSaving) {
              setDisconnectingProvider(null);
              setFormError(null);
            }
          }}
          className={settings.overlay}
        >
          <div
            onClick={(clickEvent) => clickEvent.stopPropagation()}
            className={settings.modal}
          >
            <h2
              style={{
                color: "#ffffff",
                fontSize: "22px",
                margin: 0
              }}
            >
              Desconectar {disconnectingProvider.name}
            </h2>
            <p
              style={{
                color: "#94a3b8",
                lineHeight: 1.5,
                margin: 0
              }}
            >
              A conexão da igreja com {disconnectingProvider.name} será
              encerrada. Credenciais salvas serão removidas.
            </p>
            {formError ? (
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
                {formError}
              </p>
            ) : null}
            <div
              className={settings.modalActions}
            >
              <button
                disabled={isSaving}
                onClick={() => {
                  setDisconnectingProvider(null);
                  setFormError(null);
                }}
                className={settings.button}
                type="button"
              >
                Cancelar
              </button>
              <button
                disabled={isSaving}
                onClick={() => {
                  void handleDisconnect();
                }}
                className={settings.danger}
                type="button"
              >
                {isSaving ? "Desconectando..." : "Desconectar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
