"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Organizer from "../../../../events-organizer/app/organizer";
import {
  CalendarDays,
  CalendarPlus,
  ChartColumn,
  CircleCheck,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Smartphone,
  Tag,
  Ticket,
  Users,
  Wallet,
  KeyRound,
  Plug,
  type LucideIcon
} from "lucide-react";
import styles from "./event-module-chrome.module.css";

export const EVENT_WORKSPACE_SECTIONS = [
  "overview",
  "information",
  "tickets",
  "discounts",
  "registration-form",
  "participants",
  "check-in",
  "financial",
  "event-app"
] as const;

export type EventWorkspaceSection =
  (typeof EVENT_WORKSPACE_SECTIONS)[number];

export type EventModuleChromeVariant = "workspace" | "product";

export type EventModuleProductActive =
  | "events"
  | "financial"
  | "api-keys"
  | "integrations";

export type EventModuleEventOption = {
  id: string;
  title: string;
};

const SELECTED_EVENT_STORAGE_KEY =
  "sistema-igrejas.events.selectedEventId";

const backLinkStyle: CSSProperties = {
  color: "#93c5fd",
  fontSize: "14px",
  fontWeight: 800,
  textDecoration: "none"
};

const selectorLabelStyle: CSSProperties = {
  color: "#94a3b8",
  display: "grid",
  fontSize: "12px",
  fontWeight: 800,
  gap: "8px",
  marginBottom: "14px",
  maxWidth: "420px"
};

const selectorStyle: CSSProperties = {
  background: "#0f172a",
  border: "1px solid rgba(148, 163, 184, 0.3)",
  borderRadius: "12px",
  color: "#ffffff",
  font: "inherit",
  fontSize: "14px",
  fontWeight: 700,
  padding: "11px 12px",
  width: "100%"
};

const contentColumnStyle: CSSProperties = {
  display: "grid",
  gap: "20px",
  minWidth: 0
};

function navItemClassName(active: boolean, enabled = true) {
  if (!enabled) {
    return `${styles.item} ${styles.itemDisabled}`;
  }

  if (active) {
    return `${styles.item} ${styles.itemActive}`;
  }

  return styles.item;
}

function NavItemContent({
  icon: Icon,
  label
}: {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <>
      <span className={styles.icon}>
        <Icon aria-hidden="true" size={18} strokeWidth={2} />
      </span>
      <span className={styles.label}>{label}</span>
    </>
  );
}

export function isEventWorkspaceSection(
  value: string | undefined
): value is EventWorkspaceSection {
  return (
    value !== undefined &&
    (EVENT_WORKSPACE_SECTIONS as readonly string[]).includes(value)
  );
}

export function readStoredSelectedEventId() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return sessionStorage.getItem(SELECTED_EVENT_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function persistSelectedEventId(eventId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (eventId) {
      sessionStorage.setItem(SELECTED_EVENT_STORAGE_KEY, eventId);
    } else {
      sessionStorage.removeItem(SELECTED_EVENT_STORAGE_KEY);
    }
  } catch {
    return;
  }
}

export function resolveAuthorizedSelectedEventId(
  events: EventModuleEventOption[],
  preferredId = ""
) {
  const authorized = new Set(events.map((item) => item.id));

  if (preferredId && authorized.has(preferredId)) {
    return preferredId;
  }

  const stored = readStoredSelectedEventId();

  if (stored && authorized.has(stored)) {
    return stored;
  }

  return events[0]?.id ?? "";
}

function resolveSelectorEvents(
  events: EventModuleEventOption[],
  selectedEventId: string,
  fallbackTitle?: string
) {
  if (
    selectedEventId &&
    !events.some((item) => item.id === selectedEventId)
  ) {
    return [
      {
        id: selectedEventId,
        title: fallbackTitle ?? "Evento"
      },
      ...events
    ];
  }

  if (events.length > 0) {
    return events;
  }

  if (selectedEventId) {
    return [
      {
        id: selectedEventId,
        title: fallbackTitle ?? "Evento"
      }
    ];
  }

  return [];
}

export function EventModuleBackLink({
  href = "/dashboard",
  children = "Voltar ao painel"
}: {
  href?: string;
  children?: ReactNode;
}) {
  return (
    <Link href={href} style={backLinkStyle}>
      {children}
    </Link>
  );
}

export function EventModuleEventSelector({
  events,
  selectedEventId,
  onSelectedEventIdChange,
  fallbackTitle,
  label = "Evento"
}: {
  events: EventModuleEventOption[];
  selectedEventId: string;
  onSelectedEventIdChange: (eventId: string) => void;
  fallbackTitle?: string | undefined;
  label?: string;
}) {
  const options = resolveSelectorEvents(
    events,
    selectedEventId,
    fallbackTitle
  );

  return (
    <label style={selectorLabelStyle}>
      {label}
      <select
        aria-label={label}
        onChange={(changeEvent) => {
          const nextEventId = changeEvent.target.value;

          if (nextEventId !== selectedEventId) {
            onSelectedEventIdChange(nextEventId);
          }
        }}
        style={selectorStyle}
        value={selectedEventId}
      >
        {selectedEventId === "" ? (
          <option value="">Evento</option>
        ) : null}
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </select>
    </label>
  );
}

export function EventModuleNav({
  variant,
  activeSection,
  productActive,
  selectedEventId = "",
  events = [],
  fallbackTitle,
  onSelectedEventIdChange,
  onSelectSection,
  onCreateEvent
}: {
  variant: EventModuleChromeVariant;
  activeSection?: EventWorkspaceSection | undefined;
  productActive?: EventModuleProductActive | undefined;
  selectedEventId?: string;
  events?: EventModuleEventOption[];
  fallbackTitle?: string | undefined;
  onSelectedEventIdChange?: ((eventId: string) => void) | undefined;
  onSelectSection?: ((section: EventWorkspaceSection) => void) | undefined;
  onCreateEvent?: (() => void) | undefined;
}) {
  const isWorkspace = variant === "workspace";
  const hasSelectedEvent = Boolean(selectedEventId);
  const [organizerOpen, setOrganizerOpen] = useState(false);
  const organizerDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (organizerOpen) organizerDialog.current?.showModal();
  }, [organizerOpen]);

  function handleSelectedEventIdChange(nextEventId: string) {
    persistSelectedEventId(nextEventId);
    onSelectedEventIdChange?.(nextEventId);
  }

  function renderEventSectionItem(
    section: EventWorkspaceSection,
    label: string,
    icon: LucideIcon
  ) {
    const active = isWorkspace && activeSection === section;
    const content = <NavItemContent icon={icon} label={label} />;

    if (!hasSelectedEvent) {
      return (
        <span
          className={navItemClassName(false, false)}
          key={section}
        >
          {content}
        </span>
      );
    }

    if (isWorkspace) {
      return (
        <button
          className={navItemClassName(active)}
          key={section}
          onClick={() => onSelectSection?.(section)}
          type="button"
        >
          {content}
        </button>
      );
    }

    return (
      <Link
        className={navItemClassName(false)}
        href={`/dashboard/eventos/${selectedEventId}?section=${section}`}
        key={section}
        onClick={() => persistSelectedEventId(selectedEventId)}
      >
        {content}
      </Link>
    );
  }

  return (
    <>
    <nav className={styles.nav}>
      <div className={styles.block}>
        {events.length === 0 && !selectedEventId ? (
          <p className={styles.emptyHint}>Nenhum evento cadastrado</p>
        ) : (
          <select
            aria-label="Evento selecionado"
            className={styles.selector}
            onChange={(changeEvent) => {
              const nextEventId = changeEvent.target.value;

              if (nextEventId && nextEventId !== selectedEventId) {
                handleSelectedEventIdChange(nextEventId);
              }
            }}
            value={selectedEventId}
          >
            {selectedEventId === "" ? (
              <option value="">Selecionar evento</option>
            ) : null}
            {resolveSelectorEvents(
              events,
              selectedEventId,
              fallbackTitle
            ).map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        )}

        <Link
          className={navItemClassName(productActive === "events")}
          href="/dashboard/eventos"
        >
          <NavItemContent icon={CalendarDays} label="Meus eventos" />
        </Link>
        {renderEventSectionItem("overview", "Visão geral", LayoutDashboard)}
        {onCreateEvent ? (
          <button
            className={styles.createItem}
            onClick={onCreateEvent}
            type="button"
          >
            <NavItemContent icon={CalendarPlus} label="Criar evento" />
          </button>
        ) : (
          <Link
            className={styles.createItem}
            href="/dashboard/eventos?create=1"
          >
            <NavItemContent icon={CalendarPlus} label="Criar evento" />
          </Link>
        )}
        {renderEventSectionItem("information", "Informações", FileText)}
        {renderEventSectionItem("tickets", "Ingressos", Ticket)}
        {renderEventSectionItem("discounts", "Descontos", Tag)}
        {renderEventSectionItem(
          "registration-form",
          "Formulário de inscrição",
          ClipboardList
        )}
        {renderEventSectionItem("participants", "Participantes", Users)}
        {renderEventSectionItem("check-in", "Check-in", CircleCheck)}
        {renderEventSectionItem("financial", "Financeiro", ChartColumn)}
        <Link
          className={navItemClassName(productActive === "financial")}
          href="/dashboard/eventos/gestao-financeira"
        >
          <NavItemContent icon={Wallet} label="Gestão Financeira" />
        </Link>
        {renderEventSectionItem(
          "event-app",
          "Aplicativo do Participante",
          Smartphone
        )}
        <button
          className={navItemClassName(organizerOpen)}
          onClick={() => setOrganizerOpen(true)}
          type="button"
        >
          <NavItemContent icon={Smartphone} label="Aplicativo do Organizador" />
        </button>
        <Link
          className={navItemClassName(productActive === "api-keys")}
          href="/dashboard/eventos/api-keys"
        >
          <NavItemContent icon={KeyRound} label="API Keys" />
        </Link>
        <Link
          className={navItemClassName(productActive === "integrations")}
          href="/dashboard/eventos/integracoes"
        >
          <NavItemContent icon={Plug} label="Integrações" />
        </Link>
      </div>
    </nav>
    {organizerOpen ? (
      <dialog
        ref={organizerDialog}
        className={styles.organizerDialog}
        aria-label="Aplicativo do Organizador"
        onClose={() => setOrganizerOpen(false)}
      >
        <button className={styles.organizerClose} type="button" onClick={() => organizerDialog.current?.close()}>
          Fechar
        </button>
        <Organizer {...(selectedEventId ? { initialEvent: {
          id: selectedEventId,
          title: events.find((event) => event.id === selectedEventId)?.title ?? fallbackTitle ?? "Evento"
        } } : {})} />
      </dialog>
    ) : null}
    </>
  );
}

export function EventModuleChrome({
  variant,
  selectedEventId = "",
  events = [],
  fallbackTitle,
  activeSection,
  productActive,
  onSelectedEventIdChange,
  onSelectSection,
  onCreateEvent,
  header,
  children
}: {
  variant: EventModuleChromeVariant;
  selectedEventId?: string;
  events?: EventModuleEventOption[];
  fallbackTitle?: string | undefined;
  activeSection?: EventWorkspaceSection | undefined;
  productActive?: EventModuleProductActive | undefined;
  onSelectedEventIdChange?: ((eventId: string) => void) | undefined;
  onSelectSection?: ((section: EventWorkspaceSection) => void) | undefined;
  onCreateEvent?: (() => void) | undefined;
  header: ReactNode;
  children: ReactNode;
}) {
  const isProduct = variant === "product";

  return (
    <>
      <EventModuleBackLink
        href={isProduct ? "/dashboard" : "/dashboard/eventos"}
      >
        {isProduct ? "Voltar ao painel" : "Meus eventos"}
      </EventModuleBackLink>
      {header}
      <div className={styles.layout}>
        <EventModuleNav
          activeSection={activeSection}
          events={events}
          fallbackTitle={fallbackTitle}
          onCreateEvent={onCreateEvent}
          onSelectSection={onSelectSection}
          onSelectedEventIdChange={onSelectedEventIdChange}
          productActive={productActive}
          selectedEventId={selectedEventId}
          variant={variant}
        />
        <div style={contentColumnStyle}>{children}</div>
      </div>
    </>
  );
}
