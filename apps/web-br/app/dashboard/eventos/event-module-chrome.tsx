"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
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
  type LucideIcon
} from "lucide-react";

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

export type EventModuleProductActive = "events" | "financial";

export type EventModuleEventOption = {
  id: string;
  title: string;
};

const SELECTED_EVENT_STORAGE_KEY =
  "sistema-igrejas.events.selectedEventId";

const EVENT_SECTION_NAV_ITEMS: Array<{
  section: EventWorkspaceSection;
  label: string;
  icon: LucideIcon;
}> = [
  { section: "overview", icon: LayoutDashboard, label: "Visão geral" },
  { section: "information", icon: FileText, label: "Informações" },
  { section: "tickets", icon: Ticket, label: "Ingressos" },
  { section: "discounts", icon: Tag, label: "Descontos" },
  {
    section: "registration-form",
    icon: ClipboardList,
    label: "Formulário de inscrição"
  },
  { section: "participants", icon: Users, label: "Participantes" },
  { section: "check-in", icon: CircleCheck, label: "Check-in" },
  { section: "financial", icon: ChartColumn, label: "Financeiro" },
  { section: "event-app", icon: Smartphone, label: "Aplicativo do Evento" }
];

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

const navStyle: CSSProperties = {
  background: "rgba(15, 23, 42, 0.82)",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: "20px",
  display: "grid",
  gap: "6px",
  padding: "12px",
  position: "sticky",
  top: "24px"
};

const createButtonStyle: CSSProperties = {
  alignItems: "center",
  background: "rgba(37, 99, 235, 0.12)",
  border: "1px dashed rgba(96, 165, 250, 0.45)",
  borderRadius: "12px",
  color: "#93c5fd",
  cursor: "pointer",
  display: "flex",
  fontSize: "14px",
  fontWeight: 900,
  gap: "8px",
  padding: "12px 14px",
  textAlign: "left",
  textDecoration: "none",
  width: "100%"
};

const contentGridStyle: CSSProperties = {
  alignItems: "start",
  display: "grid",
  gap: "24px",
  gridTemplateColumns: "minmax(210px, 250px) minmax(0, 1fr)"
};

const contentColumnStyle: CSSProperties = {
  display: "grid",
  gap: "20px",
  minWidth: 0
};

const eventSectionHeadingStyle: CSSProperties = {
  borderTop: "1px solid rgba(148, 163, 184, 0.18)",
  color: "#64748b",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.06em",
  margin: "6px 0 0",
  padding: "10px 4px 2px",
  textTransform: "uppercase"
};

function navItemStyle(active: boolean, enabled = true): CSSProperties {
  return {
    alignItems: "center",
    background: active ? "#2563eb" : "transparent",
    border: 0,
    borderRadius: "12px",
    color: active ? "#ffffff" : "#cbd5e1",
    cursor: enabled ? "pointer" : "default",
    display: "flex",
    fontSize: "13px",
    fontWeight: 900,
    gap: "8px",
    opacity: enabled ? 1 : 0.45,
    padding: "10px 12px",
    textAlign: "left",
    textDecoration: "none",
    width: "100%"
  };
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
      <Icon
        aria-hidden="true"
        size={26}
        strokeWidth={2}
        style={{ flexShrink: 0 }}
      />
      <span style={{ minWidth: 0 }}>{label}</span>
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
  const selectorStyleCompact: CSSProperties = {
    ...selectorStyle,
    fontSize: "13px",
    padding: "8px 10px"
  };

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
        <span key={section} style={navItemStyle(false, false)}>
          {content}
        </span>
      );
    }

    if (isWorkspace) {
      return (
        <button
          key={section}
          onClick={() => onSelectSection?.(section)}
          style={navItemStyle(active)}
          type="button"
        >
          {content}
        </button>
      );
    }

    return (
      <Link
        href={`/dashboard/eventos/${selectedEventId}?section=${section}`}
        key={section}
        onClick={() => persistSelectedEventId(selectedEventId)}
        style={navItemStyle(false)}
      >
        {content}
      </Link>
    );
  }

  return (
    <nav style={navStyle}>
      <Link
        href="/dashboard/eventos"
        style={navItemStyle(productActive === "events")}
      >
        <NavItemContent icon={CalendarDays} label="Meus eventos" />
      </Link>
      {onCreateEvent ? (
        <button
          onClick={onCreateEvent}
          style={createButtonStyle}
          type="button"
        >
          <NavItemContent icon={CalendarPlus} label="Criar evento" />
        </button>
      ) : (
        <Link href="/dashboard/eventos?create=1" style={createButtonStyle}>
          <NavItemContent icon={CalendarPlus} label="Criar evento" />
        </Link>
      )}
      <Link
        href="/dashboard/eventos/gestao-financeira"
        style={navItemStyle(productActive === "financial")}
      >
        <NavItemContent icon={Wallet} label="Gestão Financeira" />
      </Link>

      <p style={eventSectionHeadingStyle}>Evento selecionado</p>

      {events.length === 0 && !selectedEventId ? (
        <p
          style={{
            color: "#94a3b8",
            fontSize: "12px",
            margin: 0,
            padding: "4px 4px 6px"
          }}
        >
          Nenhum evento cadastrado
        </p>
      ) : (
        <select
          aria-label="Evento selecionado"
          onChange={(changeEvent) => {
            const nextEventId = changeEvent.target.value;

            if (nextEventId && nextEventId !== selectedEventId) {
              handleSelectedEventIdChange(nextEventId);
            }
          }}
          style={selectorStyleCompact}
          value={selectedEventId}
        >
          {selectedEventId === "" ? (
            <option value="">Selecionar evento</option>
          ) : null}
          {resolveSelectorEvents(events, selectedEventId, fallbackTitle).map(
            (item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            )
          )}
        </select>
      )}

      {EVENT_SECTION_NAV_ITEMS.map((item) =>
        renderEventSectionItem(item.section, item.label, item.icon)
      )}
    </nav>
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
      <div style={contentGridStyle}>
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
