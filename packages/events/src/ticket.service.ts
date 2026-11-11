import { Prisma, type PrismaClient } from "@prisma/client";
import {
  projectCurrentTicketPricing,
  resolveCurrentPlatformFeePercent
} from "./platform-fee.js";
import type {
  CreateEventTicketInput,
  CreateTicketBatchInput,
  UpdateEventTicketInput,
  UpdateTicketBatchInput
} from "./ticket.schema.js";

export type TicketOccupancy = {
  registered: number;
  sold: number;
  pending: number;
  total: number | null;
  remaining: number | null;
};

type OccupancyCountRow = {
  ticketId: string | null;
  _count: {
    _all: number;
  };
};

export function occupancyFromCounts(input: {
  hasBatches: boolean;
  capacity: number;
  registered: number;
  sold: number;
  pending: number;
}): TicketOccupancy {
  const total = input.hasBatches ? input.capacity : null;

  return {
    registered: input.registered,
    sold: input.sold,
    pending: input.pending,
    total,
    remaining: total === null ? null : Math.max(total - input.registered, 0)
  };
}

export function summarizeEventOccupancy(
  tickets: Array<{ occupancy: TicketOccupancy }>,
  unassigned: {
    registered: number;
    sold: number;
    pending: number;
  }
): TicketOccupancy {
  const registered =
    tickets.reduce((sum, ticket) => sum + ticket.occupancy.registered, 0) +
    unassigned.registered;
  const sold =
    tickets.reduce((sum, ticket) => sum + ticket.occupancy.sold, 0) +
    unassigned.sold;
  const pending =
    tickets.reduce((sum, ticket) => sum + ticket.occupancy.pending, 0) +
    unassigned.pending;

  if (tickets.some((ticket) => ticket.occupancy.total === null)) {
    return {
      registered,
      sold,
      pending,
      total: null,
      remaining: null
    };
  }

  const total = tickets.reduce(
    (sum, ticket) => sum + (ticket.occupancy.total ?? 0),
    0
  );
  const occupyingLots = tickets.reduce(
    (sum, ticket) => sum + ticket.occupancy.registered,
    0
  );

  return {
    registered,
    sold,
    pending,
    total,
    remaining: Math.max(total - occupyingLots, 0)
  };
}

function occupancyCountByTicketId(rows: OccupancyCountRow[]) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (!row.ticketId) {
      continue;
    }

    counts.set(row.ticketId, row._count._all);
  }

  return counts;
}

function unassignedOccupancyCount(rows: OccupancyCountRow[]) {
  return rows.find((row) => row.ticketId == null)?._count._all ?? 0;
}

async function requireEvent(
  prisma: PrismaClient,
  churchId: string,
  eventId: string
) {
  const event = await prisma.event.findFirst({
    where: {
      churchId,
      id: eventId,
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

export async function listEventTickets(
  prisma: PrismaClient,
  churchId: string,
  eventId: string
) {
  await requireEvent(prisma, churchId, eventId);

  const church = await prisma.church.findFirst({
    where: {
      id: churchId
    },
    select: {
      platformFeePercent: true
    }
  });

  const percent = resolveCurrentPlatformFeePercent(
    church?.platformFeePercent
  );

  const registrationScope = {
    churchId,
    eventId
  };

  const [tickets, registeredRows, soldRows, pendingRows] = await Promise.all([
    prisma.eventTicket.findMany({
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
    }),
    prisma.registration.groupBy({
      by: ["ticketId"],
      where: {
        ...registrationScope,
        status: {
          not: "CANCELLED"
        }
      },
      _count: {
        _all: true
      }
    }),
    prisma.registration.groupBy({
      by: ["ticketId"],
      where: {
        ...registrationScope,
        status: {
          in: ["CONFIRMED", "CHECKED_IN"]
        },
        paymentStatus: {
          in: ["PAID", "NOT_REQUIRED"]
        },
        waitlistedAt: null
      },
      _count: {
        _all: true
      }
    }),
    prisma.registration.groupBy({
      by: ["ticketId"],
      where: {
        ...registrationScope,
        status: {
          not: "CANCELLED"
        },
        paymentStatus: {
          in: ["PENDING", "WAITING_PAYMENT"]
        }
      },
      _count: {
        _all: true
      }
    })
  ]);

  const registeredByTicket = occupancyCountByTicketId(registeredRows);
  const soldByTicket = occupancyCountByTicketId(soldRows);
  const pendingByTicket = occupancyCountByTicketId(pendingRows);

  const mappedTickets = tickets.map((ticket) => ({
    ...ticket,
    occupancy: occupancyFromCounts({
      hasBatches: ticket.batches.length > 0,
      capacity: ticket.batches.reduce((sum, batch) => sum + batch.quantity, 0),
      registered: registeredByTicket.get(ticket.id) ?? 0,
      sold: soldByTicket.get(ticket.id) ?? 0,
      pending: pendingByTicket.get(ticket.id) ?? 0
    }),
    batches: ticket.batches.map((batch) => ({
      ...batch,
      ...projectCurrentTicketPricing(
        new Prisma.Decimal(batch.price),
        percent
      )
    }))
  }));

  return {
    tickets: mappedTickets,
    occupancy: summarizeEventOccupancy(mappedTickets, {
      registered: unassignedOccupancyCount(registeredRows),
      sold: unassignedOccupancyCount(soldRows),
      pending: unassignedOccupancyCount(pendingRows)
    })
  };
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
