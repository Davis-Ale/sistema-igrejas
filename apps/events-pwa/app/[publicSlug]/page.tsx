import {
  ParticipantEventApp
} from "../[churchSlug]/[eventSlug]/participant-event-app";

type PublicEventPageProps = {
  params: Promise<{
    publicSlug: string;
  }>;
};

type PublicEvent = {
  id: string;
  title: string;
  slug: string;
  publicSlug: string | null;
  date: string;
  capacity: number;
  price: string | number;
  isPaid: boolean;
  publicRegistrationEnabled: boolean;
  waitlistEnabled: boolean;
  church: {
    name: string;
    slug: string;
  };
  registrations: Array<{
    id: string;
    status:
      | "PENDING"
      | "CONFIRMED"
      | "CANCELLED"
      | "CHECKED_IN";
    waitlistedAt: string | null;
  }>;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3333";

async function getPublicEvent(
  publicSlug: string
): Promise<PublicEvent | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/public/event-pages/${encodeURIComponent(publicSlug)}`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return null;
    }

    return await response.json() as PublicEvent;
  } catch {
    return null;
  }
}

export default async function PublicEventPage({
  params
}: PublicEventPageProps) {
  const {
    publicSlug
  } = await params;

  const event = await getPublicEvent(publicSlug);

  if (!event) {
    return (
      <main
        style={{
          alignItems: "center",
          background:
            "linear-gradient(145deg, #020617, #0f172a)",
          color: "#f8fafc",
          display: "flex",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "24px"
        }}
      >
        <section
          style={{
            background: "rgba(15, 23, 42, 0.94)",
            border:
              "1px solid rgba(148, 163, 184, 0.2)",
            borderRadius: "24px",
            maxWidth: "480px",
            padding: "28px",
            width: "100%"
          }}
        >
          <p
            style={{
              color: "#60a5fa",
              fontSize: "12px",
              fontWeight: 900,
              letterSpacing: "0.08em",
              textTransform: "uppercase"
            }}
          >
            Evento
          </p>

          <h1>Evento indisponível</h1>

          <p
            style={{
              color: "#cbd5e1",
              lineHeight: 1.6
            }}
          >
            Este endereço não corresponde a um evento
            público disponível.
          </p>
        </section>
      </main>
    );
  }

  return (
    <ParticipantEventApp
      churchSlug={event.church.slug}
      event={event}
      eventSlug={event.slug}
    />
  );
}
