"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

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

export type EventModuleChromeVariant = "workspace" | "management";

export type EventModuleEventOption = {
  id: string;
  title: string;
};

const WORKSPACE_NAV_ITEMS: Array<
  | { kind: "section"; section: EventWorkspaceSection; label: string }
  | { kind: "management"; label: "Gestão Financeira" }
> = [
  { kind: "section", section: "information", label: "Informações" },
  { kind: "section", section: "tickets", label: "Ingressos" },
  { kind: "section", section: "discounts", label: "Descontos" },
  {
    kind: "section",
    section: "registration-form",
    label: "Formulário de inscrição"
  },
  { kind: "section", section: "participants", label: "Participantes" },
  { kind: "section", section: "check-in", label: "Check-in" },
  { kind: "section", section: "financial", label: "Financeiro" },
  { kind: "management", label: "Gestão Financeira" },
  { kind: "section", section: "event-app", label: "Aplicativo do Evento" }
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
  padding: "11px 12px"
};

const navStyle: CSSProperties = {
  background: "rgba(15, 23, 42, 0.82)",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: "20px",
  display: "grid",
  gap: "8px",
  padding: "12px",
  position: "sticky",
  top: "24px"
};

const createButtonStyle: CSSProperties = {
  background: "rgba(37, 99, 235, 0.12)",
  border: "1px dashed rgba(96, 165, 250, 0.45)",
  borderRadius: "12px",
  color: "#93c5fd",
  cursor: "pointer",
  display: "block",
  fontSize: "14px",
  fontWeight: 900,
  padding: "12px 14px",
  textAlign: "left",
  textDecoration: "none"
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

function navItemStyle(active: boolean): CSSProperties {
  return {
    background: active ? "#2563eb" : "transparent",
    border: 0,
    borderRadius: "12px",
    color: active ? "#ffffff" : "#cbd5e1",
    cursor: "pointer",
    display: "block",
    fontSize: "14px",
    fontWeight: 900,
    padding: "12px 14px",
    textAlign: "left",
    textDecoration: "none",
    width: "100%"
  };
}

export function isEventWorkspaceSection(
  value: string | undefined
): value is EventWorkspaceSection {
  return (
    value !== undefined &&
    (EVENT_WORKSPACE_SECTIONS as readonly string[]).includes(value)
  );
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

function workspaceHref(selectedEventId: string, query: string) {
  if (!selectedEventId) {
    return "/dashboard/eventos";
  }

  return `/dashboard/eventos/${selectedEventId}?${query}`;
}

function managementHref(selectedEventId: string) {
  if (!selectedEventId) {
    return "/dashboard/eventos/gestao-financeira";
  }

  return `/dashboard/eventos/gestao-financeira?from=${encodeURIComponent(selectedEventId)}`;
}

export function EventModuleBackLink() {
  return (
    <Link href="/dashboard" style={backLinkStyle}>
      Voltar ao painel
    </Link>
  );
}

export function EventModuleEventSelector({
  events,
  selectedEventId,
  onSelectedEventIdChange,
  fallbackTitle
}: {
  events: EventModuleEventOption[];
  selectedEventId: string;
  onSelectedEventIdChange: (eventId: string) => void;
  fallbackTitle?: string;
}) {
  const options = resolveSelectorEvents(
    events,
    selectedEventId,
    fallbackTitle
  );

  return (
    <label style={selectorLabelStyle}>
      Evento
      <select
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
  selectedEventId,
  onSelectSection,
  onCreateEvent
}: {
  variant: EventModuleChromeVariant;
  activeSection?: EventWorkspaceSection | undefined;
  selectedEventId: string;
  onSelectSection?: ((section: EventWorkspaceSection) => void) | undefined;
  onCreateEvent?: (() => void) | undefined;
}) {
  const isWorkspace = variant === "workspace";
  const gestaoActive = variant === "management";

  function renderSectionItem(
    section: EventWorkspaceSection,
    label: string
  ) {
    const active = isWorkspace && activeSection === section;

    if (isWorkspace) {
      return (
        <button
          key={section}
          onClick={() => onSelectSection?.(section)}
          style={navItemStyle(active)}
          type="button"
        >
          {label}
        </button>
      );
    }

    return (
      <Link
        href={workspaceHref(selectedEventId, `section=${section}`)}
        key={section}
        style={navItemStyle(false)}
      >
        {label}
      </Link>
    );
  }

  return (
    <nav style={navStyle}>
      {isWorkspace ? (
        <button
          onClick={() => onSelectSection?.("overview")}
          style={navItemStyle(activeSection === "overview")}
          type="button"
        >
          Visão geral
        </button>
      ) : (
        <Link
          href={workspaceHref(selectedEventId, "section=overview")}
          style={navItemStyle(false)}
        >
          Visão geral
        </Link>
      )}

      {isWorkspace ? (
        <button
          onClick={onCreateEvent}
          style={createButtonStyle}
          type="button"
        >
          + Criar evento
        </button>
      ) : (
        <Link
          href={workspaceHref(selectedEventId, "create=1")}
          style={createButtonStyle}
        >
          + Criar evento
        </Link>
      )}

      {WORKSPACE_NAV_ITEMS.map((item) => {
        if (item.kind === "management") {
          return (
            <Link
              href={managementHref(selectedEventId)}
              key="gestao-financeira"
              style={navItemStyle(gestaoActive)}
            >
              {item.label}
            </Link>
          );
        }

        return renderSectionItem(item.section, item.label);
      })}
    </nav>
  );
}

export function EventModuleChrome({
  variant,
  selectedEventId,
  activeSection,
  onSelectSection,
  onCreateEvent,
  header,
  children
}: {
  variant: EventModuleChromeVariant;
  selectedEventId: string;
  activeSection?: EventWorkspaceSection | undefined;
  onSelectSection?: ((section: EventWorkspaceSection) => void) | undefined;
  onCreateEvent?: (() => void) | undefined;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <EventModuleBackLink />
      {header}
      <div style={contentGridStyle}>
        <EventModuleNav
          activeSection={activeSection}
          onCreateEvent={onCreateEvent}
          onSelectSection={onSelectSection}
          selectedEventId={selectedEventId}
          variant={variant}
        />
        <div style={contentColumnStyle}>{children}</div>
      </div>
    </>
  );
}
