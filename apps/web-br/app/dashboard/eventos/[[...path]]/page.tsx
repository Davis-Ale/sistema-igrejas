import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ path?: string[] }>;
};

export default async function EventsRedirect({ params }: Props) {
  const { path = [] } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_EVENTS_APP_URL ?? "http://localhost:3001";
  const suffix = path.length ? `/${path.join("/")}` : "";

  redirect(`${baseUrl}/dashboard/eventos${suffix}`);
}
