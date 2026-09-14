import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type {
  CreateEventDiscountInput,
  UpdateEventDiscountInput,
  ValidatePublicDiscountInput
} from "./discount.schema.js";

function normalizeDiscountCode(code: string) {
  return code.trim().toUpperCase();
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
      id: true
    }
  });

  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }

  return event;
}

async function requireEventTicket(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  ticketId: string
) {
  const ticket = await prisma.eventTicket.findFirst({
    where: {
      id: ticketId,
      churchId,
      eventId
    },
    select: {
      id: true
    }
  });

  if (!ticket) {
    throw new Error("EVENT_TICKET_NOT_FOUND");
  }

  return ticket;
}

const discountListInclude = {
  ticket: {
    select: {
      id: true,
      name: true
    }
  }
} as const;

export async function resolveApplicableEventDiscount(
  prisma: PrismaClient,
  input: {
    churchId: string;
    eventId: string;
    ticketId: string;
    ticketBatchId: string;
    code: string;
  }
) {
  const code = normalizeDiscountCode(input.code);

  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    throw new Error("DISCOUNT_NOT_APPLICABLE");
  }

  const [batch, discount] = await Promise.all([
    prisma.ticketBatch.findFirst({
      where: {
        id: input.ticketBatchId,
        churchId: input.churchId,
        eventId: input.eventId,
        ticketId: input.ticketId
      },
      select: {
        id: true,
        ticketId: true,
        price: true
      }
    }),
    prisma.eventDiscount.findFirst({
      where: {
        churchId: input.churchId,
        eventId: input.eventId,
        ticketId: input.ticketId,
        code,
        isActive: true
      },
      select: {
        id: true,
        ticketId: true,
        code: true,
        finalPrice: true,
        isActive: true
      }
    })
  ]);

  if (!batch || !discount) {
    throw new Error("DISCOUNT_NOT_APPLICABLE");
  }

  const listPrice = new Prisma.Decimal(batch.price);
  const finalPrice = new Prisma.Decimal(discount.finalPrice);

  if (!finalPrice.gt(0) || !finalPrice.lt(listPrice)) {
    throw new Error("DISCOUNT_NOT_APPLICABLE");
  }

  return {
    id: discount.id,
    code: discount.code,
    ticketId: discount.ticketId,
    listPrice,
    finalPrice
  };
}

export async function listEventDiscounts(
  prisma: PrismaClient,
  churchId: string,
  eventId: string
) {
  await requireEvent(prisma, churchId, eventId);

  return prisma.eventDiscount.findMany({
    where: {
      churchId,
      eventId
    },
    include: discountListInclude,
    orderBy: {
      createdAt: "asc"
    }
  });
}

export async function createEventDiscount(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  input: CreateEventDiscountInput
) {
  await requireEvent(prisma, churchId, eventId);
  await requireEventTicket(prisma, churchId, eventId, input.ticketId);

  return prisma.eventDiscount.create({
    data: {
      churchId,
      eventId,
      ticketId: input.ticketId,
      code: input.code,
      finalPrice: input.finalPrice,
      isActive: input.isActive ?? true
    },
    include: discountListInclude
  });
}

export async function updateEventDiscount(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  discountId: string,
  input: UpdateEventDiscountInput
) {
  const discount = await prisma.eventDiscount.findFirst({
    where: {
      id: discountId,
      churchId,
      eventId
    },
    select: {
      id: true
    }
  });

  if (!discount) {
    throw new Error("EVENT_DISCOUNT_NOT_FOUND");
  }

  if (input.ticketId) {
    await requireEventTicket(prisma, churchId, eventId, input.ticketId);
  }

  return prisma.eventDiscount.update({
    where: {
      id: discount.id
    },
    data: {
      ...(input.ticketId !== undefined ? { ticketId: input.ticketId } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.finalPrice !== undefined
        ? { finalPrice: input.finalPrice }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
    },
    include: discountListInclude
  });
}

export async function validatePublicEventDiscount(
  prisma: PrismaClient,
  churchSlug: string,
  eventSlug: string,
  input: ValidatePublicDiscountInput
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
    select: {
      id: true,
      churchId: true
    }
  });

  if (!event) {
    throw new Error("PUBLIC_EVENT_NOT_FOUND");
  }

  const applied = await resolveApplicableEventDiscount(prisma, {
    churchId: event.churchId,
    eventId: event.id,
    ticketId: input.ticketId,
    ticketBatchId: input.ticketBatchId,
    code: input.code
  });

  return {
    code: applied.code,
    ticketId: applied.ticketId,
    listPrice: applied.listPrice,
    finalPrice: applied.finalPrice
  };
}
