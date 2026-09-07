import { EventWorkspaceClient } from "./event-workspace-client";

const EVENT_WORKSPACE_SECTIONS = [
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

type EventWorkspacePageProps = {
  params: Promise<{
    eventId: string;
  }>;
  searchParams: Promise<{
    section?: string | string[];
    create?: string | string[];
  }>;
};

function readSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function isEventWorkspaceSection(
  value: string | undefined
): value is (typeof EVENT_WORKSPACE_SECTIONS)[number] {
  return (
    value !== undefined &&
    (EVENT_WORKSPACE_SECTIONS as readonly string[]).includes(value)
  );
}

export default async function EventWorkspacePage({
  params,
  searchParams
}: EventWorkspacePageProps) {
  const { eventId } = await params;
  const query = await searchParams;
  const sectionParam = readSearchParam(query.section);
  const createParam = readSearchParam(query.create);

  return (
    <EventWorkspaceClient
      eventId={eventId}
      initialSection={
        isEventWorkspaceSection(sectionParam) ? sectionParam : "overview"
      }
      openCreateEvent={createParam === "1"}
    />
  );
}
