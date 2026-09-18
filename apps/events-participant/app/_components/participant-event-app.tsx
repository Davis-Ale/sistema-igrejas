"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import type { PublicEvent } from "./public-event";
import styles from "./participant-event-app.module.css";

type ParticipantAppData = {
  registration: {
    status: "CONFIRMED" | "CHECKED_IN";
    paymentStatus: "PAID" | "NOT_REQUIRED";
    checkInToken: string;
    ticketName: string | null;
    ticketBatchName: string | null;
  };
  participant: {
    name: string;
    phone: string;
    email: string | null;
  };
  event: {
    title: string;
    date: string;
    churchName: string;
    location: {
      name: string;
      address: string | null;
    } | null;
  };
  sessions: EventSession[];
  map: {
    imageUrl: string | null;
    points: Array<{
      id: string;
      name: string;
      location: string;
      sortOrder: number;
    }>;
  };
};

type EventSession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  type: string | null;
  facilitator: string | null;
  location: string | null;
  details: string | null;
  isMine: boolean;
};

type AppTab =
  | "home"
  | "schedule"
  | "credential"
  | "map"
  | "profile";

type ParticipantEventAppProps = {
  publicSlug: string;
  event: PublicEvent;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

const NAV_ITEMS: Array<{
  id: AppTab;
  label: string;
}> = [
  { id: "home", label: "Home" },
  { id: "schedule", label: "Cronograma" },
  { id: "credential", label: "Credencial" },
  { id: "map", label: "Mapa" },
  { id: "profile", label: "Perfil" }
];

const EVENT_TIME_ZONE = "America/Sao_Paulo";

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: EVENT_TIME_ZONE
  }).format(new Date(value));
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    weekday: "short",
    timeZone: EVENT_TIME_ZONE
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: EVENT_TIME_ZONE
  }).format(new Date(value));
}

function getEventDayKey(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: EVENT_TIME_ZONE,
    year: "numeric"
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function NavIcon({ tab }: { tab: AppTab }) {
  const common = {
    "aria-hidden": true,
    fill: "none",
    height: 24,
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
    width: 24
  };

  if (tab === "home") {
    return (
      <svg {...common}>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v10h14V10M9 20v-6h6v6" />
      </svg>
    );
  }

  if (tab === "schedule") {
    return (
      <svg {...common}>
        <rect height="17" rx="2" width="18" x="3" y="4" />
        <path d="M8 2v4M16 2v4M3 9h18M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" />
      </svg>
    );
  }

  if (tab === "credential") {
    return (
      <svg {...common}>
        <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v6h-6v-2M14 10v2M10 14h2" />
      </svg>
    );
  }

  if (tab === "map") {
    return (
      <svg {...common}>
        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c.8-4.2 3.5-6 8-6s7.2 1.8 8 6" />
    </svg>
  );
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function getStatusLabel(status: string) {
  return status === "CHECKED_IN"
    ? "Presente"
    : "Confirmada";
}

function SessionCard({ session }: { session: EventSession }) {
  return (
    <article className={styles.sessionCard}>
      <span className={styles.sessionInitials}>
        {getInitials(session.title)}
      </span>
      <div className={styles.sessionBody}>
        <div className={styles.sessionTitleRow}>
          <h3>{session.title}</h3>
          {session.type ? <span>{session.type}</span> : null}
        </div>
        <p>
          {formatTime(session.startsAt)} – {formatTime(session.endsAt)}
          {session.facilitator ? ` · ${session.facilitator}` : ""}
          {session.location ? ` · ${session.location}` : ""}
        </p>
        {session.details ? (
          <p className={styles.sessionDetails}>{session.details}</p>
        ) : null}
      </div>
    </article>
  );
}

export function ParticipantEventApp({
  publicSlug,
  event
}: ParticipantEventAppProps) {
  const sessionKey =
    `event-app:${publicSlug}:check-in-token`;
  const legacyStorageKeyCurrent =
    `event-app:${publicSlug}:check-in-token`;
  const legacyStorageKey =
    `event-app:${event.church.slug}:${event.slug}:check-in-token`;
  const [appData, setAppData] =
    useState<ParticipantAppData | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [isRestoring, setIsRestoring] = useState(true);
  const [isAccessing, setIsAccessing] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [scheduleScope, setScheduleScope] =
    useState<"all" | "mine">("all");
  const [selectedDay, setSelectedDay] = useState<string>("all");
  const [
    installPrompt,
    setInstallPrompt
  ] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [
    showIosInstallInstructions,
    setShowIosInstallInstructions
  ] = useState(false);

  async function accessParticipantApp(
    checkInToken: string,
    persist = true
  ) {
    const response = await fetch(
      `/api/events/${encodeURIComponent(publicSlug)}/access`,
      {
        body: JSON.stringify({ checkInToken }),
        cache: "no-store",
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      }
    );

    const data = await response.json() as
      | ParticipantAppData
      | { message?: string };

    if (!response.ok) {
      throw new Error(
        "message" in data && data.message
          ? data.message
          : "Não foi possível acessar o aplicativo."
      );
    }

    const participantData = data as ParticipantAppData;

    if (!participantData.registration.checkInToken) {
      throw new Error("A credencial não está disponível.");
    }

    if (persist) {
      sessionStorage.setItem(sessionKey, checkInToken);
    }

    setAppData(participantData);
    setError(null);
  }

  useEffect(() => {
    async function restoreAccess() {
      const hashQuery = window.location.hash.startsWith(
        "#aplicativo?"
      )
        ? window.location.hash.slice("#aplicativo?".length)
        : "";
      const tokenFromUrl = new URLSearchParams(hashQuery)
        .get("checkInToken")
        ?.trim();
      if (tokenFromUrl) {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}#aplicativo`
        );
      }
      const legacyToken =
        localStorage.getItem(legacyStorageKeyCurrent) ??
        localStorage.getItem(legacyStorageKey);
      const storedToken =
        sessionStorage.getItem(sessionKey);
      localStorage.removeItem(legacyStorageKeyCurrent);
      localStorage.removeItem(legacyStorageKey);
      const token = tokenFromUrl || storedToken || legacyToken;

      if (!token) {
        setIsRestoring(false);
        return;
      }

      try {
        await accessParticipantApp(token);
      } catch (accessError) {
        sessionStorage.removeItem(sessionKey);
        setError(
          accessError instanceof Error
            ? accessError.message
            : "Não foi possível recuperar sua credencial."
        );
      } finally {
        setIsRestoring(false);
      }
    }

    void restoreAccess();
  }, [
    legacyStorageKey,
    legacyStorageKeyCurrent,
    sessionKey
  ]);

  useEffect(() => {
    const navigatorWithStandalone = navigator as Navigator & {
      standalone?: boolean;
    };
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      navigatorWithStandalone.standalone === true;
    const isIos =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (
        navigator.platform === "MacIntel" &&
        navigator.maxTouchPoints > 1
      );

    setIsInstalled(installed);
    setShowIosInstallInstructions(isIos && !installed);

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function handleInstalled() {
      setIsInstalled(true);
      setInstallPrompt(null);
      setShowIosInstallInstructions(false);
    }

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt
    );
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function handleAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = accessCode.trim();

    if (!token) {
      setError("Informe o código da credencial.");
      return;
    }

    setIsAccessing(true);
    setError(null);

    try {
      await accessParticipantApp(token);
      setAccessCode("");
    } catch (accessError) {
      setError(
        accessError instanceof Error
          ? accessError.message
          : "Não foi possível acessar o aplicativo."
      );
    } finally {
      setIsAccessing(false);
    }
  }

  async function handleInstall() {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;

    if (choice.outcome === "accepted") {
      setIsInstalled(true);
    }

    setInstallPrompt(null);
  }

  function handleEndAccess() {
    sessionStorage.removeItem(sessionKey);
    localStorage.removeItem(legacyStorageKeyCurrent);
    localStorage.removeItem(legacyStorageKey);
    setAppData(null);
    setActiveTab("home");
    setError(null);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}#aplicativo`
    );
  }

  const days = useMemo(
    () => {
      const uniqueDays = new Map<string, string>();

      for (const session of appData?.sessions ?? []) {
        const key = getEventDayKey(session.startsAt);

        if (!uniqueDays.has(key)) {
          uniqueDays.set(key, session.startsAt);
        }
      }

      return Array.from(
        uniqueDays,
        ([key, sample]) => ({ key, sample })
      );
    },
    [appData?.sessions]
  );

  const visibleSessions = useMemo(() => {
    const normalizedSearch = scheduleSearch
      .trim()
      .toLocaleLowerCase("pt-BR");

    return (appData?.sessions ?? []).filter((session) => {
      if (scheduleScope === "mine" && !session.isMine) {
        return false;
      }

      if (
        selectedDay !== "all" &&
        getEventDayKey(session.startsAt) !== selectedDay
      ) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        session.title,
        session.facilitator,
        session.location
      ].some((value) =>
        value?.toLocaleLowerCase("pt-BR").includes(normalizedSearch)
      );
    });
  }, [
    appData?.sessions,
    scheduleScope,
    scheduleSearch,
    selectedDay
  ]);

  const groupedSessions = useMemo(() => {
    const groups = new Map<
      string,
      {
        sample: string;
        sessions: EventSession[];
      }
    >();

    for (const session of visibleSessions) {
      const key = getEventDayKey(session.startsAt);
      const group = groups.get(key);

      if (group) {
        group.sessions.push(session);
      } else {
        groups.set(key, {
          sample: session.startsAt,
          sessions: [session]
        });
      }
    }

    return Array.from(groups, ([key, group]) => ({
      key,
      ...group
    }));
  }, [visibleSessions]);

  if (isRestoring) {
    return (
      <main className={styles.accessPage}>
        <p>Recuperando sua credencial...</p>
      </main>
    );
  }

  if (!appData) {
    return (
      <main className={styles.accessPage}>
        <section className={styles.accessCard}>
          <p className={styles.eyebrow}>Aplicativo do evento</p>
          <h1>{event.title}</h1>
          <p>{formatEventDate(event.date)}</p>
          <form onSubmit={handleAccess}>
            <label htmlFor="credential-code">
              Código da credencial
            </label>
            <input
              autoComplete="off"
              id="credential-code"
              onChange={(inputEvent) =>
                setAccessCode(inputEvent.target.value)
              }
              placeholder="Informe o código recebido"
              value={accessCode}
            />
            <button disabled={isAccessing} type="submit">
              {isAccessing ? "Acessando..." : "Acessar aplicativo"}
            </button>
          </form>
          <p className={styles.accessHint}>
            Este acesso é exclusivo para participantes com inscrição
            confirmada. Abra o link de acesso enviado após a confirmação
            ou informe o código da credencial. Novas inscrições são
            feitas na página pública do evento.
          </p>
          {error ? <p className={styles.error}>{error}</p> : null}
        </section>
      </main>
    );
  }

  const now = Date.now();
  const nextSession =
    appData.sessions.find(
      (session) => new Date(session.endsAt).getTime() >= now
    ) ?? null;
  const otherSessions = appData.sessions.filter(
    (session) => session.id !== nextSession?.id
  );
  const eventLocation =
    appData.event.location?.address ??
    appData.event.location?.name ??
    null;

  return (
    <main className={styles.appShell} id="aplicativo">
      <header className={styles.hero}>
        <p>Olá, {appData.participant.name.split(" ")[0]}</p>
        <strong>{appData.event.churchName}</strong>
        <h1>{appData.event.title}</h1>
        <div className={styles.heroMeta}>
          <span>{formatEventDate(appData.event.date)}</span>
          {eventLocation ? <span>{eventLocation}</span> : null}
        </div>
        <button
          className={styles.endAccess}
          onClick={handleEndAccess}
          type="button"
        >
          Encerrar acesso
        </button>
      </header>

      <div className={styles.content}>
        {activeTab === "home" ? (
          <>
            <section className={styles.participantSummary}>
              <span className={styles.avatar}>
                {getInitials(appData.participant.name)}
              </span>
              <div>
                <strong>{appData.participant.name}</strong>
                <span>Participante</span>
              </div>
              <span className={styles.statusBadge}>
                {getStatusLabel(appData.registration.status)}
              </span>
            </section>

            {!isInstalled &&
            (installPrompt || showIosInstallInstructions) ? (
              <article className={styles.installCard}>
                <div>
                  <strong>Instalar aplicativo</strong>
                  <p>
                    {installPrompt
                      ? "Instale este evento neste dispositivo para acesso direto."
                      : "No Safari, use Compartilhar → Adicionar à Tela de Início."}
                  </p>
                </div>
                {installPrompt ? (
                  <button
                    onClick={() => void handleInstall()}
                    type="button"
                  >
                    Instalar
                  </button>
                ) : null}
              </article>
            ) : null}

            <section>
              <p className={styles.sectionLabel}>Sua próxima sessão</p>
              {nextSession ? (
                <SessionCard session={nextSession} />
              ) : (
                <div className={styles.emptyCard}>
                  Nenhuma próxima sessão publicada.
                </div>
              )}
            </section>

            {otherSessions.length > 0 ? (
              <section>
                <p className={styles.sectionLabel}>Mais sessões</p>
                <div className={styles.cardList}>
                  {otherSessions.map((session) => (
                    <SessionCard key={session.id} session={session} />
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <p className={styles.sectionLabel}>Jornada</p>
              <div className={styles.journey}>
                <span className={styles.journeyDone}>Inscrito</span>
                <span className={styles.journeyDone}>Confirmado</span>
                <span className={styles.journeyDone}>Credencial</span>
                <span
                  className={
                    appData.registration.status === "CHECKED_IN"
                      ? styles.journeyDone
                      : styles.journeyPending
                  }
                >
                  Presente
                </span>
              </div>
            </section>
          </>
        ) : null}

        {activeTab === "schedule" ? (
          <section>
            <div className={styles.scheduleControls}>
              <input
                aria-label="Buscar no cronograma"
                onChange={(inputEvent) =>
                  setScheduleSearch(inputEvent.target.value)
                }
                placeholder="Buscar por nome, facilitador ou local"
                value={scheduleSearch}
              />
              <div className={styles.segmented}>
                <button
                  className={scheduleScope === "all" ? styles.active : ""}
                  onClick={() => setScheduleScope("all")}
                  type="button"
                >
                  Todos
                </button>
                <button
                  className={scheduleScope === "mine" ? styles.active : ""}
                  onClick={() => setScheduleScope("mine")}
                  type="button"
                >
                  Meus
                </button>
              </div>
              <div className={styles.dayFilters}>
                <button
                  className={selectedDay === "all" ? styles.activeDay : ""}
                  onClick={() => setSelectedDay("all")}
                  type="button"
                >
                  Todos os dias
                </button>
                {days.map((day) => (
                  <button
                    className={
                      selectedDay === day.key
                        ? styles.activeDay
                        : ""
                    }
                    key={day.key}
                    onClick={() => setSelectedDay(day.key)}
                    type="button"
                  >
                    {formatDay(day.sample)}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.timeline}>
              {groupedSessions.length > 0 ? (
                groupedSessions.map((group) => (
                  <section className={styles.timelineDay} key={group.key}>
                    <h2>{formatDay(group.sample)}</h2>
                    {group.sessions.map((session) => (
                      <div className={styles.timelineRow} key={session.id}>
                        <time>{formatTime(session.startsAt)}</time>
                        <SessionCard session={session} />
                      </div>
                    ))}
                  </section>
                ))
              ) : (
                <div className={styles.emptyCard}>
                  {scheduleScope === "mine"
                    ? "Você não possui sessões vinculadas neste filtro."
                    : "Nenhuma sessão encontrada."}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {activeTab === "credential" ? (
          <section className={styles.credentialCard}>
            <p className={styles.sectionLabel}>Minha credencial</p>
            <h2>{appData.participant.name}</h2>
            {appData.registration.checkInToken ? (
              <div className={styles.qrCode}>
                <QRCode
                  bgColor="#ffffff"
                  fgColor="#111827"
                  size={210}
                  value={appData.registration.checkInToken}
                />
              </div>
            ) : null}
            <code>{appData.registration.checkInToken}</code>
            <span className={styles.statusBadge}>
              {getStatusLabel(appData.registration.status)}
            </span>
            {appData.registration.ticketName ? (
              <p>
                {appData.registration.ticketName}
                {appData.registration.ticketBatchName
                  ? ` · ${appData.registration.ticketBatchName}`
                  : ""}
              </p>
            ) : null}
          </section>
        ) : null}

        {activeTab === "map" ? (
          <section>
            <p className={styles.sectionLabel}>Mapa do evento</p>
            {appData.map.imageUrl ? (
              <div className={styles.mapImageCard}>
                <img
                  alt={`Planta de ${appData.event.title}`}
                  src={appData.map.imageUrl}
                />
              </div>
            ) : (
              <div className={styles.emptyCard}>
                A planta do evento ainda não foi publicada.
              </div>
            )}
            {appData.map.points.length > 0 ? (
              <div className={styles.mapPoints}>
                {appData.map.points.map((point) => (
                  <article key={point.id}>
                    <strong>{point.name}</strong>
                    <span>{point.location}</span>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "profile" ? (
          <section className={styles.profile}>
            <div className={styles.profileIdentity}>
              <span className={styles.avatar}>
                {getInitials(appData.participant.name)}
              </span>
              <div>
                <h2>{appData.participant.name}</h2>
                <p>Participante</p>
                <span className={styles.statusBadge}>
                  {getStatusLabel(appData.registration.status)}
                </span>
              </div>
            </div>
            <button
              className={styles.credentialLink}
              onClick={() => setActiveTab("credential")}
              type="button"
            >
              Acessar minha credencial
            </button>
            <dl className={styles.profileData}>
              {appData.registration.ticketName ? (
                <div>
                  <dt>Ingresso</dt>
                  <dd>{appData.registration.ticketName}</dd>
                </div>
              ) : null}
              {appData.participant.email ? (
                <div>
                  <dt>E-mail</dt>
                  <dd>{appData.participant.email}</dd>
                </div>
              ) : null}
              <div>
                <dt>Telefone</dt>
                <dd>{appData.participant.phone}</dd>
              </div>
            </dl>
          </section>
        ) : null}
      </div>

      <nav className={styles.bottomNav} aria-label="Navegação do aplicativo">
        {NAV_ITEMS.map((item) => (
          <button
            aria-current={activeTab === item.id ? "page" : undefined}
            className={[
              activeTab === item.id ? styles.navActive : "",
              item.id === "credential" ? styles.navCredential : ""
            ].join(" ")}
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            type="button"
          >
            <span><NavIcon tab={item.id} /></span>
            {item.label}
          </button>
        ))}
      </nav>
    </main>
  );
}
