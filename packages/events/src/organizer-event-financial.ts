import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

const ZERO = new Prisma.Decimal(0);

export type OrganizerFinancialAmounts = {
  grossAmount: string;
  platformFeeAmount: string;
  netAmount: string;
  count: number;
};

export type OrganizerFinancialPending = {
  amount: string;
  count: number;
};

export type OrganizerEventFinancialTicket = {
  ticketId: string | null;
  ticketName: string;
  realized: OrganizerFinancialAmounts;
  pending: OrganizerFinancialPending;
  reversed: OrganizerFinancialPending;
  inconsistent: { count: number };
};

export type OrganizerEventFinancial = {
  eventId: string;
  realized: OrganizerFinancialAmounts;
  pending: OrganizerFinancialPending;
  reversed: OrganizerFinancialPending;
  refundPending: OrganizerFinancialPending;
  cancelled: { count: number };
  noCharge: { count: number };
  inconsistent: { count: number };
  tickets: OrganizerEventFinancialTicket[];
};

export type OrganizerFinancialTicketRef = {
  id: string;
  name: string;
};

export type OrganizerFinancialSource = {
  status: string;
  amount: Prisma.Decimal | string | number;
  platformFeePercent: Prisma.Decimal | string | number | null;
  platformFeeAmount: Prisma.Decimal | string | number | null;
  netAmount: Prisma.Decimal | string | number | null;
  transactionStatus: string;
  tickets: OrganizerFinancialTicketRef[];
};

type Bucket = {
  gross: Prisma.Decimal;
  fee: Prisma.Decimal;
  net: Prisma.Decimal;
  realizedCount: number;
  pending: Prisma.Decimal;
  pendingCount: number;
  reversed: Prisma.Decimal;
  reversedCount: number;
  inconsistent: number;
};

function emptyBucket(): Bucket {
  return {
    gross: ZERO,
    fee: ZERO,
    net: ZERO,
    realizedCount: 0,
    pending: ZERO,
    pendingCount: 0,
    reversed: ZERO,
    reversedCount: 0,
    inconsistent: 0
  };
}

function money(value: Prisma.Decimal) {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
}

function asDecimal(value: Prisma.Decimal | string | number | null | undefined) {
  if (value == null || value === "") {
    return null;
  }

  try {
    const decimal = new Prisma.Decimal(value);
    if (!decimal.isFinite()) {
      return null;
    }
    return decimal;
  } catch {
    return null;
  }
}

function amounts(bucket: Bucket): OrganizerFinancialAmounts {
  return {
    grossAmount: money(bucket.gross),
    platformFeeAmount: money(bucket.fee),
    netAmount: money(bucket.net),
    count: bucket.realizedCount
  };
}

function pending(amount: Prisma.Decimal, count: number): OrganizerFinancialPending {
  return {
    amount: money(amount),
    count
  };
}

function ticketIdentity(tickets: OrganizerFinancialTicketRef[]) {
  const unique = new Map<string, string>();

  for (const ticket of tickets) {
    if (ticket.id && ticket.name) {
      unique.set(ticket.id, ticket.name);
    }
  }

  if (unique.size === 1) {
    const [ticketId, ticketName] = [...unique.entries()][0]!;
    return { ticketId, ticketName };
  }

  if (unique.size === 0) {
    return { ticketId: null, ticketName: "Sem ingresso" };
  }

  return { ticketId: null, ticketName: "Vários ingressos" };
}

export function aggregateOrganizerEventFinancial(
  eventId: string,
  rows: OrganizerFinancialSource[]
): OrganizerEventFinancial {
  const totals = emptyBucket();
  let refundPendingAmount = ZERO;
  let refundPendingCount = 0;
  let cancelledCount = 0;
  let noChargeCount = 0;
  const tickets = new Map<string, OrganizerEventFinancialTicket & { bucket: Bucket }>();

  for (const row of rows) {
    const amount = asDecimal(row.amount);
    const identity = ticketIdentity(row.tickets);
    const key = identity.ticketId ?? `name:${identity.ticketName}`;
    let ticket = tickets.get(key);

    if (!ticket) {
      ticket = {
        ticketId: identity.ticketId,
        ticketName: identity.ticketName,
        realized: amounts(emptyBucket()),
        pending: pending(ZERO, 0),
        reversed: pending(ZERO, 0),
        inconsistent: { count: 0 },
        bucket: emptyBucket()
      };
      tickets.set(key, ticket);
    }

    if (amount == null) {
      totals.inconsistent += 1;
      ticket.bucket.inconsistent += 1;
      continue;
    }

    if (row.transactionStatus === "REVERSED" || row.status === "REFUNDED") {
      totals.reversed = totals.reversed.plus(amount);
      totals.reversedCount += 1;
      ticket.bucket.reversed = ticket.bucket.reversed.plus(amount);
      ticket.bucket.reversedCount += 1;
      continue;
    }

    if (row.status === "REFUND_PENDING") {
      refundPendingAmount = refundPendingAmount.plus(amount);
      refundPendingCount += 1;
      continue;
    }

    if (row.transactionStatus === "CANCELLED" || row.status === "CANCELLED") {
      cancelledCount += 1;
      continue;
    }

    if (row.status === "NO_CHARGE") {
      noChargeCount += 1;
      continue;
    }

    if (row.status === "PENDING" || row.status === "OVERDUE") {
      if (row.transactionStatus !== "ACTIVE") {
        totals.inconsistent += 1;
        ticket.bucket.inconsistent += 1;
        continue;
      }

      totals.pending = totals.pending.plus(amount);
      totals.pendingCount += 1;
      ticket.bucket.pending = ticket.bucket.pending.plus(amount);
      ticket.bucket.pendingCount += 1;
      continue;
    }

    if (row.status === "PAID" && row.transactionStatus === "ACTIVE") {
      const percent = asDecimal(row.platformFeePercent);
      const fee = asDecimal(row.platformFeeAmount);
      const net = asDecimal(row.netAmount);

      if (percent == null || fee == null || net == null) {
        totals.inconsistent += 1;
        ticket.bucket.inconsistent += 1;
        continue;
      }

      totals.gross = totals.gross.plus(amount);
      totals.fee = totals.fee.plus(fee);
      totals.net = totals.net.plus(net);
      totals.realizedCount += 1;
      ticket.bucket.gross = ticket.bucket.gross.plus(amount);
      ticket.bucket.fee = ticket.bucket.fee.plus(fee);
      ticket.bucket.net = ticket.bucket.net.plus(net);
      ticket.bucket.realizedCount += 1;
      continue;
    }

    totals.inconsistent += 1;
    ticket.bucket.inconsistent += 1;
  }

  return {
    eventId,
    realized: amounts(totals),
    pending: pending(totals.pending, totals.pendingCount),
    reversed: pending(totals.reversed, totals.reversedCount),
    refundPending: pending(refundPendingAmount, refundPendingCount),
    cancelled: { count: cancelledCount },
    noCharge: { count: noChargeCount },
    inconsistent: { count: totals.inconsistent },
    tickets: [...tickets.values()]
      .map((ticket) => ({
        ticketId: ticket.ticketId,
        ticketName: ticket.ticketName,
        realized: amounts(ticket.bucket),
        pending: pending(ticket.bucket.pending, ticket.bucket.pendingCount),
        reversed: pending(ticket.bucket.reversed, ticket.bucket.reversedCount),
        inconsistent: { count: ticket.bucket.inconsistent }
      }))
      .filter((ticket) => ticket.realized.count > 0 || ticket.pending.count > 0 ||
        ticket.reversed.count > 0 || ticket.inconsistent.count > 0)
      .sort((left, right) => left.ticketName.localeCompare(right.ticketName, "pt-BR"))
  };
}

type OrganizerPaymentRow = {
  status: string;
  amount: Prisma.Decimal | string | number;
  platformFeePercent: Prisma.Decimal | string | number | null;
  platformFeeAmount: Prisma.Decimal | string | number | null;
  netAmount: Prisma.Decimal | string | number | null;
  transaction: { status: string };
  order: {
    registrations: Array<{
      ticket: { id: string; name: string } | null;
    }>;
  } | null;
};

export async function getOrganizerEventFinancial(
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

  const rows = await prisma.eventPayment.findMany({
    where: {
      churchId,
      eventId
    },
    select: {
      status: true,
      amount: true,
      platformFeePercent: true,
      platformFeeAmount: true,
      netAmount: true,
      transaction: {
        select: {
          status: true
        }
      },
      order: {
        select: {
          registrations: {
            select: {
              ticket: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      }
    }
  });

  return aggregateOrganizerEventFinancial(eventId, rows.map((row: OrganizerPaymentRow) => ({
    status: row.status,
    amount: row.amount,
    platformFeePercent: row.platformFeePercent,
    platformFeeAmount: row.platformFeeAmount,
    netAmount: row.netAmount,
    transactionStatus: row.transaction.status,
    tickets: row.order?.registrations.flatMap((registration) => registration.ticket
      ? [{ id: registration.ticket.id, name: registration.ticket.name }]
      : []) ?? []
  })));
}
