import { DashboardAuthGuard } from "../dashboard-auth-guard";
import { EventsDashboardClient } from "./events-dashboard-client";

type EventosPageProps = {
  searchParams: Promise<{
    create?: string | string[];
  }>;
};

function readSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default async function EventosPage({
  searchParams
}: EventosPageProps) {
  const query = await searchParams;
  const createParam = readSearchParam(query.create);

  return (
    <DashboardAuthGuard>
      <EventsDashboardClient openCreateEvent={createParam === "1"} />
    </DashboardAuthGuard>
  );
}
