"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import type { PublicEvent } from "./page";
import styles from "./participant-event-app.module.css";

type Participant = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
};

type PublicRegistration = {
  id: string;
  status:
    | "PENDING"
    | "CONFIRMED"
    | "CANCELLED"
    | "CHECKED_IN";
  paymentStatus: string;
  paymentId: string | null;
  checkInToken: string;
  checkedInAt: string | null;
  confirmedAt: string | null;
  waitlistedAt: string | null;
  registrationSource: string;
  wasExisting?: boolean;
  person: Participant | null;
  visitor: Participant | null;
  event: {
    id: string;
    title: string;
    slug: string;
    date: string;
    capacity: number;
    price: string | number;
    isPaid: boolean;
    waitlistEnabled: boolean;
    publicRegistrationEnabled: boolean;
    church: {
      name: string;
      slug: string;
    };
  };
};

type ApiErrorResponse = {
  message?: string;
};

type ParticipantEventAppProps = {
  churchSlug: string;
  eventSlug: string;
  event: PublicEvent;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatMoney(value: string | number) {
  const numberValue =
    typeof value === "string"
      ? Number(value)
      : value;

  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency"
  }).format(
    Number.isFinite(numberValue)
      ? numberValue
      : 0
  );
}

function getRegistrationMessage(
  registration: PublicRegistration
) {
  if (registration.status === "CHECKED_IN") {
    return "Seu check-in já foi realizado.";
  }

  if (registration.waitlistedAt) {
    return "Sua inscrição está na lista de espera.";
  }

  if (
    registration.event.isPaid &&
    registration.paymentStatus !== "PAID"
  ) {
    return "Sua inscrição foi recebida e aguarda a confirmação do pagamento.";
  }

  return "Sua inscrição está confirmada.";
}

function getRegistrationStatus(
  registration: PublicRegistration
) {
  if (registration.status === "CHECKED_IN") {
    return "Check-in realizado";
  }

  if (registration.waitlistedAt) {
    return "Lista de espera";
  }

  if (registration.status === "CONFIRMED") {
    return "Confirmada";
  }

  return "Pendente";
}

function getPaymentStatus(
  registration: PublicRegistration
) {
  if (!registration.event.isPaid) {
    return "Não necessário";
  }

  if (registration.paymentStatus === "PAID") {
    return "Pago";
  }

  if (registration.paymentStatus === "CANCELLED") {
    return "Cancelado";
  }

  return "Pendente";
}

export function ParticipantEventApp({
  churchSlug,
  eventSlug,
  event
}: ParticipantEventAppProps) {
  const initialActiveRegistrations = useMemo(
    () =>
      event.registrations.filter(
        (registration) =>
          registration.status !== "CANCELLED" &&
          !registration.waitlistedAt
      ).length,
    [event.registrations]
  );

  const storageKey =
    `event-app:${churchSlug}:${eventSlug}:check-in-token`;

  const [
    activeRegistrations,
    setActiveRegistrations
  ] = useState(initialActiveRegistrations);

  const [
    registration,
    setRegistration
  ] = useState<PublicRegistration | null>(null);

  const [
    isParticipantAppOpen,
    setIsParticipantAppOpen
  ] = useState(false);

  const [
    isRestoringCredential,
    setIsRestoringCredential
  ] = useState(true);

  const [
    isRegistering,
    setIsRegistering
  ] = useState(false);

  const [
    error,
    setError
  ] = useState<string | null>(null);

  const availableSpots = Math.max(
    event.capacity - activeRegistrations,
    0
  );

  const registrationClosed =
    !event.publicRegistrationEnabled ||
    (
      availableSpots === 0 &&
      !event.waitlistEnabled
    );

  const participant =
    registration?.person ??
    registration?.visitor ??
    null;

  useEffect(() => {
    async function restoreCredential() {
      const checkInToken =
        localStorage.getItem(storageKey);

      if (!checkInToken) {
        setIsRestoringCredential(false);
        return;
      }

      try {
        const response = await fetch(
          `/api/events/${encodeURIComponent(churchSlug)}/${encodeURIComponent(eventSlug)}/access`,
          {
            body: JSON.stringify({
              checkInToken
            }),
            cache: "no-store",
            headers: {
              "Content-Type": "application/json"
            },
            method: "POST"
          }
        );

        if (!response.ok) {
          localStorage.removeItem(storageKey);
          return;
        }

        const data =
          await response.json() as PublicRegistration;

        setRegistration(data);

        if (window.location.hash === "#aplicativo") {
          setIsParticipantAppOpen(true);
        }
      } catch {
        setError(
          "Não foi possível recuperar sua inscrição agora."
        );
      } finally {
        setIsRestoringCredential(false);
      }
    }

    void restoreCredential();
  }, [
    churchSlug,
    eventSlug,
    storageKey
  ]);

  async function handleRegister(
    formEvent: FormEvent<HTMLFormElement>
  ) {
    formEvent.preventDefault();

    const form = formEvent.currentTarget;
    const formData = new FormData(form);

    const name =
      String(formData.get("name") ?? "").trim();

    const phone =
      String(formData.get("phone") ?? "").trim();

    const email =
      String(formData.get("email") ?? "").trim();

    if (!name || !phone) {
      setError("Informe seu nome e telefone.");
      return;
    }

    setError(null);
    setIsRegistering(true);

    try {
      const response = await fetch(
        `/api/events/${encodeURIComponent(churchSlug)}/${encodeURIComponent(eventSlug)}/register`,
        {
          body: JSON.stringify({
            name,
            phone,
            email: email || undefined
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );

      const data =
        await response.json() as
          | PublicRegistration
          | ApiErrorResponse;

      if (!response.ok) {
        setError(
          "message" in data && data.message
            ? data.message
            : "Não foi possível realizar sua inscrição."
        );
        return;
      }

      const createdRegistration =
        data as PublicRegistration;

      localStorage.setItem(
        storageKey,
        createdRegistration.checkInToken
      );

      setRegistration(createdRegistration);
      setIsParticipantAppOpen(false);

      if (
        !createdRegistration.wasExisting &&
        !createdRegistration.waitlistedAt
      ) {
        setActiveRegistrations(
          (current) => current + 1
        );
      }

      form.reset();
    } catch {
      setError(
        "Não foi possível realizar sua inscrição agora."
      );
    } finally {
      setIsRegistering(false);
    }
  }

  function handleOpenParticipantApp() {
    setIsParticipantAppOpen(true);

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#aplicativo`
    );

    window.scrollTo({
      behavior: "smooth",
      top: 0
    });
  }

  function handleCloseParticipantApp() {
    setIsParticipantAppOpen(false);

    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`
    );
  }

  function handleNewRegistration() {
    localStorage.removeItem(storageKey);

    setRegistration(null);
    setIsParticipantAppOpen(false);
    setError(null);

    window.history.replaceState(
      null,
      "",
      window.location.pathname
    );
  }

  if (
    registration &&
    participant &&
    isParticipantAppOpen
  ) {
    return (
      <main className={styles.page}>
        <section className={styles.container}>
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>
                Aplicativo do Evento
              </p>

              <strong className={styles.churchName}>
                {event.church.name}
              </strong>
            </div>

            <span className={styles.appBadge}>
              PWA
            </span>
          </header>

          <section
            className={styles.participantApp}
            id="aplicativo"
          >
            <div>
              <p className={styles.credentialLabel}>
                Área do participante
              </p>

              <h1 className={styles.participantName}>
                {participant.name}
              </h1>

              <p className={styles.credentialStatus}>
                {getRegistrationMessage(registration)}
              </p>
            </div>

            <article className={styles.appEventCard}>
              <span>Evento</span>
              <strong>{event.title}</strong>
              <p>{formatDate(event.date)}</p>
            </article>

            <div className={styles.qrContainer}>
              <QRCode
                bgColor="#ffffff"
                fgColor="#020617"
                size={190}
                value={registration.checkInToken}
              />
            </div>

            <div className={styles.tokenCard}>
              <span>Código de check-in</span>

              <strong>
                {registration.checkInToken}
              </strong>
            </div>

            <div className={styles.credentialDetails}>
              <div>
                <span>Inscrição</span>
                <strong>
                  {getRegistrationStatus(registration)}
                </strong>
              </div>

              <div>
                <span>Pagamento</span>
                <strong>
                  {getPaymentStatus(registration)}
                </strong>
              </div>
            </div>

            <button
              className={styles.secondaryButton}
              onClick={handleCloseParticipantApp}
              type="button"
            >
              Voltar para a confirmação
            </button>
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>
              Aplicativo do Evento
            </p>

            <strong className={styles.churchName}>
              {event.church.name}
            </strong>
          </div>

          <span className={styles.appBadge}>
            PWA
          </span>
        </header>

        <article className={styles.eventCard}>
          <p className={styles.eventDate}>
            {formatDate(event.date)}
          </p>

          <h1 className={styles.eventTitle}>
            {event.title}
          </h1>

          <div className={styles.eventStats}>
            <div className={styles.statCard}>
              <span>Valor</span>

              <strong>
                {event.isPaid
                  ? formatMoney(event.price)
                  : "Gratuito"}
              </strong>
            </div>
          </div>
        </article>

        {isRestoringCredential ? (
          <section className={styles.panel}>
            <p className={styles.panelText}>
              Recuperando sua inscrição...
            </p>
          </section>
        ) : null}

        {!isRestoringCredential &&
        !registration ? (
          <section className={styles.panel}>
            <div>
              <h2 className={styles.panelTitle}>
                Fazer inscrição
              </h2>

              <p className={styles.panelText}>
                Informe seus dados para participar
                deste evento.
              </p>
            </div>

            {registrationClosed ? (
              <div className={styles.warning}>
                As inscrições deste evento estão
                encerradas.
              </div>
            ) : (
              <form
                className={styles.form}
                onSubmit={handleRegister}
              >
                <label className={styles.label}>
                  Nome completo

                  <input
                    className={styles.input}
                    name="name"
                    required
                    type="text"
                  />
                </label>

                <label className={styles.label}>
                  Telefone

                  <input
                    className={styles.input}
                    name="phone"
                    required
                    type="tel"
                  />
                </label>

                <label className={styles.label}>
                  E-mail

                  <input
                    className={styles.input}
                    name="email"
                    type="email"
                  />
                </label>

                <button
                  className={styles.primaryButton}
                  disabled={isRegistering}
                  type="submit"
                >
                  {isRegistering
                    ? "Realizando inscrição..."
                    : availableSpots > 0
                      ? "Confirmar inscrição"
                      : "Entrar na lista de espera"}
                </button>
              </form>
            )}

            {error ? (
              <div className={styles.error}>
                {error}
              </div>
            ) : null}
          </section>
        ) : null}

        {!isRestoringCredential &&
        registration &&
        participant ? (
          <section className={styles.confirmation}>
            <div>
              <p className={styles.credentialLabel}>
                Inscrição recebida
              </p>

              <h2 className={styles.participantName}>
                {participant.name}
              </h2>

              <p className={styles.credentialStatus}>
                {getRegistrationMessage(registration)}
              </p>
            </div>

            <div className={styles.qrContainer}>
              <QRCode
                bgColor="#ffffff"
                fgColor="#020617"
                size={190}
                value={registration.checkInToken}
              />
            </div>

            <div className={styles.tokenCard}>
              <span>Código de check-in</span>

              <strong>
                {registration.checkInToken}
              </strong>
            </div>

            <div className={styles.credentialDetails}>
              <div>
                <span>Inscrição</span>
                <strong>
                  {getRegistrationStatus(registration)}
                </strong>
              </div>

              <div>
                <span>Pagamento</span>
                <strong>
                  {getPaymentStatus(registration)}
                </strong>
              </div>
            </div>

            <button
              className={styles.primaryButton}
              onClick={handleOpenParticipantApp}
              type="button"
            >
              Acessar aplicativo do evento
            </button>

            <button
              className={styles.secondaryButton}
              onClick={handleNewRegistration}
              type="button"
            >
              Voltar para a inscrição
            </button>
          </section>
        ) : null}
      </section>
    </main>
  );
}
