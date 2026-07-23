type EventAppPageProps = {
  params: Promise<{
    churchSlug: string;
    eventSlug: string;
  }>;
};

function formatSlug(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => {
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export default async function EventAppPage({
  params
}: EventAppPageProps) {
  const {
    churchSlug,
    eventSlug
  } = await params;

  return (
    <main
      className="event-app"
      data-church-slug={churchSlug}
      data-event-slug={eventSlug}
    >
      <section className="event-card">
        <span className="event-label">Evento</span>
        <h1>{formatSlug(eventSlug)}</h1>
      </section>
    </main>
  );
}
