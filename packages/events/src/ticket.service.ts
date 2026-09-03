import type {
  Prisma,
  PrismaClient
} from "@prisma/client";
import type {
  CreateEventTicketInput,
  CreateTicketBatchInput,
  UpdateEventTicketInput,
  UpdateTicketBatchInput
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
              registrations: {
                where: {
                  status: {
                    not: "CANCELLED"
                  }
                }
              }
            }
          }
        },
        orderBy: {
          salesStart: "asc"
        }
      },
      _count: {
        select: {
          registrations: {
            where: {
              status: {
                not: "CANCELLED"
              }
            }
          }
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

export async function updateEventTicket(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  ticketId: string,
  input: UpdateEventTicketInput
) {
  await requireEvent(prisma, churchId, eventId);

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

  const data: Prisma.EventTicketUpdateInput = {};

  if (input.name !== undefined) {
    data.name = input.name;
  }

  if (input.description !== undefined) {
    data.description =
      input.description === ""
        ? null
        : input.description;
  }

  if (input.isFree !== undefined) {
    data.isFree = input.isFree;
  }

  if (input.isVisible !== undefined) {
    data.isVisible = input.isVisible;
  }

  const include = {
    batches: true,
    _count: {
      select: {
        registrations: true
      }
    }
  } as const;

  if (input.isFree === true) {
    return prisma.$transaction(async (tx) => {
      await tx.ticketBatch.updateMany({
        where: {
          churchId,
          eventId,
          ticketId: ticket.id
        },
        data: {
          price: 0
        }
      });

      return tx.eventTicket.update({
        where: {
          id: ticket.id
        },
        data,
        include
      });
    });
  }

  return prisma.eventTicket.update({
    where: {
      id: ticket.id
    },
    data,
    include
  });
}

export async function updateTicketBatch(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  batchId: string,
  input: UpdateTicketBatchInput
) {
  await requireEvent(prisma, churchId, eventId);

  const batch = await prisma.ticketBatch.findFirst({
    where: {
      id: batchId,
      churchId,
      eventId
    },
    select: {
      id: true,
      quantity: true,
      price: true,
      salesStart: true,
      salesEnd: true,
      ticketId: true,
      _count: {
        select: {
          registrations: {
            where: {
              status: {
                not: "CANCELLED"
              }
            }
          }
        }
      }
    }
  });

  if (!batch) {
    throw new Error("TICKET_BATCH_NOT_FOUND");
  }

  const ticket = await prisma.eventTicket.findFirst({
    where: {
      churchId,
      eventId,
      id: batch.ticketId
    },
    select: {
      id: true,
      isFree: true
    }
  });

  if (!ticket) {
    throw new Error("EVENT_TICKET_NOT_FOUND");
  }

  const sold = batch._count.registrations;

  if (
    input.quantity !== undefined &&
    input.quantity < sold
  ) {
    throw new Error("QUANTITY_BELOW_SOLD");
  }

  if (
    ticket.isFree &&
    input.price !== undefined &&
    input.price !== 0
  ) {
    throw new Error("FREE_TICKET_PRICE_NOT_ZERO");
  }

  const effectiveSalesStart =
    input.salesStart ?? batch.salesStart;
  const effectiveSalesEnd =
    input.salesEnd ?? batch.salesEnd;

  if (
    (input.salesStart !== undefined ||
      input.salesEnd !== undefined) &&
    !(effectiveSalesEnd > effectiveSalesStart)
  ) {
    throw new Error("SALES_WINDOW_INVALID");
  }

  const data: Prisma.TicketBatchUpdateInput = {};

  if (input.name !== undefined) {
    data.name = input.name;
  }

  if (input.quantity !== undefined) {
    data.quantity = input.quantity;
  }

  if (input.price !== undefined) {
    data.price = ticket.isFree ? 0 : input.price;
  }

  if (input.salesStart !== undefined) {
    data.salesStart = input.salesStart;
  }

  if (input.salesEnd !== undefined) {
    data.salesEnd = input.salesEnd;
  }

  if (input.isVisible !== undefined) {
    data.isVisible = input.isVisible;
  }

  return prisma.ticketBatch.update({
    where: {
      id: batch.id
    },
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
