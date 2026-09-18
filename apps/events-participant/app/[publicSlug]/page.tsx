import type { Metadata } from "next";
import {
  ParticipantEventApp
} from "../_components/participant-event-app";
import type {
  PublicEvent
} from "../_components/public-event";

type PublicEventPageProps = {
  params: Promise<{
    publicSlug: string;
  }>;
};

const API_BASE_URL =
  process.env.EVENTS_API_BASE_URL ??
  "http://localhost:3002";

function isValidPublicSlug(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(value);
}

export async function generateMetadata({
  params
}: PublicEventPageProps): Promise<Metadata> {
  const { publicSlug } = await params;

  if (!isValidPublicSlug(publicSlug)) {
    return {};
  }

  return {
    manifest:
      `/${encodeURIComponent(publicSlug)}/manifest.webmanifest`
  };
}

async function getPublicEvent(
  publicSlug: string
): Promise<PublicEvent | null> {
  if (!isValidPublicSlug(publicSlug)) {
    return null;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/public/event-pages/${encodeURIComponent(publicSlug)}/app`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as PublicEvent;

    return {
      title: data.title,
      slug: data.slug,
      date: data.date,
      church: {
        name: data.church.name,
        slug: data.church.slug
      }
    };
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
      event={event}
      publicSlug={publicSlug}
    />
  );
}
