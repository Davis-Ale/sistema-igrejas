import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  CheckInByTokenInput,
  CreateEventInput,
  CreatePublicRegistrationInput,
  CreateRegistrationInput,
  UpdateRegistrationStatusInput
} from "./event.schema.js";

function buildRegistrationStatus(event: { isPaid: boolean }, isWaitlisted: boolean) {
  if (isWaitlisted) {
    return "PENDING" as const;
  }

  return event.isPaid ? ("PENDING" as const) : ("CONFIRMED" as const);
}

function buildPaymentStatus(event: { isPaid: boolean }, isWaitlisted: boolean) {
  if (isWaitlisted) {
    return event.isPaid ? "WAITING_PAYMENT" : "WAITLISTED";
  }

  return event.isPaid ? "PENDING" : "NOT_REQUIRED";
}

function buildConfirmedAt(event: { isPaid: boolean }, isWaitlisted: boolean) {
  if (event.isPaid || isWaitlisted) {
    return null;
  }

  return new Date();
}

async function createEventRegistrationTransaction(
  prisma: PrismaClient,
  input: {
    churchId: string;
    campusId: string | null;
    eventId: string;
    personId: string | null;
    amount: Prisma.Decimal | number | string;
  }
) {
  const transaction = await prisma.transaction.create({
    data: {
      churchId: input.churchId,
      campusId: input.campusId,
      personId: input.personId,
      eventId: input.eventId,
      type: "EVENT",
      direction: "IN",
      amount: input.amount,
      method: "PIX",
      costCenter: "EVENTOS"
    }
  });

  return transaction.id;
}

export async function createEvent(
  prisma: PrismaClient,
  churchId: string,
  input: CreateEventInput
) {
  return prisma.event.create({
    data: {
      churchId,
      campusId: input.campusId ?? null,
      title: input.title,
      slug: input.slug,
      date: input.date,
      capacity: input.capacity,
      price: input.price,
      isPublic: input.isPublic,
      isPaid: input.isPaid,
      publicRegistrationEnabled: input.publicRegistrationEnabled,
      waitlistEnabled: input.waitlistEnabled,
      trailStageId: input.trailStageId ?? null
    }
  });
}

export async function listEvents(prisma: PrismaClient, churchId: string) {
  return prisma.event.findMany({
    where: {
      churchId
    },
    include: {
      registrations: {
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          paymentId: true,
          checkInToken: true,
          checkedInAt: true,
          confirmedAt: true,
          waitlistedAt: true,
          registrationSource: true,
          person: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true
            }
          },
          visitor: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true
            }
          }
        }
      },
      trailStage: {
        select: {
          id: true,
          label: true
        }
      }
    },
    orderBy: {
      date: "asc"
    }
  });
}

export async function getEventById(
  prisma: PrismaClient,
  churchId: string,
  eventId: string
) {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      churchId
    },
    include: {
      registrations: {
        include: {
          person: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true
            }
          },
          visitor: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      },
      trailStage: {
        select: {
          id: true,
          label: true
        }
      }
    }
  });

  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }

  return event;
}

export async function getPublicEventById(prisma: PrismaClient, eventId: string) {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      isPublic: true,
      publicRegistrationEnabled: true
    },
    select: {
      id: true,
      title: true,
      slug: true,
      date: true,
      capacity: true,
      price: true,
      isPaid: true,
      isPublic: true,
      publicRegistrationEnabled: true,
      waitlistEnabled: true,
      registrations: {
        where: {
          status: {
            not: "CANCELLED"
          }
        },
        select: {
          id: true,
          status: true,
          waitlistedAt: true
        }
      }
    }
  });

  if (!event) {
    throw new Error("PUBLIC_EVENT_NOT_FOUND");
  }

  return event;
}

export async function createRegistration(
  prisma: PrismaClient,
  churchId: string,
  input: CreateRegistrationInput
) {
  const [event, person, visitor] = await Promise.all([
    prisma.event.findFirst({
      where: {
        id: input.eventId,
        churchId
      },
      include: {
        registrations: {
          where: {
            status: {
              not: "CANCELLED"
            }
          },
          select: {
            id: true,
            waitlistedAt: true
          }
        }
      }
    }),
    input.personId
      ? prisma.person.findFirst({
          where: {
            id: input.personId,
            churchId
          },
          select: {
            id: true
          }
        })
      : Promise.resolve(null),
    input.visitorId
      ? prisma.visitor.findFirst({
          where: {
            id: input.visitorId,
            churchId
          },
          select: {
            id: true
          }
        })
      : Promise.resolve(null)
  ]);

  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }

  if (input.personId && !person) {
    throw new Error("PERSON_NOT_FOUND");
  }

  if (input.visitorId && !visitor) {
    throw new Error("VISITOR_NOT_FOUND");
  }

  const activeRegistrations = event.registrations.filter(
    (registration) => !registration.waitlistedAt
  );
  const isWaitlisted = activeRegistrations.length >= event.capacity;

  if (isWaitlisted && !event.waitlistEnabled) {
    throw new Error("EVENT_CAPACITY_REACHED");
  }

  const registration = await prisma.registration.create({
    data: {
      churchId,
      eventId: input.eventId,
      personId: input.personId ?? null,
      visitorId: input.visitorId ?? null,
      status: buildRegistrationStatus(event, isWaitlisted),
      paymentStatus: buildPaymentStatus(event, isWaitlisted),
      paymentId: input.paymentId ?? null,
      confirmedAt: buildConfirmedAt(event, isWaitlisted),
      waitlistedAt: isWaitlisted ? new Date() : null,
      registrationSource: "ADMIN"
    }
  });

  if (!event.isPaid || isWaitlisted || input.paymentId) {
    return registration;
  }

  const paymentId = await createEventRegistrationTransaction(prisma, {
    churchId,
    campusId: event.campusId,
    eventId: event.id,
    personId: input.personId ?? null,
    amount: event.price
  });

  return prisma.registration.update({
    where: {
      id: registration.id
    },
    data: {
      paymentId
    }
  });
}

export async function createPublicRegistration(
  prisma: PrismaClient,
  eventId: string,
  input: CreatePublicRegistrationInput
) {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      isPublic: true,
      publicRegistrationEnabled: true
    },
    include: {
      registrations: {
        where: {
          status: {
            not: "CANCELLED"
          }
        },
        select: {
          id: true,
          waitlistedAt: true
        }
      }
    }
  });

  if (!event) {
    throw new Error("PUBLIC_EVENT_NOT_FOUND");
  }

  const activeRegistrations = event.registrations.filter(
    (registration) => !registration.waitlistedAt
  );
  const isWaitlisted = activeRegistrations.length >= event.capacity;

  if (isWaitlisted && !event.waitlistEnabled) {
    throw new Error("EVENT_CAPACITY_REACHED");
  }

  const visitor = await prisma.visitor.create({
    data: {
      churchId: event.churchId,
      campusId: event.campusId,
      name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      firstVisitAt: new Date(),
      notes: `Inscrição pública no evento: ${event.title}`
    }
  });

  return prisma.registration.create({
    data: {
      churchId: event.churchId,
      eventId: event.id,
      visitorId: visitor.id,
      status: buildRegistrationStatus(event, isWaitlisted),
      paymentStatus: buildPaymentStatus(event, isWaitlisted),
      confirmedAt: buildConfirmedAt(event, isWaitlisted),
      waitlistedAt: isWaitlisted ? new Date() : null,
      registrationSource: "PUBLIC"
    },
    include: {
      visitor: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true
        }
      },
      event: {
        select: {
          id: true,
          title: true,
          date: true,
          price: true,
          isPaid: true
        }
      }
    }
  });
}

export async function updateRegistrationStatus(
  prisma: PrismaClient,
  churchId: string,
  input: UpdateRegistrationStatusInput
) {
  const registration = await prisma.registration.findFirst({
    where: {
      id: input.registrationId,
      churchId
    },
    select: {
      id: true
    }
  });

  if (!registration) {
    throw new Error("REGISTRATION_NOT_FOUND");
  }

  const registrationUpdateData =
    input.status === "CHECKED_IN"
      ? {
          status: input.status,
          paymentId: input.paymentId ?? null,
          checkedInAt: new Date()
        }
      : input.status === "CONFIRMED"
        ? {
            status: input.status,
            paymentId: input.paymentId ?? null,
            confirmedAt: new Date()
          }
        : {
            status: input.status,
            paymentId: input.paymentId ?? null
          };

  return prisma.registration.update({
    where: {
      id: registration.id
    },
    data: registrationUpdateData
  });
}

export async function checkInRegistrationByToken(
  prisma: PrismaClient,
  churchId: string,
  input: CheckInByTokenInput
) {
  const registration = await prisma.registration.findFirst({
    where: {
      checkInToken: input.checkInToken,
      churchId,
      eventId: input.eventId
    },
    select: {
      id: true,
      status: true
    }
  });

  if (!registration) {
    throw new Error("REGISTRATION_NOT_FOUND");
  }

  if (registration.status === "CANCELLED") {
    throw new Error("REGISTRATION_CANCELLED");
  }

  if (registration.status === "CHECKED_IN") {
    throw new Error("REGISTRATION_ALREADY_CHECKED_IN");
  }

  return prisma.registration.update({
    where: {
      id: registration.id
    },
    data: {
      checkedInAt: new Date(),
      status: "CHECKED_IN"
    },
    include: {
      event: {
        select: {
          id: true,
          title: true
        }
      },
      person: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true
        }
      },
      visitor: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true
        }
      }
    }
  });
}
