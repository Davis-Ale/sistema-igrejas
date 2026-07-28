type EventAppPageProps = {
  params: Promise<{
    churchSlug: string;
    eventSlug: string;
  }>;
};

type PublicEvent = {
  id: string;
  title: string;
  slug: string;
  date: string;
  capacity: number;
  price: string | number;
  isPaid: boolean;
  waitlistEnabled: boolean;
  church: {
    name: string;
    slug: string;
  };
  registrations: Array<{
    id: string;
    status: "PENDING" | "CONFIRMED" | "CANCELLED" | "CHECKED_IN";
    waitlistedAt: string | null;
  }>;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3333";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatMoney(value: string | number) {
  const numberValue =
    typeof value === "string" ? Number(value) : value;

  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency"
  }).format(Number.isFinite(numberValue) ? numberValue : 0);
}

async function getPublicEvent(
  churchSlug: string,
  eventSlug: string
): Promise<PublicEvent | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/public/churches/${encodeURIComponent(churchSlug)}/events/${encodeURIComponent(eventSlug)}`,
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

export default async function EventAppPage({
  params
}: EventAppPageProps) {
  const {
    churchSlug,
    eventSlug
  } = await params;

  const event = await getPublicEvent(churchSlug, eventSlug);

  if (!event) {
    return (
      <main
        className="event-app"
        data-church-slug={churchSlug}
        data-event-slug={eventSlug}
      >
        <section className="event-card">
          <span className="event-label">Evento</span>
          <h1>Evento indisponível</h1>
          <p>
            O evento não foi encontrado ou as inscrições públicas estão desativadas.
          </p>
        </section>
      </main>
    );
  }

  const activeRegistrations = event.registrations.filter(
    (registration) =>
      registration.status !== "CANCELLED" &&
      !registration.waitlistedAt
  );

  const waitlistedRegistrations = event.registrations.filter(
    (registration) =>
      registration.status !== "CANCELLED" &&
      registration.waitlistedAt
  );

  const availableSpots = Math.max(
    event.capacity - activeRegistrations.length,
    0
  );

  return (
    <main
      className="event-app"
      data-church-slug={churchSlug}
      data-event-slug={eventSlug}
    >
      <section className="event-card">
        <span className="event-label">{event.church.name}</span>

        <h1>{event.title}</h1>

        <div
          style={{
            display: "grid",
            gap: "16px",
            marginTop: "24px"
          }}
        >
          <div>
            <strong>Data e horário</strong>
            <p>{formatDate(event.date)}</p>
          </div>

          <div>
            <strong>Valor</strong>
            <p>
              {event.isPaid
                ? formatMoney(event.price)
                : "Gratuito"}
            </p>
          </div>

          <div>
            <strong>Vagas</strong>
            <p>
              {availableSpots > 0
                ? `${availableSpots} disponíveis`
                : event.waitlistEnabled
                  ? "Lista de espera"
                  : "Vagas encerradas"}
            </p>
          </div>

          {waitlistedRegistrations.length > 0 ? (
            <div>
              <strong>Lista de espera</strong>
              <p>
                {waitlistedRegistrations.length} pessoa(s)
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
