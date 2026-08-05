import type {
  EventFormFieldType,
  Prisma,
  PrismaClient
} from "@prisma/client";
import type {
  CreateEventFormFieldInput,
  ReorderEventFormFieldsInput,
  UpdateEventFormFieldInput
} from "./registration-form.schema.js";

const fieldInclude = {
  options: {
    orderBy: {
      order: "asc"
    }
  },
  ticketScopes: {
    include: {
      ticket: {
        select: {
          id: true,
          name: true
        }
      }
    }
  }
} satisfies Prisma.EventFormFieldInclude;

async function requireEvent(
  prisma: PrismaClient,
  churchId: string,
  eventId: string
) {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      churchId
    },
    select: {
      id: true
    }
  });

  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }
}

async function requireTickets(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  ticketIds: string[]
) {
  if (ticketIds.length === 0) {
    return;
  }

  const count = await prisma.eventTicket.count({
    where: {
      churchId,
      eventId,
      id: {
        in: ticketIds
      }
    }
  });

  if (count !== new Set(ticketIds).size) {
    throw new Error("EVENT_TICKET_NOT_FOUND");
  }
}

function buildOptions(
  options: Array<{
    label: string;
    value: string;
  }>
) {
  return options.map((option, index) => ({
    label: option.label,
    value: option.value,
    order: index + 1
  }));
}

export async function listEventFormFields(
  prisma: PrismaClient,
  churchId: string,
  eventId: string
) {
  await requireEvent(prisma, churchId, eventId);

  return prisma.eventFormField.findMany({
    where: {
      churchId,
      eventId
    },
    include: fieldInclude,
    orderBy: {
      order: "asc"
    }
  });
}

export async function createEventFormField(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  input: CreateEventFormFieldInput
) {
  await requireEvent(prisma, churchId, eventId);
  await requireTickets(
    prisma,
    churchId,
    eventId,
    input.ticketIds
  );

  const lastField = await prisma.eventFormField.findFirst({
    where: {
      churchId,
      eventId
    },
    orderBy: {
      order: "desc"
    },
    select: {
      order: true
    }
  });

  return prisma.eventFormField.create({
    data: {
      churchId,
      eventId,
      label: input.label,
      type: input.type as EventFormFieldType,
      isRequired: input.isRequired,
      isSensitive: input.isSensitive,
      isActive: input.isActive,
      order: (lastField?.order ?? 0) + 1,
      options: {
        create: buildOptions(input.options)
      },
      ticketScopes: {
        create: input.ticketIds.map((ticketId) => ({
          ticketId
        }))
      }
    },
    include: fieldInclude
  });
}

export async function updateEventFormField(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  fieldId: string,
  input: UpdateEventFormFieldInput
) {
  const field = await prisma.eventFormField.findFirst({
    where: {
      id: fieldId,
      churchId,
      eventId
    },
    select: {
      id: true
    }
  });

  if (!field) {
    throw new Error("EVENT_FORM_FIELD_NOT_FOUND");
  }

  if (input.ticketIds) {
    await requireTickets(
      prisma,
      churchId,
      eventId,
      input.ticketIds
    );
  }

  return prisma.$transaction(async (transaction) => {
    if (input.options) {
      await transaction.eventFormFieldOption.deleteMany({
        where: {
          fieldId
        }
      });
    }

    if (input.ticketIds) {
      await transaction.eventFormFieldTicket.deleteMany({
        where: {
          fieldId
        }
      });
    }

    return transaction.eventFormField.update({
      where: {
        id: fieldId
      },
      data: {
        ...(input.label !== undefined
          ? { label: input.label }
          : {}),
        ...(input.type !== undefined
          ? {
              type: input.type as EventFormFieldType
            }
          : {}),
        ...(input.isRequired !== undefined
          ? { isRequired: input.isRequired }
          : {}),
        ...(input.isSensitive !== undefined
          ? { isSensitive: input.isSensitive }
          : {}),
        ...(input.isActive !== undefined
          ? { isActive: input.isActive }
          : {}),
        ...(input.options
          ? {
              options: {
                create: buildOptions(input.options)
              }
            }
          : {}),
        ...(input.ticketIds
          ? {
              ticketScopes: {
                create: input.ticketIds.map(
                  (ticketId) => ({
                    ticketId
                  })
                )
              }
            }
          : {})
      },
      include: fieldInclude
    });
  });
}

export async function reorderEventFormFields(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  input: ReorderEventFormFieldsInput
) {
  await requireEvent(prisma, churchId, eventId);

  const fields = await prisma.eventFormField.findMany({
    where: {
      churchId,
      eventId,
      id: {
        in: input.fieldIds
      }
    },
    select: {
      id: true
    }
  });

  if (fields.length !== new Set(input.fieldIds).size) {
    throw new Error("EVENT_FORM_FIELD_NOT_FOUND");
  }

  await prisma.$transaction(
    input.fieldIds.map((fieldId, index) =>
      prisma.eventFormField.update({
        where: {
          id: fieldId
        },
        data: {
          order: -(index + 1)
        }
      })
    )
  );

  await prisma.$transaction(
    input.fieldIds.map((fieldId, index) =>
      prisma.eventFormField.update({
        where: {
          id: fieldId
        },
        data: {
          order: index + 1
        }
      })
    )
  );

  return listEventFormFields(
    prisma,
    churchId,
    eventId
  );
}
