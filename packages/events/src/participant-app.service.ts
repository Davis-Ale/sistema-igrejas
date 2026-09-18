import type { PrismaClient } from "@prisma/client";
import type {
  CreateEventAppSessionInput,
  UpdateEventAppMapInput,
  UpdateEventAppSessionInput
} from "./participant-app.schema.js";

type ParticipantAppEligibility = {
  status: string;
  paymentStatus: string;
  waitlistedAt: Date | null;
};

export function isParticipantAppEligible(
  registration: ParticipantAppEligibility
) {
  return (
    registration.status !== "CANCELLED" &&
    registration.waitlistedAt === null &&
    (
      registration.paymentStatus === "PAID" ||
      registration.paymentStatus === "NOT_REQUIRED"
    ) &&
    (
      registration.status === "CONFIRMED" ||
      registration.status === "CHECKED_IN"
    )
  );
}

function nullableText(value: string | null | undefined) {
  return value?.trim() || null;
}

async function requireEvent(
  prisma: PrismaClient,
  churchId: string,
  eventId: string
) {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      churchId,
      deletedAt: null
    },
    select: {
      id: true,
      publicSlug: true,
      participantMapImageUrl: true
    }
  });

  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }

  return event;
}

async function validateEligibleRegistrationIds(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  registrationIds: string[]
) {
  if (registrationIds.length === 0) {
    return;
  }

  const registrations = await prisma.registration.findMany({
    where: {
      id: {
        in: registrationIds
      },
      churchId,
      eventId
    },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      waitlistedAt: true
    }
  });

  if (
    registrations.length !== registrationIds.length ||
    registrations.some(
      (registration) => !isParticipantAppEligible(registration)
    )
  ) {
    throw new Error("EVENT_APP_REGISTRATION_INVALID");
  }
}

export async function getEventParticipantAppAdmin(
  prisma: PrismaClient,
  churchId: string,
  eventId: string
) {
  const event = await requireEvent(prisma, churchId, eventId);

  const [sessions, points, registrations] = await Promise.all([
    prisma.eventAppSession.findMany({
      where: {
        churchId,
        eventId
      },
      orderBy: [
        { startsAt: "asc" },
        { id: "asc" }
      ],
      include: {
        registrations: {
          select: {
            registrationId: true
          }
        }
      }
    }),
    prisma.eventAppMapPoint.findMany({
      where: {
        churchId,
        eventId
      },
      orderBy: [
        { sortOrder: "asc" },
        { id: "asc" }
      ]
    }),
    prisma.registration.findMany({
      where: {
        churchId,
        eventId,
        status: {
          in: ["CONFIRMED", "CHECKED_IN"]
        },
        paymentStatus: {
          in: ["PAID", "NOT_REQUIRED"]
        },
        waitlistedAt: null
      },
      orderBy: [
        { createdAt: "asc" },
        { id: "asc" }
      ],
      select: {
        id: true,
        status: true,
        person: {
          select: {
            name: true
          }
        },
        visitor: {
          select: {
            name: true
          }
        },
        ticket: {
          select: {
            name: true
          }
        }
      }
    })
  ]);

  return {
    publicSlug: event.publicSlug,
    sessions: sessions.map((session) => ({
      ...session,
      registrationIds: session.registrations.map(
        ({ registrationId }) => registrationId
      ),
      registrations: undefined
    })),
    map: {
      imageUrl: event.participantMapImageUrl,
      points
    },
    registrations: registrations.map((registration) => ({
      id: registration.id,
      name:
        registration.person?.name ??
        registration.visitor?.name ??
        "Participante",
      status: registration.status,
      ticketName: registration.ticket?.name ?? null
    }))
  };
}

export async function createEventAppSession(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  input: CreateEventAppSessionInput
) {
  await requireEvent(prisma, churchId, eventId);
  await validateEligibleRegistrationIds(
    prisma,
    churchId,
    eventId,
    input.registrationIds
  );

  return prisma.eventAppSession.create({
    data: {
      churchId,
      eventId,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      type: nullableText(input.type),
      facilitator: nullableText(input.facilitator),
      location: nullableText(input.location),
      details: nullableText(input.details),
      isPublished: input.isPublished,
      registrations: {
        create: input.registrationIds.map((registrationId) => ({
          churchId,
          eventId,
          registrationId
        }))
      }
    }
  });
}

export async function updateEventAppSession(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  sessionId: string,
  input: UpdateEventAppSessionInput
) {
  await requireEvent(prisma, churchId, eventId);

  const session = await prisma.eventAppSession.findFirst({
    where: {
      id: sessionId,
      churchId,
      eventId
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true
    }
  });

  if (!session) {
    throw new Error("EVENT_APP_SESSION_NOT_FOUND");
  }

  const startsAt = input.startsAt ?? session.startsAt;
  const endsAt = input.endsAt ?? session.endsAt;

  if (endsAt <= startsAt) {
    throw new Error("EVENT_APP_SESSION_TIME_INVALID");
  }

  if (input.registrationIds) {
    await validateEligibleRegistrationIds(
      prisma,
      churchId,
      eventId,
      input.registrationIds
    );
  }

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.eventAppSession.update({
      where: {
        id: session.id
      },
      data: {
        ...(input.title !== undefined
          ? { title: input.title }
          : {}),
        ...(input.startsAt !== undefined
          ? { startsAt: input.startsAt }
          : {}),
        ...(input.endsAt !== undefined
          ? { endsAt: input.endsAt }
          : {}),
        ...(input.type !== undefined
          ? { type: nullableText(input.type) }
          : {}),
        ...(input.facilitator !== undefined
          ? { facilitator: nullableText(input.facilitator) }
          : {}),
        ...(input.location !== undefined
          ? { location: nullableText(input.location) }
          : {}),
        ...(input.details !== undefined
          ? { details: nullableText(input.details) }
          : {}),
        ...(input.isPublished !== undefined
          ? { isPublished: input.isPublished }
          : {})
      }
    });

    if (input.registrationIds) {
      await transaction.eventAppSessionRegistration.deleteMany({
        where: {
          churchId,
          eventId,
          sessionId: session.id
        }
      });

      if (input.registrationIds.length > 0) {
        await transaction.eventAppSessionRegistration.createMany({
          data: input.registrationIds.map((registrationId) => ({
            churchId,
            eventId,
            sessionId: session.id,
            registrationId
          }))
        });
      }
    }

    return updated;
  });
}

export async function deleteEventAppSession(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  sessionId: string
) {
  await requireEvent(prisma, churchId, eventId);

  const deleted = await prisma.eventAppSession.deleteMany({
    where: {
      id: sessionId,
      churchId,
      eventId
    }
  });

  if (deleted.count === 0) {
    throw new Error("EVENT_APP_SESSION_NOT_FOUND");
  }
}

export async function updateEventAppMap(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  input: UpdateEventAppMapInput
) {
  const event = await requireEvent(prisma, churchId, eventId);

  await prisma.$transaction(async (transaction) => {
    await transaction.event.update({
      where: {
        id: event.id
      },
      data: {
        participantMapImageUrl: nullableText(input.imageUrl)
      }
    });

    await transaction.eventAppMapPoint.deleteMany({
      where: {
        churchId,
        eventId
      }
    });

    if (input.points.length > 0) {
      await transaction.eventAppMapPoint.createMany({
        data: input.points.map((point) => ({
          churchId,
          eventId,
          name: point.name,
          location: point.location,
          sortOrder: point.sortOrder,
          isVisible: point.isVisible
        }))
      });
    }
  });

  return getEventParticipantAppAdmin(
    prisma,
    churchId,
    eventId
  );
}

export async function getPublicParticipantAppEvent(
  prisma: PrismaClient,
  publicSlug: string
) {
  const event = await prisma.event.findFirst({
    where: {
      publicSlug,
      isPublic: true,
      deletedAt: null
    },
    select: {
      title: true,
      slug: true,
      date: true,
      church: {
        select: {
          name: true,
          slug: true
        }
      }
    }
  });

  if (!event) {
    throw new Error("PUBLIC_EVENT_NOT_FOUND");
  }

  return event;
}

export async function getParticipantAppAccessByPublicSlug(
  prisma: PrismaClient,
  publicSlug: string,
  checkInToken: string
) {
  const registration = await prisma.registration.findFirst({
    where: {
      checkInToken,
      event: {
        publicSlug,
        isPublic: true,
        deletedAt: null
      }
    },
    select: {
      status: true,
      paymentStatus: true,
      checkInToken: true,
      waitlistedAt: true,
      person: {
        select: {
          name: true,
          phone: true,
          email: true
        }
      },
      visitor: {
        select: {
          name: true,
          phone: true,
          email: true
        }
      },
      ticket: {
        select: {
          name: true
        }
      },
      ticketBatch: {
        select: {
          name: true
        }
      },
      event: {
        select: {
          title: true,
          date: true,
          participantMapImageUrl: true,
          church: {
            select: {
              name: true
            }
          },
          campus: {
            select: {
              name: true,
              address: true
            }
          },
          appSessions: {
            where: {
              isPublished: true
            },
            orderBy: [
              { startsAt: "asc" },
              { id: "asc" }
            ],
            select: {
              id: true,
              title: true,
              startsAt: true,
              endsAt: true,
              type: true,
              facilitator: true,
              location: true,
              details: true,
              registrations: {
                where: {
                  registration: {
                    checkInToken
                  }
                },
                select: {
                  registrationId: true
                }
              }
            }
          },
          appMapPoints: {
            where: {
              isVisible: true
            },
            orderBy: [
              { sortOrder: "asc" },
              { id: "asc" }
            ],
            select: {
              id: true,
              name: true,
              location: true,
              sortOrder: true
            }
          }
        }
      }
    }
  });

  if (!registration) {
    throw new Error("PUBLIC_REGISTRATION_NOT_FOUND");
  }

  if (!isParticipantAppEligible(registration)) {
    if (
      registration.paymentStatus !== "PAID" &&
      registration.paymentStatus !== "NOT_REQUIRED"
    ) {
      throw new Error("PAYMENT_REQUIRED");
    }

    throw new Error("PARTICIPANT_APP_ACCESS_DENIED");
  }

  const participant =
    registration.person ?? registration.visitor;

  if (!participant) {
    throw new Error("PARTICIPANT_APP_ACCESS_DENIED");
  }

  return {
    registration: {
      status: registration.status,
      paymentStatus: registration.paymentStatus,
      checkInToken: registration.checkInToken,
      ticketName: registration.ticket?.name ?? null,
      ticketBatchName: registration.ticketBatch?.name ?? null
    },
    participant,
    event: {
      title: registration.event.title,
      date: registration.event.date,
      churchName: registration.event.church.name,
      location: registration.event.campus
        ? {
            name: registration.event.campus.name,
            address: registration.event.campus.address
          }
        : null
    },
    sessions: registration.event.appSessions.map((session) => ({
      id: session.id,
      title: session.title,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      type: session.type,
      facilitator: session.facilitator,
      location: session.location,
      details: session.details,
      isMine: session.registrations.length > 0
    })),
    map: {
      imageUrl: registration.event.participantMapImageUrl,
      points: registration.event.appMapPoints
    }
  };
}
