import type { PrismaClient } from "@prisma/client";
import type { CreatePublicRegistrationInput } from "./event.schema.js";
import { createPublicRegistration } from "./event.service.js";

export async function getPublicEventBySlugs(
  prisma: PrismaClient,
  churchSlug: string,
  eventSlug: string
) {
  const event = await prisma.event.findFirst({
    where: {
      slug: eventSlug,
      isPublic: true,
      publicRegistrationEnabled: true,
      church: {
        slug: churchSlug
      }
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
      church: {
        select: {
          name: true,
          slug: true
        }
      },
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

export async function createPublicRegistrationBySlugs(
  prisma: PrismaClient,
  churchSlug: string,
  eventSlug: string,
  input: CreatePublicRegistrationInput
) {
  const event = await getPublicEventBySlugs(
    prisma,
    churchSlug,
    eventSlug
  );

  return createPublicRegistration(prisma, event.id, input);
}
