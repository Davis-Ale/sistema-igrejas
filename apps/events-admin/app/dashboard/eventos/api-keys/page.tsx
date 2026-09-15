import { DashboardAuthGuard } from "../../dashboard-auth-guard";
import { EventApiKeysClient } from "./event-api-keys-client";

export default function EventApiKeysPage() {
  return (
    <DashboardAuthGuard>
      <EventApiKeysClient />
    </DashboardAuthGuard>
  );
}
