import { DashboardAuthGuard } from "../../dashboard-auth-guard";
import { EventIntegrationsClient } from "./event-integrations-client";

export default function EventIntegrationsPage() {
  return (
    <DashboardAuthGuard>
      <EventIntegrationsClient />
    </DashboardAuthGuard>
  );
}
