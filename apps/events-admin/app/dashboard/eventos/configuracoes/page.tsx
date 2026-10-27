import { DashboardAuthGuard } from "../../dashboard-auth-guard";
import { EventGeneralSettingsClient } from "./event-general-settings-client";

export default function EventGeneralSettingsPage() {
  return (
    <DashboardAuthGuard>
      <EventGeneralSettingsClient />
    </DashboardAuthGuard>
  );
}
