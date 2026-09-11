import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  EventFinancialExportQueryInput,
  EventFinancialListQueryInput,
  EventFinancialSummaryQueryInput
} from "./event-financial.schema.js";

const EXPORT_BATCH_SIZE = 200;
const CSV_UTF8_BOM = "\uFEFF";
const CSV_TIME_ZONE = "America/Sao_Paulo";
const CSV_HEADER_COLUMNS = [
  "Data",
  "Evento",
  "Participante / Origem",
  "Ingresso",
  "Lote",
  "Status",
  "Método",
  "Valor bruto",
  "Taxa da plataforma",
  "Valor líquido",
  "Percentual da taxa"
] as const;

type EventFinancialFilters = EventFinancialSummaryQueryInput;

type EventFinancialListRow = {
  id: string;
  status: "ACTIVE" | "CANCELLED" | "REVERSED";
  method: "PIX" | "CARD" | "CASH" | "BOLETO";
  amount: Prisma.Decimal;
  at: Date;
  eventId: string | null;
  event: {
    title: string;
  } | null;
  eventPayment: {
    status: string;
    amount: Prisma.Decimal;
    platformFeePercent: Prisma.Decimal | null;
    platformFeeAmount: Prisma.Decimal | null;
    netAmount: Prisma.Decimal | null;
    order: {
      registrations: Array<{
        person: {
          name: string;
          email: string | null;
          phone: string;
        } | null;
        visitor: {
          name: string;
          email: string | null;
          phone: string;
        } | null;
        ticket: {
          name: string;
        } | null;
        ticketBatch: {
          name: string;
        } | null;
      }>;
    } | null;
  } | null;
};

const eventFinancialListSelect = {
  id: true,
  status: true,
  method: true,
  amount: true,
  at: true,
  eventId: true,
  event: {
    select: {
      title: true
    }
  },
  eventPayment: {
    select: {
      status: true,
      amount: true,
      platformFeePercent: true,
      platformFeeAmount: true,
      netAmount: true,
      order: {
        select: {
          registrations: {
            select: {
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
              },
              ticket: {
                select: {
                  name: true
                }
              },
              ticketBatch: {
                select: {
                  name: true
                }
              }
            }
          }
        }
      }
    }
  }
} as const;

const eventFinancialOrderBy = [
  { at: "desc" as const },
  { id: "desc" as const }
];

function toAmount(value: Prisma.Decimal | number | null | undefined) {
  if (value == null) {
    return 0;
  }

  return Number(value);
}

function buildSearchContains(search: string) {
  return {
    contains: search,
    mode: "insensitive" as const
  };
}

function buildRegistrationSearchWhere(
  relation: "person" | "visitor" | "ticket" | "ticketBatch",
  field: "name" | "email" | "phone",
  contains: ReturnType<typeof buildSearchContains>
): Prisma.TransactionWhereInput {
  return {
    eventPayment: {
      is: {
        order: {
          is: {
            registrations: {
              some: {
                [relation]: {
                  is: {
                    [field]: contains
                  }
                }
              }
            }
          }
        }
      }
    }
  };
}

function buildSearchWhere(search: string): Prisma.TransactionWhereInput {
  const contains = buildSearchContains(search);

  return {
    OR: [
      {
        event: {
          is: {
            title: contains
          }
        }
      },
      {
        person: {
          is: {
            name: contains
          }
        }
      },
      {
        person: {
          is: {
            email: contains
          }
        }
      },
      {
        person: {
          is: {
            phone: contains
          }
        }
      },
      buildRegistrationSearchWhere("person", "name", contains),
      buildRegistrationSearchWhere("person", "email", contains),
      buildRegistrationSearchWhere("person", "phone", contains),
      buildRegistrationSearchWhere("visitor", "name", contains),
      buildRegistrationSearchWhere("visitor", "email", contains),
      buildRegistrationSearchWhere("visitor", "phone", contains),
      buildRegistrationSearchWhere("ticket", "name", contains),
      buildRegistrationSearchWhere("ticketBatch", "name", contains)
    ]
  };
}

function buildPaymentStatusWhere(
  paymentStatus: EventFinancialFilters["paymentStatus"]
): Prisma.TransactionWhereInput | undefined {
  if (!paymentStatus) {
    return undefined;
  }

  if (paymentStatus === "PAID") {
    return {
      status: "ACTIVE",
      eventPayment: {
        is: {
          status: "PAID"
        }
      }
    };
  }

  if (paymentStatus === "PENDING") {
    return {
      eventPayment: {
        is: {
          status: {
            in: ["PENDING", "OVERDUE"]
          }
        }
      }
    };
  }

  if (paymentStatus === "NO_CHARGE") {
    return {
      eventPayment: {
        is: null
      }
    };
  }

  if (paymentStatus === "REFUND_PENDING") {
    return {
      eventPayment: {
        is: {
          status: "REFUND_PENDING"
        }
      }
    };
  }

  if (paymentStatus === "CANCELLED") {
    return {
      status: "CANCELLED"
    };
  }

  return {
    status: "REVERSED"
  };
}

function buildDateAndMethodWhere(
  query: EventFinancialFilters
): Prisma.TransactionWhereInput {
  return {
    ...(query.method ? { method: query.method } : {}),
    ...(query.from || query.to
      ? {
          at: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {})
          }
        }
      : {})
  };
}

function buildEventFinancialBaseWhere(
  churchId: string,
  query: EventFinancialFilters
): Prisma.TransactionWhereInput {
  return {
    churchId,
    type: "EVENT",
    eventId: query.eventId ?? {
      not: null
    },
    eventPayment: {
      is: {
        churchId
      }
    },
    ...buildDateAndMethodWhere(query)
  };
}

function buildEventFinancialExportWhere(
  churchId: string,
  query: EventFinancialFilters
): Prisma.TransactionWhereInput {
  return buildEventFinancialListWhere(churchId, query);
}

function buildEventFinancialListWhere(
  churchId: string,
  query: EventFinancialFilters
): Prisma.TransactionWhereInput {
  const filters: Prisma.TransactionWhereInput[] = [
    buildEventFinancialBaseWhere(churchId, query)
  ];
  const paymentStatusWhere = buildPaymentStatusWhere(query.paymentStatus);

  if (paymentStatusWhere) {
    filters.push(paymentStatusWhere);
  }

  if (query.search) {
    filters.push(buildSearchWhere(query.search));
  }

  if (filters.length === 1) {
    return filters[0] ?? {
      churchId,
      type: "EVENT",
      eventId: {
        not: null
      }
    };
  }

  return {
    AND: filters
  };
}

function getEventFinancialRowPaymentLabel(row: EventFinancialListRow) {
  if (row.status === "REVERSED") {
    return "Reembolsado";
  }

  if (row.status === "CANCELLED") {
    return "Cancelado";
  }

  const paymentStatus = row.eventPayment?.status ?? null;

  if (paymentStatus === "PAID") {
    return "Pago";
  }

  if (paymentStatus === "PENDING" || paymentStatus === "OVERDUE") {
    return "Pendente";
  }

  if (paymentStatus === "REFUND_PENDING") {
    return "Reembolso em processamento";
  }

  if (paymentStatus === "CANCELLED") {
    return "Cancelado";
  }

  return "—";
}

function getEventFinancialExportPaymentLabel(row: EventFinancialListRow) {
  if (row.status === "REVERSED") {
    return "Estornado";
  }

  if (row.status === "CANCELLED") {
    return "Cancelado";
  }

  const paymentStatus = row.eventPayment?.status ?? null;

  if (paymentStatus === "PAID") {
    return "Pago";
  }

  if (paymentStatus === "PENDING" || paymentStatus === "OVERDUE") {
    return "Pendente";
  }

  if (paymentStatus === "REFUND_PENDING") {
    return "Reembolso em processamento";
  }

  if (paymentStatus === "CANCELLED") {
    return "Cancelado";
  }

  return "Pendente";
}

function getParticipantName(row: EventFinancialListRow) {
  const names =
    row.eventPayment?.order?.registrations
      .map((registration) => {
        return registration.person?.name ?? registration.visitor?.name ?? null;
      })
      .filter((name): name is string => Boolean(name)) ?? [];

  if (names.length > 0) {
    return names.join(", ");
  }

  return "—";
}

function getTicketNames(row: EventFinancialListRow) {
  const firstRegistration = row.eventPayment?.order?.registrations[0];

  return {
    ticketName: firstRegistration?.ticket?.name ?? null,
    batchName: firstRegistration?.ticketBatch?.name ?? null
  };
}

function hasEventPaymentSnapshot(row: EventFinancialListRow) {
  return row.eventPayment?.platformFeePercent != null;
}

function mapEventFinancialListItem(row: EventFinancialListRow) {
  const ticket = getTicketNames(row);
  const hasSnapshot = hasEventPaymentSnapshot(row);

  return {
    id: row.id,
    eventId: row.eventId ?? "",
    eventTitle: row.event?.title ?? "",
    participantName: getParticipantName(row),
    ticketName: ticket.ticketName,
    batchName: ticket.batchName,
    paymentLabel: getEventFinancialRowPaymentLabel(row),
    method: row.method,
    amount: toAmount(row.amount),
    grossAmount: hasSnapshot ? toAmount(row.eventPayment?.amount) : null,
    platformFeeAmount: hasSnapshot
      ? toAmount(row.eventPayment?.platformFeeAmount)
      : null,
    netAmount: hasSnapshot ? toAmount(row.eventPayment?.netAmount) : null,
    at: row.at.toISOString()
  };
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function csvMoney(value: Prisma.Decimal | null | undefined) {
  if (value == null) {
    return "";
  }

  return value.toFixed(2).replace(".", ",");
}

function csvPercent(value: Prisma.Decimal | null | undefined) {
  if (value == null) {
    return "";
  }

  return value.toString().replace(".", ",");
}

function formatCsvDateTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CSV_TIME_ZONE,
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${read("day")}/${read("month")}/${read("year")} ${read("hour")}:${read("minute")}`;
}

function toCsvLine(row: EventFinancialListRow) {
  const ticket = getTicketNames(row);
  const snapshot = row.eventPayment;
  const hasSnapshot = hasEventPaymentSnapshot(row);

  return [
    csvCell(formatCsvDateTime(row.at)),
    csvCell(row.event?.title ?? ""),
    csvCell(getParticipantName(row)),
    csvCell(ticket.ticketName ?? ""),
    csvCell(ticket.batchName ?? ""),
    csvCell(getEventFinancialExportPaymentLabel(row)),
    csvCell(row.method),
    csvCell(hasSnapshot ? csvMoney(snapshot?.amount) : ""),
    csvCell(hasSnapshot ? csvMoney(snapshot?.platformFeeAmount) : ""),
    csvCell(hasSnapshot ? csvMoney(snapshot?.netAmount) : ""),
    csvCell(hasSnapshot ? csvPercent(snapshot?.platformFeePercent) : "")
  ].join(";");
}

export async function getEventFinancialSummary(
  prisma: PrismaClient,
  churchId: string,
  query: EventFinancialSummaryQueryInput
) {
  const countWhere = buildEventFinancialListWhere(churchId, {
    ...query,
    paymentStatus: undefined
  });

  const [eventSales, paid, pending, cancelled, reversed] = await Promise.all([
    prisma.eventPayment.aggregate({
      where: {
        churchId,
        status: "PAID",
        platformFeePercent: {
          not: null
        },
        ...(query.eventId ? { eventId: query.eventId } : {}),
        transaction: {
          is: {
            type: "EVENT",
            status: "ACTIVE",
            ...buildDateAndMethodWhere(query)
          }
        }
      },
      _sum: {
        amount: true,
        platformFeeAmount: true,
        netAmount: true
      }
    }),
    prisma.transaction.count({
      where: {
        AND: [
          countWhere,
          {
            status: "ACTIVE",
            eventPayment: {
              is: {
                status: "PAID"
              }
            }
          }
        ]
      }
    }),
    prisma.transaction.count({
      where: {
        AND: [
          countWhere,
          {
            eventPayment: {
              is: {
                status: {
                  in: ["PENDING", "OVERDUE"]
                }
              }
            }
          }
        ]
      }
    }),
    prisma.transaction.count({
      where: {
        AND: [
          countWhere,
          {
            status: "CANCELLED"
          }
        ]
      }
    }),
    prisma.transaction.count({
      where: {
        AND: [
          countWhere,
          {
            status: "REVERSED"
          }
        ]
      }
    })
  ]);

  return {
    eventSales: {
      grossAmount: toAmount(eventSales._sum.amount),
      platformFeeAmount: toAmount(eventSales._sum.platformFeeAmount),
      netAmount: toAmount(eventSales._sum.netAmount)
    },
    counts: {
      paid,
      pending,
      cancelled,
      reversed
    }
  };
}

export async function listEventFinancialTransactions(
  prisma: PrismaClient,
  churchId: string,
  query: EventFinancialListQueryInput
) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  const where = buildEventFinancialListWhere(churchId, query);
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    prisma.transaction.count({
      where
    }),
    prisma.transaction.findMany({
      where,
      select: eventFinancialListSelect,
      orderBy: eventFinancialOrderBy,
      take: limit,
      skip
    })
  ]);

  return {
    items: items.map(mapEventFinancialListItem),
    pagination: {
      page,
      currentPage: page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit)
    }
  };
}

export async function streamEventFinancialExport(
  prisma: PrismaClient,
  churchId: string,
  query: EventFinancialExportQueryInput,
  write: (chunk: string) => void
) {
  const where = buildEventFinancialExportWhere(churchId, query);

  write(
    `${CSV_UTF8_BOM}${CSV_HEADER_COLUMNS.map((column) => csvCell(column)).join(";")}\n`
  );

  let cursorAt: Date | undefined;
  let cursorId: string | undefined;

  while (true) {
    const items = await prisma.transaction.findMany({
      where: {
        AND: [
          where,
          cursorAt && cursorId
            ? {
                OR: [
                  {
                    at: {
                      lt: cursorAt
                    }
                  },
                  {
                    AND: [
                      {
                        at: cursorAt
                      },
                      {
                        id: {
                          lt: cursorId
                        }
                      }
                    ]
                  }
                ]
              }
            : {}
        ]
      },
      select: eventFinancialListSelect,
      orderBy: eventFinancialOrderBy,
      take: EXPORT_BATCH_SIZE
    });

    if (items.length === 0) {
      break;
    }

    for (const item of items) {
      write(`${toCsvLine(item)}\n`);
    }

    if (items.length < EXPORT_BATCH_SIZE) {
      break;
    }

    const lastItem = items[items.length - 1];

    if (!lastItem) {
      break;
    }

    cursorAt = lastItem.at;
    cursorId = lastItem.id;
  }
}
