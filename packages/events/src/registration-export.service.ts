import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  CSV_UTF8_BOM,
  csvLine,
  formatCsvDateTime,
  formatCsvFilenameDate,
  sanitizeCsvFilenamePart
} from "./csv.js";
import type { ExportEventRegistrationsQuery } from "./event.schema.js";
import { buildListWhereSql } from "./registration-list.service.js";

const EXPORT_BATCH_SIZE = 200;

export const PARTICIPANT_CSV_FIXED_HEADERS = [
  "Nome",
  "E-mail",
  "Telefone",
  "Ingresso",
  "Lote",
  "Status da inscrição",
  "Status do pagamento",
  "Status do check-in",
  "Data da inscrição"
] as const;

type ExportableFormField = {
  id: string;
  label: string;
  isSensitive: boolean;
};

type ExportRegistrationRow = {
  id: string;
  status: string;
  paymentStatus: string;
  waitlistedAt: Date | null;
  createdAt: Date;
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
  formAnswers: Array<{
    fieldId: string;
    value: Prisma.JsonValue;
  }>;
};

async function requireExportEvent(
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
      id: true,
      slug: true
    }
  });

  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }

  return event;
}

function uniqueFormFieldHeaders(fields: ExportableFormField[]) {
  const seen = new Map<string, number>();

  return fields.map((field) => {
    const count = (seen.get(field.label) ?? 0) + 1;
    seen.set(field.label, count);

    if (count === 1) {
      return field.label;
    }

    return `${field.label} (${count})`;
  });
}

function serializeFormAnswerValue(value: Prisma.JsonValue | undefined) {
  if (value == null) {
    return "";
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => (item == null ? "" : String(item)))
      .filter((item) => item !== "")
      .join(", ");
  }

  if (typeof value === "object") {
    return "";
  }

  return String(value);
}

function registrationStatusLabel(
  status: string,
  waitlistedAt: Date | null
) {
  if (waitlistedAt) {
    return "Lista de espera";
  }

  if (status === "PENDING") {
    return "Pendente";
  }

  if (status === "CONFIRMED" || status === "CHECKED_IN") {
    return "Confirmada";
  }

  if (status === "CANCELLED") {
    return "Cancelada";
  }

  return "";
}

function paymentStatusLabel(status: string) {
  if (status === "PAID") {
    return "Pago";
  }

  if (status === "PENDING") {
    return "Pendente";
  }

  if (status === "WAITING_PAYMENT") {
    return "Aguardando pagamento";
  }

  if (status === "NOT_REQUIRED") {
    return "Não necessário";
  }

  if (status === "CANCELLED") {
    return "Cancelado";
  }

  if (status === "REFUNDED") {
    return "Reembolsado";
  }

  if (status === "WAITLISTED") {
    return "Lista de espera";
  }

  return "";
}

function checkInStatusLabel(status: string) {
  return status === "CHECKED_IN" ? "Presente" : "Não realizado";
}

function toCsvRow(
  registration: ExportRegistrationRow,
  exportableFields: ExportableFormField[]
) {
  const participant = registration.person ?? registration.visitor;
  const answersByFieldId = new Map(
    registration.formAnswers.map((answer) => [answer.fieldId, answer.value])
  );

  return csvLine([
    participant?.name ?? "",
    participant?.email ?? "",
    participant?.phone ?? "",
    registration.ticket?.name ?? "",
    registration.ticketBatch?.name ?? "",
    registrationStatusLabel(registration.status, registration.waitlistedAt),
    paymentStatusLabel(registration.paymentStatus),
    checkInStatusLabel(registration.status),
    formatCsvDateTime(registration.createdAt),
    ...exportableFields.map((field) =>
      field.isSensitive
        ? ""
        : serializeFormAnswerValue(answersByFieldId.get(field.id))
    )
  ]);
}

function buildCursorSql(cursor: { createdAt: Date; id: string } | null) {
  if (!cursor) {
    return null;
  }

  return Prisma.sql`(
    r."createdAt" > ${cursor.createdAt}
    OR (
      r."createdAt" = ${cursor.createdAt}
      AND r.id > ${cursor.id}
    )
  )`;
}

export function buildParticipantExportFilename(eventSlug: string, date = new Date()) {
  return `participantes-${sanitizeCsvFilenamePart(eventSlug)}-${formatCsvFilenameDate(date)}.csv`;
}

export async function createEventRegistrationsCsvExport(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  query: ExportEventRegistrationsQuery
) {
  const event = await requireExportEvent(prisma, churchId, eventId);
  const filename = buildParticipantExportFilename(event.slug);
  const exportableFields = await prisma.eventFormField.findMany({
    where: {
      churchId,
      eventId
    },
    select: {
      id: true,
      label: true,
      isSensitive: true
    },
    orderBy: {
      order: "asc"
    }
  });
  const answerFieldIds = exportableFields
    .filter((field) => !field.isSensitive)
    .map((field) => field.id);
  const headers = [
    ...PARTICIPANT_CSV_FIXED_HEADERS,
    ...uniqueFormFieldHeaders(exportableFields)
  ];
  const whereSql = buildListWhereSql(churchId, eventId, query);

  return {
    filename,
    async stream(write: (chunk: string) => void) {
      write(`${CSV_UTF8_BOM}${csvLine(headers)}\n`);

      let cursor: { createdAt: Date; id: string } | null = null;

      while (true) {
        const cursorSql = buildCursorSql(cursor);
        const whereWithCursor = cursorSql
          ? Prisma.join([whereSql, cursorSql], " AND ")
          : whereSql;
        const idRows = await prisma.$queryRaw<
          Array<{ id: string; createdAt: Date }>
        >`
          SELECT r.id, r."createdAt"
          FROM "Registration" r
          LEFT JOIN "Person" p ON p.id = r."personId"
          LEFT JOIN "Visitor" v ON v.id = r."visitorId"
          WHERE ${whereWithCursor}
          ORDER BY r."createdAt" ASC, r.id ASC
          LIMIT ${EXPORT_BATCH_SIZE}
        `;

        if (idRows.length === 0) {
          break;
        }

        const orderedIds = idRows.map((row) => row.id);
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
            waitlistedAt: true,
            createdAt: true,
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
            },
            formAnswers: {
              where: {
                fieldId: {
                  in:
                    answerFieldIds.length > 0
                      ? answerFieldIds
                      : ["__none__"]
                }
              },
              select: {
                fieldId: true,
                value: true
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

        for (const id of orderedIds) {
          const registration = registrationsById.get(id);

          if (!registration) {
            continue;
          }

          write(`${toCsvRow(registration, exportableFields)}\n`);
        }

        if (idRows.length < EXPORT_BATCH_SIZE) {
          break;
        }

        const lastRow = idRows[idRows.length - 1];

        if (!lastRow) {
          break;
        }

        cursor = {
          createdAt: lastRow.createdAt,
          id: lastRow.id
        };
      }
    }
  };
}
