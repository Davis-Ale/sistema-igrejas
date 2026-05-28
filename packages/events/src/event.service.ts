import type { PrismaClient } from "@prisma/client";
import type {
  CreateEventInput,
  CreateRegistrationInput,
  UpdateRegistrationStatusInput
} from "./event.schema.js";

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
          checkedInAt: true
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

export async function createRegistration(
  prisma: PrismaClient,
  churchId: string,
  input: CreateRegistrationInput
) {
  const [event, person] = await Promise.all([
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
            id: true
          }
        }
      }
    }),
    prisma.person.findFirst({
      where: {
        id: input.personId,
        churchId
      },
      select: {
        id: true
      }
    })
  ]);

  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }

  if (!person) {
    throw new Error("PERSON_NOT_FOUND");
  }

  if (event.registrations.length >= event.capacity) {
    throw new Error("EVENT_CAPACITY_REACHED");
  }

  return prisma.registration.create({
    data: {
      churchId,
      eventId: input.eventId,
      personId: input.personId,
      paymentId: input.paymentId ?? null
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
