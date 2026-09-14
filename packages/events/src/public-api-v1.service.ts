import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { ListEventsQuery } from "./event.schema.js";

const publicEventListSelect = {
  id: true,
  title: true,
  slug: true,
  date: true,
  capacity: true,
  isPublic: true,
  isPaid: true,
  publicRegistrationEnabled: true,
  waitlistEnabled: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      registrations: {
        where: {
          status: {
            not: "CANCELLED" as const
          }
        }
      }
    }
  }
} satisfies Prisma.EventSelect;

function mapPublicEventItem(event: {
  id: string;
  title: string;
  slug: string;
  date: Date;
  capacity: number;
  isPublic: boolean;
  isPaid: boolean;
  publicRegistrationEnabled: boolean;
  waitlistEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: { registrations: number };
}) {
  return {
    id: event.id,
    title: event.title,
    slug: event.slug,
    date: event.date,
    capacity: event.capacity,
    isPublic: event.isPublic,
    isPaid: event.isPaid,
    publicRegistrationEnabled: event.publicRegistrationEnabled,
    waitlistEnabled: event.waitlistEnabled,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    registrationCount: event._count.registrations
  };
}

function paginationEnvelope(
  page: number,
  limit: number,
  total: number
) {
  return {
    page,
    currentPage: page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit)
  };
}

export async function listPublicApiEvents(
  prisma: PrismaClient,
  churchId: string,
  query: ListEventsQuery
) {
  const page = query.page;
  const limit = query.limit;
  const where: Prisma.EventWhereInput = {
    churchId,
    deletedAt: null
  };

  if (query.search) {
    where.OR = [
      {
        title: {
          contains: query.search,
          mode: "insensitive"
        }
      },
      {
        slug: {
          contains: query.search,
          mode: "insensitive"
        }
      }
    ];
  }

  const [total, events] = await Promise.all([
    prisma.event.count({
      where
    }),
    prisma.event.findMany({
      where,
      select: publicEventListSelect,
      orderBy:
        query.orderBy === "title"
          ? [{ title: query.order }, { id: query.order }]
          : [{ date: query.order }, { id: query.order }],
      skip: (page - 1) * limit,
      take: limit
    })
  ]);

  return {
    items: events.map(mapPublicEventItem),
    pagination: paginationEnvelope(page, limit, total)
  };
}

export async function getPublicApiEventById(
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
      ...publicEventListSelect,
      ticketTypes: {
        select: {
          id: true,
          name: true,
          description: true,
          isFree: true,
          isVisible: true,
          batches: {
            select: {
              id: true,
              name: true,
              quantity: true,
              price: true,
              salesStart: true,
              salesEnd: true,
              isVisible: true
            },
            orderBy: {
              salesStart: "asc"
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }

  const { ticketTypes, ...summary } = event;

  return {
    ...mapPublicEventItem(summary),
    tickets: ticketTypes.map((ticket) => ({
      id: ticket.id,
      name: ticket.name,
      description: ticket.description,
      isFree: ticket.isFree,
      isVisible: ticket.isVisible,
      batches: ticket.batches.map((batch) => ({
        id: batch.id,
        name: batch.name,
        quantity: batch.quantity,
        price: batch.price,
        salesStart: batch.salesStart,
        salesEnd: batch.salesEnd,
        isVisible: batch.isVisible
      }))
    }))
  };
}

async function requirePublicApiEvent(
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

export async function listPublicApiRegistrations(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  query: { page: number; limit: number }
) {
  await requirePublicApiEvent(prisma, churchId, eventId);

  const where = {
    churchId,
    eventId
  };
  const skip = (query.page - 1) * query.limit;

  const [total, registrations] = await Promise.all([
    prisma.registration.count({
      where
    }),
    prisma.registration.findMany({
      where,
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        createdAt: true,
        ticket: {
          select: {
            id: true,
            name: true
          }
        },
        ticketBatch: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip,
      take: query.limit
    })
  ]);

  return {
    items: registrations.map((registration) => ({
      id: registration.id,
      status: registration.status,
      paymentStatus: registration.paymentStatus,
      createdAt: registration.createdAt,
      ticket: registration.ticket,
      ticketBatch: registration.ticketBatch
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit)
    }
  };
}

export async function listPublicApiParticipants(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  query: { page: number; limit: number }
) {
  await requirePublicApiEvent(prisma, churchId, eventId);

  const where = {
    churchId,
    eventId
  };
  const skip = (query.page - 1) * query.limit;

  const [total, registrations] = await Promise.all([
    prisma.registration.count({
      where
    }),
    prisma.registration.findMany({
      where,
      select: {
        id: true,
        status: true,
        createdAt: true,
        ticket: {
          select: {
            id: true,
            name: true
          }
        },
        person: {
          select: {
            name: true,
            email: true,
            phone: true
          }
        },
        visitor: {
          select: {
            name: true,
            email: true,
            phone: true
          }
        }
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip,
      take: query.limit
    })
  ]);

  return {
    items: registrations.map((registration) => {
      const source = registration.person ?? registration.visitor;

      return {
        registrationId: registration.id,
        status: registration.status,
        createdAt: registration.createdAt,
        ticket: registration.ticket,
        participant: {
          name: source?.name ?? "",
          email: source?.email ?? null,
          phone: source?.phone ?? ""
        }
      };
    }),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit)
    }
  };
}
