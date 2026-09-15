import type { Metadata } from "next";
import { DashboardAuthGuard } from "../../../dashboard-auth-guard";
import { EventPreviewClient } from "./event-preview-client";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
    nocache: true,
    googleBot: {
      follow: false,
      index: false,
      noimageindex: true
    }
  }
};

type EventPreviewPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function EventPreviewPage({
  params
}: EventPreviewPageProps) {
  const { eventId } = await params;

  return (
    <DashboardAuthGuard>
      <EventPreviewClient eventId={eventId} />
    </DashboardAuthGuard>
  );
}
