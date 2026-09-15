import { DashboardAuthGuard } from "../../dashboard-auth-guard";
import { EventFinancialManagementClient } from "./event-financial-management-client";

type EventFinancialManagementPageProps = {
  searchParams: Promise<{
    from?: string | string[];
  }>;
};

function readSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default async function EventFinancialManagementPage({
  searchParams
}: EventFinancialManagementPageProps) {
  const query = await searchParams;
  const fromEventId = readSearchParam(query.from) ?? "";

  return (
    <DashboardAuthGuard>
      <EventFinancialManagementClient fromEventId={fromEventId} />
    </DashboardAuthGuard>
  );
}
