import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { ListEventRegistrationsQuery } from "./event.schema.js";

const ACCENT_SOURCE =
  "áàâãäéêëèíïîìóôõöòúûüùçñÁÀÂÃÄÉÊËÈÍÏÎÌÓÔÕÖÒÚÛÜÙÇÑ";
const ACCENT_TARGET =
  "aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn";

function normalizeEventSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function canRevealCheckInToken(registration: {
  status: string;
  paymentStatus: string;
  waitlistedAt: Date | null;
}) {
  if (registration.status === "CANCELLED") {
    return false;
  }

  if (registration.waitlistedAt) {
    return false;
  }

  return (
    registration.paymentStatus === "PAID" ||
    registration.paymentStatus === "NOT_REQUIRED"
  );
}

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

function searchableText(column: Prisma.Sql) {
  return Prisma.sql`btrim(regexp_replace(translate(lower(coalesce(${column}, '')), ${ACCENT_SOURCE}, ${ACCENT_TARGET}), '[[:space:]]+', ' ', 'g'))`;
}

function buildListWhereSql(
  churchId: string,
  eventId: string,
  query: ListEventRegistrationsQuery
) {
  const filters: Prisma.Sql[] = [
    Prisma.sql`r."churchId" = ${churchId}`,
    Prisma.sql`r."eventId" = ${eventId}`
  ];

  if (query.status) {
    filters.push(Prisma.sql`r.status = ${query.status}`);
  }

  if (query.paymentStatus) {
    filters.push(
      Prisma.sql`r."paymentStatus" = ${query.paymentStatus}`
    );
  }

  if (query.ticketId) {
    filters.push(Prisma.sql`r."ticketId" = ${query.ticketId}`);
  }

  const normalizedSearch = query.search
    ? normalizeEventSearch(query.search)
    : "";

  if (normalizedSearch) {
    filters.push(Prisma.sql`(
      position(${normalizedSearch} in ${searchableText(Prisma.sql`p.name`)}) > 0
      OR position(${normalizedSearch} in ${searchableText(Prisma.sql`p.email`)}) > 0
      OR position(${normalizedSearch} in ${searchableText(Prisma.sql`p.phone`)}) > 0
      OR position(${normalizedSearch} in ${searchableText(Prisma.sql`v.name`)}) > 0
      OR position(${normalizedSearch} in ${searchableText(Prisma.sql`v.email`)}) > 0
      OR position(${normalizedSearch} in ${searchableText(Prisma.sql`v.phone`)}) > 0
      OR (
        position(${normalizedSearch} in ${searchableText(Prisma.sql`r."checkInToken"`)}) > 0
        AND r.status <> 'CANCELLED'
        AND r."waitlistedAt" IS NULL
        AND r."paymentStatus" IN ('PAID', 'NOT_REQUIRED')
      )
    )`);
  }

  return Prisma.join(filters, " AND ");
}

export async function listEventRegistrations(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  query: ListEventRegistrationsQuery
) {
  await requireEvent(prisma, churchId, eventId);

  const skip = (query.page - 1) * query.limit;
  const whereSql = buildListWhereSql(churchId, eventId, query);

  const [countRows, idRows] = await prisma.$transaction([
    prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(*)::bigint AS total
      FROM "Registration" r
      LEFT JOIN "Person" p ON p.id = r."personId"
      LEFT JOIN "Visitor" v ON v.id = r."visitorId"
      WHERE ${whereSql}
    `,
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT r.id
      FROM "Registration" r
      LEFT JOIN "Person" p ON p.id = r."personId"
      LEFT JOIN "Visitor" v ON v.id = r."visitorId"
      WHERE ${whereSql}
      ORDER BY r."createdAt" ASC, r.id ASC
      LIMIT ${query.limit} OFFSET ${skip}
    `
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const orderedIds = idRows.map((row) => row.id);

  if (orderedIds.length === 0) {
    return {
      items: [],
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit)
      }
    };
  }

  const registrations = await prisma.registration.findMany({
    where: {
      churchId,
      eventId,
      id: {
        in: orderedIds
      }
    },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      checkInToken: true,
      waitlistedAt: true,
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
      },
      formAnswers: {
        select: {
          id: true,
          value: true,
          field: {
            select: {
              id: true,
              label: true,
              isSensitive: true,
              order: true
            }
          }
        },
        orderBy: {
          field: {
            order: "asc"
          }
        }
      }
    }
  });

  const registrationsById = new Map(
    registrations.map((registration) => [
      registration.id,
      registration
    ])
  );

  const items = orderedIds.flatMap((id) => {
    const registration = registrationsById.get(id);

    if (!registration) {
      return [];
    }

    return [
      {
        id: registration.id,
        status: registration.status,
        paymentStatus: registration.paymentStatus,
        checkInToken: canRevealCheckInToken(registration)
          ? registration.checkInToken
          : null,
        waitlistedAt: registration.waitlistedAt,
        person: registration.person,
        visitor: registration.visitor,
        ticket: registration.ticket,
        ticketBatch: registration.ticketBatch,
        formAnswers: registration.formAnswers.map((answer) => ({
          id: answer.id,
          value: answer.field.isSensitive ? null : answer.value,
          field: answer.field
        }))
      }
    ];
  });

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit)
    }
  };
}
