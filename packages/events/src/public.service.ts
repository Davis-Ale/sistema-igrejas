import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  Prisma,
  PrismaClient
} from "@prisma/client";
import type {
  CreatePublicRegistrationInput
} from "./event.schema.js";
import {
  createPublicRegistration
} from "./event.service.js";
import { presentPublicEventContent } from "./event-public-content.js";

const publicEventSelect = {
  id: true,
  title: true,
  slug: true,
  publicSlug: true,
  date: true,
  capacity: true,
  price: true,
  isPaid: true,
  isPublic: true,
  publicRegistrationEnabled: true,
  waitlistEnabled: true,
  description: true,
  location: true,
  coverImage: {
    select: {
      eventId: true
    }
  },
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
} satisfies Prisma.EventSelect;

const publicRegistrationSelect = {
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
  },
  event: {
    select: {
      id: true,
      title: true,
      slug: true,
      publicSlug: true,
      date: true,
      capacity: true,
      price: true,
      isPaid: true,
      waitlistEnabled: true,
      publicRegistrationEnabled: true,
      church: {
        select: {
          name: true,
          slug: true
        }
      }
    }
  }
} satisfies Prisma.RegistrationSelect;

// Separate checkout capability: it cannot be used as a credential/check-in token.
export function getPublicCheckoutToken(registration: { id: string; checkInToken: string }) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("CHECKOUT_SECRET_REQUIRED");
  return `${registration.id}.${createHmac("sha256", secret).update(`event-checkout:${registration.id}:${registration.checkInToken}`).digest("hex")}`;
}

export async function getPublicCheckoutStatus(
  prisma: PrismaClient,
  churchSlug: string,
  eventSlug: string,
  checkoutToken: string
) {
  const event = await getPublicEventBySlugs(prisma, churchSlug, eventSlug);
  const id = checkoutToken.split(".")[0] ?? "";
  const registration = await prisma.registration.findFirst({
    where: { id, eventId: event.id, event: { church: { slug: churchSlug } } },
    select: publicRegistrationSelect
  });
  const expected = registration ? getPublicCheckoutToken(registration) : "";
  if (!registration || expected.length !== checkoutToken.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(checkoutToken))) {
    throw new Error("PUBLIC_REGISTRATION_NOT_FOUND");
  }
  return {
    id: registration.id,
    status: registration.status,
    paymentStatus: registration.paymentStatus,
    waitlistedAt: registration.waitlistedAt,
    checkInToken: registration.checkInToken,
    event: registration.event
  };
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");

  return digits.length >= 10
    ? digits
    : value.trim();
}

function normalizeEmail(value?: string) {
  const email = value?.trim().toLowerCase();

  return email || undefined;
}

async function findExistingPublicRegistrationToken(
  prisma: PrismaClient,
  eventId: string,
  input: CreatePublicRegistrationInput
) {
  const normalizedPhone = normalizePhone(input.phone);
  const normalizedEmail = normalizeEmail(input.email);

  const phoneCandidates = Array.from(
    new Set([
      input.phone.trim(),
      normalizedPhone
    ])
  );

  const identityFilters: Prisma.VisitorWhereInput[] =
    phoneCandidates.map((phone) => ({
      phone
    }));

  if (normalizedEmail) {
    identityFilters.push({
      email: {
        equals: normalizedEmail,
        mode: "insensitive"
      }
    });
  }

  const registration =
    await prisma.registration.findFirst({
      where: {
        eventId,
        registrationSource: "PUBLIC",
        status: {
          not: "CANCELLED"
        },
        visitor: {
          is: {
            name: {
              equals: input.name.trim(),
              mode: "insensitive"
            },
            OR: identityFilters
          }
        }
      },
      select: {
        checkInToken: true
      }
    });

  return registration?.checkInToken ?? null;
}

export async function getPublicEventBySlugs(
  prisma: PrismaClient,
  churchSlug: string,
  eventSlug: string
) {
  const event = await prisma.event.findFirst({
    where: {
      slug: eventSlug,
      isPublic: true,
      deletedAt: null,
      church: {
        slug: churchSlug
      }
    },
    select: publicEventSelect
  });

  if (!event) {
    throw new Error("PUBLIC_EVENT_NOT_FOUND");
  }

  return presentPublicEventContent(event);
}

export async function getPublicEventByPublicSlug(
  prisma: PrismaClient,
  publicSlug: string
) {
  const event = await prisma.event.findFirst({
    where: {
      publicSlug,
      isPublic: true,
      deletedAt: null
    },
    select: publicEventSelect
  });

  if (!event) {
    throw new Error("PUBLIC_EVENT_NOT_FOUND");
  }

  return presentPublicEventContent(event);
}

export async function getPublicRegistrationByTokenBySlugs(
  prisma: PrismaClient,
  churchSlug: string,
  eventSlug: string,
  checkInToken: string
) {
  const event = await getPublicEventBySlugs(
    prisma,
    churchSlug,
    eventSlug
  );

  const registration =
    await prisma.registration.findFirst({
      where: {
        eventId: event.id,
        checkInToken,
        status: {
          not: "CANCELLED"
        }
      },
      select: publicRegistrationSelect
    });

  if (!registration) {
    throw new Error(
      "PUBLIC_REGISTRATION_NOT_FOUND"
    );
  }

  return registration;
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

  if (!event.publicRegistrationEnabled) {
    throw new Error(
      "PUBLIC_REGISTRATION_DISABLED"
    );
  }

  const normalizedEmail =
    input.email.trim().toLowerCase();

  const normalizedInput: CreatePublicRegistrationInput = {
    name: input.name.trim(),
    phone: normalizePhone(input.phone),
    ticketId: input.ticketId,
    ticketBatchId: input.ticketBatchId,
    answers: input.answers,
    paymentMethod: input.paymentMethod,
    ...(input.cpf
      ? { cpf: input.cpf }
      : {}),
    email: normalizedEmail,
    ...(input.discountCode
      ? { discountCode: input.discountCode }
      : {})
  };

  const existingCheckInToken =
    await findExistingPublicRegistrationToken(
      prisma,
      event.id,
      normalizedInput
    );

  if (existingCheckInToken) {
    const existingRegistration =
      await getPublicRegistrationByTokenBySlugs(
        prisma,
        churchSlug,
        eventSlug,
        existingCheckInToken
      );

    return {
      ...existingRegistration,
      wasExisting: true
    };
  }

  const createdRegistration =
    await createPublicRegistration(
      prisma,
      event.id,
      normalizedInput
    );

  const registration =
    await getPublicRegistrationByTokenBySlugs(
      prisma,
      churchSlug,
      eventSlug,
      createdRegistration.checkInToken
    );

  return {
    ...registration,
    wasExisting: false
  };
}
