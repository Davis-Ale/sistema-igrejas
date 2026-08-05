import type {
  Prisma,
  PrismaClient
} from "@prisma/client";
import type {
  CreateEventTicketInput,
  CreateTicketBatchInput
} from "./ticket.schema.js";

async function requireEvent(
  prisma: PrismaClient,
  churchId: string,
  eventId: string
) {
  const event = await prisma.event.findFirst({
    where: {
      churchId,
      id: eventId
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

export async function listEventTickets(
  prisma: PrismaClient,
  churchId: string,
  eventId: string
) {
  await requireEvent(prisma, churchId, eventId);

  return prisma.eventTicket.findMany({
    where: {
      churchId,
      eventId
    },
    include: {
      batches: {
        include: {
          _count: {
            select: {
              registrations: true
            }
          }
        },
        orderBy: {
          salesStart: "asc"
        }
      },
      _count: {
        select: {
          registrations: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });
}

export async function createEventTicket(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  input: CreateEventTicketInput
) {
  await requireEvent(prisma, churchId, eventId);

  return prisma.eventTicket.create({
    data: {
      churchId,
      eventId,
      name: input.name,
      description: input.description ?? null,
      isFree: input.isFree,
      isVisible: input.isVisible
    },
    include: {
      batches: true,
      _count: {
        select: {
          registrations: true
        }
      }
    }
  });
}

export async function createTicketBatch(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  input: CreateTicketBatchInput
) {
  const ticket = await prisma.eventTicket.findFirst({
    where: {
      churchId,
      eventId,
      id: input.ticketId
    },
    select: {
      id: true,
      isFree: true
    }
  });

  if (!ticket) {
    throw new Error("EVENT_TICKET_NOT_FOUND");
  }

  if (ticket.isFree && input.price !== 0) {
    throw new Error("FREE_TICKET_PRICE_NOT_ZERO");
  }

  const data: Prisma.TicketBatchUncheckedCreateInput = {
    churchId,
    eventId,
    ticketId: ticket.id,
    name: input.name,
    quantity: input.quantity,
    price: ticket.isFree ? 0 : input.price,
    salesStart: input.salesStart,
    salesEnd: input.salesEnd,
    isVisible: input.isVisible
  };

  return prisma.ticketBatch.create({
    data,
    include: {
      _count: {
        select: {
          registrations: true
        }
      }
    }
  });
}
