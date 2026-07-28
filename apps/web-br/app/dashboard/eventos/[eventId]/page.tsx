import { EventWorkspaceClient } from "./event-workspace-client";

type EventWorkspacePageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function EventWorkspacePage({
  params
}: EventWorkspacePageProps) {
  const {
    eventId
  } = await params;

  return <EventWorkspaceClient eventId={eventId} />;
}
