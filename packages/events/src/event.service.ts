import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  CheckInByTokenInput,
  CreateEventInput,
  DuplicateEventInput,
  CreatePublicRegistrationInput,
  CreateRegistrationInput,
  UpdateEventInput,
  UpdateRegistrationStatusInput
} from "./event.schema.js";
import { sendRegistrationConfirmationEmail } from "./registration-confirmation-email.service.js";

function buildRegistrationStatus(event: { isPaid: boolean }, isWaitlisted: boolean) {
  if (isWaitlisted) {
    return "PENDING" as const;
  }

  return event.isPaid ? ("PENDING" as const) : ("CONFIRMED" as const);
}

function buildPaymentStatus(event: { isPaid: boolean }, isWaitlisted: boolean) {
  if (isWaitlisted) {
    return event.isPaid ? "WAITING_PAYMENT" : "WAITLISTED";
  }

  return event.isPaid ? "PENDING" : "NOT_REQUIRED";
}

function buildConfirmedAt(event: { isPaid: boolean }, isWaitlisted: boolean) {
  if (event.isPaid || isWaitlisted) {
    return null;
  }

  return new Date();
}

function shouldAutoConfirmTestPayment(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return (
    process.env.EVENTS_TEST_PAYMENT_MODE ===
    "auto"
  );
}

function getEventPaymentProvider(): string {
  const testPaymentMode =
    process.env.EVENTS_TEST_PAYMENT_MODE
      ?.trim()
      .toLowerCase();

  if (
    process.env.NODE_ENV !== "production" &&
    (
      testPaymentMode === "auto" ||
      testPaymentMode === "pending"
    )
  ) {
    return "TEST";
  }

  const configuredProvider =
    process.env.EVENTS_PAYMENT_PROVIDER
      ?.trim()
      .toUpperCase();

  return configuredProvider || "ASAAS";
}

async function createEventRegistrationPayment(
  prisma: PrismaClient,
  input: {
    churchId: string;
    campusId: string | null;
    eventId: string;
    registrationId: string;
    personId: string | null;
    amount: Prisma.Decimal | number | string;
  }
) {
  return prisma.$transaction(
    async (transaction) => {
      const order =
        await transaction.eventOrder.create({
          data: {
            churchId: input.churchId,
            eventId: input.eventId,
            status: "PENDING",
            totalAmount: input.amount
          }
        });

      const financialTransaction =
        await transaction.transaction.create({
          data: {
            churchId: input.churchId,
            campusId: input.campusId,
            personId: input.personId,
            eventId: input.eventId,
            type: "EVENT",
            direction: "IN",
            amount: input.amount,
            method: "PIX",
            costCenter: "EVENTOS"
          }
        });

      const payment =
        await transaction.eventPayment.create({
          data: {
            churchId: input.churchId,
            eventId: input.eventId,
            orderId: order.id,
            transactionId:
              financialTransaction.id,
            provider:
              getEventPaymentProvider(),
            status: "PENDING",
            amount: input.amount
          }
        });

      await transaction.registration.update({
        where: {
          id: input.registrationId
        },
        data: {
          orderId: order.id,
          paymentId: payment.id
        }
      });

      return payment.id;
    }
  );
}

export async function createEvent(
  prisma: PrismaClient,
  churchId: string,
  input: CreateEventInput
) {
  return prisma.event.create({
    data: {
      churchId,
      campusId: input.campusId ?? null,
      title: input.title,
      slug: input.slug,
      date: input.date,
      capacity: input.capacity,
      price: input.price,
      isPublic: input.isPublic,
      isPaid: input.isPaid,
      publicRegistrationEnabled: input.isPublic
        ? input.publicRegistrationEnabled
        : false,
      waitlistEnabled: input.waitlistEnabled,
      trailStageId: input.trailStageId ?? null
    }
  });
}

export async function duplicateEvent(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  input: DuplicateEventInput
) {
  return prisma.$transaction(
    async (transaction) => {
      const source =
        await transaction.event.findFirst({
          where: {
            id: eventId,
            churchId
          },
          include: {
            ticketTypes: {
              include: {
                batches: true
              }
            },
            formFields: {
              include: {
                options: true,
                ticketScopes: true
              }
            }
          }
        });

      if (!source) {
        throw new Error("EVENT_NOT_FOUND");
      }

      const duplicated =
        await transaction.event.create({
          data: {
            churchId,
            campusId: source.campusId,
            title: input.title,
            slug: input.slug,
            publicSlug: null,
            date: input.date,
            capacity: source.capacity,
            price: source.price,
            isPublic: false,
            isPaid: source.isPaid,
            publicRegistrationEnabled: false,
            waitlistEnabled:
              source.waitlistEnabled,
            trailStageId:
              source.trailStageId
          }
        });

      const dateShift =
        input.date.getTime() -
        source.date.getTime();

      const ticketIds =
        new Map<string, string>();

      for (
        const ticket
        of source.ticketTypes
      ) {
        const createdTicket =
          await transaction.eventTicket.create({
            data: {
              churchId,
              eventId: duplicated.id,
              name: ticket.name,
              description:
                ticket.description,
              isFree: ticket.isFree,
              isVisible:
                ticket.isVisible
            }
          });

        ticketIds.set(
          ticket.id,
          createdTicket.id
        );

        for (
          const batch
          of ticket.batches
        ) {
          await transaction.ticketBatch.create({
            data: {
              churchId,
              eventId:
                duplicated.id,
              ticketId:
                createdTicket.id,
              name: batch.name,
              quantity:
                batch.quantity,
              price: batch.price,
              salesStart:
                new Date(
                  batch.salesStart.getTime() +
                    dateShift
                ),
              salesEnd:
                new Date(
                  batch.salesEnd.getTime() +
                    dateShift
                ),
              isVisible:
                batch.isVisible
            }
          });
        }
      }

      const orderedFields =
        [...source.formFields].sort(
          (left, right) =>
            left.order - right.order
        );

      for (
        const field
        of orderedFields
      ) {
        const createdField =
          await transaction.eventFormField.create({
            data: {
              churchId,
              eventId:
                duplicated.id,
              label: field.label,
              type: field.type,
              isRequired:
                field.isRequired,
              isSensitive:
                field.isSensitive,
              order: field.order,
              isActive:
                field.isActive
            }
          });

        for (
          const option
          of field.options
        ) {
          await transaction.eventFormFieldOption.create({
            data: {
              fieldId:
                createdField.id,
              label: option.label,
              value: option.value,
              order: option.order
            }
          });
        }

        for (
          const scope
          of field.ticketScopes
        ) {
          const duplicatedTicketId =
            ticketIds.get(
              scope.ticketId
            );

          if (!duplicatedTicketId) {
            throw new Error(
              "EVENT_FORM_TICKET_SCOPE_INVALID"
            );
          }

          await transaction.eventFormFieldTicket.create({
            data: {
              fieldId:
                createdField.id,
              ticketId:
                duplicatedTicketId
            }
          });
        }
      }

      return duplicated;
    }
  );
}

export async function updateEvent(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  input: UpdateEventInput
) {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      churchId
    },
    select: {
      id: true,
      isPublic: true,
      publicRegistrationEnabled: true
    }
  });

  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }

  const data: Prisma.EventUpdateInput = {};

  if (input.title !== undefined) {
    data.title = input.title;
  }

  if (input.slug !== undefined) {
    data.slug = input.slug;
  }

  if (input.date !== undefined) {
    data.date = input.date;
  }

  if (input.capacity !== undefined) {
    data.capacity = input.capacity;
  }

  if (input.price !== undefined) {
    data.price = input.price;
  }

  const resultingIsPublic =
    input.isPublic ?? event.isPublic;
  let resultingRegistration =
    input.publicRegistrationEnabled ??
    event.publicRegistrationEnabled;

  if (resultingIsPublic === false) {
    resultingRegistration = false;
  }

  if (input.isPublic !== undefined) {
    data.isPublic = resultingIsPublic;
  }

  if (input.isPaid !== undefined) {
    data.isPaid = input.isPaid;
  }

  if (
    input.publicRegistrationEnabled !== undefined ||
    resultingRegistration !==
      event.publicRegistrationEnabled
  ) {
    data.publicRegistrationEnabled =
      resultingRegistration;
  }

  if (input.waitlistEnabled !== undefined) {
    data.waitlistEnabled = input.waitlistEnabled;
  }

  return prisma.event.update({
    where: {
      id: event.id
    },
    data
  });
}

export async function listEvents(prisma: PrismaClient, churchId: string) {
  return prisma.event.findMany({
    where: {
      churchId
    },
    include: {
      registrations: {
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          paymentId: true,
          checkInToken: true,
          checkedInAt: true,
          confirmedAt: true,
          waitlistedAt: true,
          registrationSource: true,
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
          }
        }
      },
      trailStage: {
        select: {
          id: true,
          label: true
        }
      }
    },
    orderBy: {
      date: "asc"
    }
  });
}

export async function getEventById(
  prisma: PrismaClient,
  churchId: string,
  eventId: string
) {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      churchId
    },
    include: {
      registrations: {
        include: {
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
            include: {
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
        },
        orderBy: {
          createdAt: "asc"
        }
      },
      church: {
        select: {
          name: true,
          slug: true
        }
      },
      trailStage: {
        select: {
          id: true,
          label: true
        }
      }
    }
  });

  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }

  return event;
}

export async function getPublicEventById(prisma: PrismaClient, eventId: string) {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      isPublic: true
    },
    select: {
      id: true,
      title: true,
      slug: true,
      date: true,
      capacity: true,
      price: true,
      isPaid: true,
      isPublic: true,
      publicRegistrationEnabled: true,
      waitlistEnabled: true,
      registrations: {
        where: {
          status: {
            not: "CANCELLED"
          }
        },
        select: {
          id: true,
          status: true,
          waitlistedAt: true
        }
      },
      ticketTypes: {
        where: {
          isVisible: true
        },
        include: {
          batches: {
            where: {
              isVisible: true
            },
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
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      },
      formFields: {
        where: {
          isActive: true
        },
        include: {
          options: {
            orderBy: {
              order: "asc"
            }
          },
          ticketScopes: {
            select: {
              ticketId: true
            }
          }
        },
        orderBy: {
          order: "asc"
        }
      }
    }
  });

  if (!event) {
    throw new Error("PUBLIC_EVENT_NOT_FOUND");
  }

  return event;
}

export async function createRegistration(
  prisma: PrismaClient,
  churchId: string,
  input: CreateRegistrationInput
) {
  const [event, person, visitor] = await Promise.all([
    prisma.event.findFirst({
      where: {
        id: input.eventId,
        churchId
      },
      include: {
        registrations: {
          where: {
            status: {
              not: "CANCELLED"
            }
          },
          select: {
            id: true,
            waitlistedAt: true
          }
        }
      }
    }),
    input.personId
      ? prisma.person.findFirst({
          where: {
            id: input.personId,
            churchId
          },
          select: {
            id: true
          }
        })
      : Promise.resolve(null),
    input.visitorId
      ? prisma.visitor.findFirst({
          where: {
            id: input.visitorId,
            churchId
          },
          select: {
            id: true
          }
        })
      : Promise.resolve(null)
  ]);

  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }

  if (input.personId && !person) {
    throw new Error("PERSON_NOT_FOUND");
  }

  if (input.visitorId && !visitor) {
    throw new Error("VISITOR_NOT_FOUND");
  }

  const activeRegistrations = event.registrations.filter(
    (registration) => !registration.waitlistedAt
  );
  const isWaitlisted = activeRegistrations.length >= event.capacity;

  if (isWaitlisted && !event.waitlistEnabled) {
    throw new Error("EVENT_CAPACITY_REACHED");
  }

  const registration = await prisma.registration.create({
    data: {
      churchId,
      eventId: input.eventId,
      personId: input.personId ?? null,
      visitorId: input.visitorId ?? null,
      status: buildRegistrationStatus(event, isWaitlisted),
      paymentStatus: buildPaymentStatus(event, isWaitlisted),
      paymentId: input.paymentId ?? null,
      confirmedAt: buildConfirmedAt(event, isWaitlisted),
      waitlistedAt: isWaitlisted ? new Date() : null,
      registrationSource: "ADMIN"
    }
  });

  if (!event.isPaid || isWaitlisted || input.paymentId) {
    return registration;
  }

  const paymentId =
    await createEventRegistrationPayment(
      prisma,
      {
        churchId,
        campusId: event.campusId,
        eventId: event.id,
        registrationId: registration.id,
        personId: input.personId ?? null,
        amount: event.price
      }
    );

  if (shouldAutoConfirmTestPayment()) {
    await applyRegistrationPaymentStatus(
      prisma,
      churchId,
      {
        registrationId: registration.id,
        paymentId,
        paymentStatus: "PAID"
      }
    );
  }

  return prisma.registration.update({
    where: {
      id: registration.id
    },
    data: {
      paymentId
    }
  });
}

export async function createPublicRegistration(
  prisma: PrismaClient,
  eventId: string,
  input: CreatePublicRegistrationInput
) {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      isPublic: true,
      publicRegistrationEnabled: true
    },
    include: {
      registrations: {
        where: {
          status: {
            not: "CANCELLED"
          }
        },
        select: {
          id: true,
          waitlistedAt: true
        }
      },
      ticketTypes: {
        where: {
          id: input.ticketId,
          isVisible: true
        },
        include: {
          batches: {
            where: {
              id: input.ticketBatchId,
              isVisible: true
            },
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
            }
          }
        }
      },
      formFields: {
        where: {
          isActive: true,
          OR: [
            {
              ticketScopes: {
                none: {}
              }
            },
            {
              ticketScopes: {
                some: {
                  ticketId: input.ticketId
                }
              }
            }
          ]
        },
        include: {
          options: {
            orderBy: {
              order: "asc"
            }
          }
        },
        orderBy: {
          order: "asc"
        }
      }
    }
  });

  if (!event) {
    throw new Error("PUBLIC_EVENT_NOT_FOUND");
  }

  const ticket = event.ticketTypes[0];

  if (!ticket) {
    throw new Error("EVENT_TICKET_NOT_FOUND");
  }

  const batch = ticket.batches[0];

  if (!batch) {
    throw new Error("TICKET_BATCH_NOT_FOUND");
  }

  const now = new Date();

  if (
    batch.salesStart > now ||
    batch.salesEnd < now
  ) {
    throw new Error("TICKET_BATCH_NOT_AVAILABLE");
  }

  if (
    batch._count.registrations >=
    batch.quantity
  ) {
    throw new Error("TICKET_BATCH_SOLD_OUT");
  }

  const applicableFields = new Map(
    event.formFields.map((field) => [
      field.id,
      field
    ])
  );

  const receivedAnswers = new Map(
    input.answers.map((answer) => [
      answer.fieldId,
      answer.value
    ])
  );

  for (const answer of input.answers) {
    if (!applicableFields.has(answer.fieldId)) {
      throw new Error("INVALID_FORM_ANSWER");
    }
  }

  for (const field of event.formFields) {
    const value = receivedAnswers.get(field.id);

    const isEmpty =
      value === undefined ||
      value === "" ||
      (
        Array.isArray(value) &&
        value.length === 0
      );

    if (field.isRequired && isEmpty) {
      throw new Error(
        "REQUIRED_FORM_ANSWER_MISSING"
      );
    }

    if (isEmpty) {
      continue;
    }

    if (
      field.type === "MULTIPLE_CHOICE" &&
      !Array.isArray(value)
    ) {
      throw new Error("INVALID_FORM_ANSWER");
    }

    if (
      field.type !== "MULTIPLE_CHOICE" &&
      Array.isArray(value)
    ) {
      throw new Error("INVALID_FORM_ANSWER");
    }

    if (
      field.type === "TEXT" ||
      field.type === "PARAGRAPH"
    ) {
      if (
        typeof value !== "string" ||
        !value.trim()
      ) {
        throw new Error("INVALID_FORM_ANSWER");
      }

      continue;
    }

    const allowedValues = new Set(
      field.options.map((option) => option.value)
    );

    const selectedValues = Array.isArray(value)
      ? value
      : [value];

    if (
      selectedValues.some(
        (selectedValue) =>
          !allowedValues.has(selectedValue)
      )
    ) {
      throw new Error("INVALID_FORM_ANSWER");
    }
  }

  const activeRegistrations =
    event.registrations.filter(
      (registration) =>
        !registration.waitlistedAt
    );

  const isWaitlisted =
    activeRegistrations.length >= event.capacity;

  if (isWaitlisted && !event.waitlistEnabled) {
    throw new Error("EVENT_CAPACITY_REACHED");
  }

  const isPaid = Number(batch.price) > 0;

  const registration =
    await prisma.$transaction(
      async (transaction) => {
        const freshBatch =
          await transaction.ticketBatch.findFirst({
            where: {
              id: batch.id,
              churchId: event.churchId,
              eventId: event.id,
              ticketId: ticket.id,
              isVisible: true
            },
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
            }
          });

        if (!freshBatch) {
          throw new Error(
            "TICKET_BATCH_NOT_FOUND"
          );
        }

        if (
          freshBatch._count.registrations >=
          freshBatch.quantity
        ) {
          throw new Error("TICKET_BATCH_SOLD_OUT");
        }

        const visitor =
          await transaction.visitor.create({
            data: {
              churchId: event.churchId,
              campusId: event.campusId,
              name: input.name,
              phone: input.phone,
              email: input.email ?? null,
              firstVisitAt: new Date(),
              notes:
                `Inscrição pública no evento: ${event.title}`
            }
          });

        return transaction.registration.create({
          data: {
            churchId: event.churchId,
            eventId: event.id,
            ticketId: ticket.id,
            ticketBatchId: freshBatch.id,
            visitorId: visitor.id,
            status: isWaitlisted
              ? "PENDING"
              : isPaid
                ? "PENDING"
                : "CONFIRMED",
            paymentStatus: isWaitlisted
              ? isPaid
                ? "WAITING_PAYMENT"
                : "WAITLISTED"
              : isPaid
                ? "PENDING"
                : "NOT_REQUIRED",
            confirmedAt:
              !isPaid && !isWaitlisted
                ? new Date()
                : null,
            waitlistedAt:
              isWaitlisted ? new Date() : null,
            registrationSource: "PUBLIC",
            formAnswers: {
              create: input.answers
                .filter((answer) =>
                  applicableFields.has(
                    answer.fieldId
                  )
                )
                .map((answer) => ({
                  churchId: event.churchId,
                  eventId: event.id,
                  fieldId: answer.fieldId,
                  value: answer.value
                }))
            }
          },
          include: {
            visitor: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true
              }
            },
            event: {
              select: {
                id: true,
                title: true,
                slug: true,
                publicSlug: true,
                date: true,
                price: true,
                isPaid: true,
                church: {
                  select: {
                    slug: true
                  }
                }
              }
            }
          }
        });
      }
    );

  if (!isPaid || isWaitlisted) {
    return registration;
  }

  const paymentId =
    await createEventRegistrationPayment(
      prisma,
      {
        churchId: event.churchId,
        campusId: event.campusId,
        eventId: event.id,
        registrationId: registration.id,
        personId: null,
        amount: batch.price
      }
    );

  if (shouldAutoConfirmTestPayment()) {
    await applyRegistrationPaymentStatus(
      prisma,
      event.churchId,
      {
        registrationId: registration.id,
        paymentId,
        paymentStatus: "PAID"
      }
    );
  }

  return prisma.registration.update({
    where: {
      id: registration.id
    },
    data: {
      paymentId
    },
    include: {
      visitor: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true
        }
      },
      event: {
        select: {
          id: true,
          title: true,
          slug: true,
          publicSlug: true,
          date: true,
          price: true,
          isPaid: true,
          church: {
            select: {
              slug: true
            }
          }
        }
      }
    }
  });
}

export async function updateRegistrationStatus(
  prisma: PrismaClient,
  churchId: string,
  input: UpdateRegistrationStatusInput
) {
  const registration =
    await prisma.registration.findFirst({
      where: {
        id: input.registrationId,
        churchId
      },
      select: {
        id: true,
        paymentId: true,
        paymentStatus: true,
        person: {
          select: {
            name: true,
            email: true
          }
        },
        visitor: {
          select: {
            name: true,
            email: true
          }
        },
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            publicSlug: true,
            date: true,
            isPaid: true,
            church: {
              select: {
                slug: true
              }
            }
          }
        }
      }
    });

  if (!registration) {
    throw new Error("REGISTRATION_NOT_FOUND");
  }

  if (
    input.status === "CHECKED_IN" &&
    registration.event.isPaid &&
    registration.paymentStatus !== "PAID"
  ) {
    throw new Error("PAYMENT_NOT_CONFIRMED");
  }

  const paymentId =
    input.paymentId ??
    registration.paymentId;

  const registrationUpdateData =
    input.status === "CHECKED_IN"
      ? {
          status: input.status,
          paymentId,
          paymentStatus: registration.paymentStatus,
          checkedInAt: new Date()
        }
      : input.status === "CONFIRMED"
        ? {
            status: input.status,
            paymentId,
            paymentStatus: registration.paymentStatus,
            confirmedAt: new Date()
          }
        : {
            status: input.status,
            paymentId,
            paymentStatus:
              input.status === "CANCELLED"
                ? "CANCELLED"
                : registration.paymentStatus
          };

  const updatedRegistration =
    await prisma.registration.update({
      where: {
        id: registration.id
      },
      data: registrationUpdateData,
      include: {
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
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            publicSlug: true,
            date: true,
            price: true,
            isPaid: true,
            church: {
              select: {
                slug: true
              }
            }
          }
        }
      }
    });

  const participant =
    updatedRegistration.person ??
    updatedRegistration.visitor;

  const shouldSendEmail =
    input.status === "CONFIRMED" &&
    updatedRegistration.event.isPaid &&
    updatedRegistration.paymentStatus === "PAID" &&
    Boolean(participant?.email);

  const emailSent =
    shouldSendEmail && participant?.email
      ? await sendRegistrationConfirmationEmail({
          registrationId:
            updatedRegistration.id,
          recipientEmail:
            participant.email,
          participantName:
            participant.name,
          checkInToken:
            updatedRegistration.checkInToken,
          registrationStatus:
            updatedRegistration.status,
          paymentStatus:
            updatedRegistration.paymentStatus,
          waitlistedAt:
            updatedRegistration.waitlistedAt,
          event: {
            title:
              updatedRegistration.event.title,
            date:
              updatedRegistration.event.date,
            isPaid:
              updatedRegistration.event.isPaid,
            slug:
              updatedRegistration.event.slug,
            publicSlug:
              updatedRegistration.event.publicSlug,
            churchSlug:
              updatedRegistration.event.church.slug
          }
        })
      : false;

  return {
    ...updatedRegistration,
    emailSent
  };
}

export type EventRegistrationPaymentCheckout = {
  registrationId: string;
  churchId: string;
  eventId: string;
  paymentId: string;
  transactionId: string;
  provider: string;
  providerPaymentId: string | null;
  amount: number;
  eventTitle: string;
  customer: {
    name: string;
    email?: string;
    mobilePhone?: string;
  };
};

export async function getEventRegistrationPaymentCheckout(
  prisma: PrismaClient,
  registrationId: string
): Promise<EventRegistrationPaymentCheckout | null> {
  const registration =
    await prisma.registration.findUnique({
      where: {
        id: registrationId
      },
      select: {
        id: true,
        churchId: true,
        eventId: true,
        paymentId: true,
        paymentStatus: true,
        waitlistedAt: true,
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
        event: {
          select: {
            title: true,
            isPaid: true
          }
        }
      }
    });

  if (
    !registration ||
    !registration.event.isPaid ||
    registration.waitlistedAt ||
    registration.paymentStatus !== "PENDING" ||
    !registration.paymentId
  ) {
    return null;
  }

  const payment =
    await prisma.eventPayment.findFirst({
      where: {
        id: registration.paymentId,
        churchId: registration.churchId,
        eventId: registration.eventId
      },
      select: {
        id: true,
        transactionId: true,
        provider: true,
        providerPaymentId: true,
        status: true,
        amount: true
      }
    });

  if (
    !payment ||
    payment.status !== "PENDING"
  ) {
    return null;
  }

  const participant =
    registration.person ??
    registration.visitor;

  if (!participant) {
    throw new Error(
      "REGISTRATION_PARTICIPANT_NOT_FOUND"
    );
  }

  return {
    registrationId: registration.id,
    churchId: registration.churchId,
    eventId: registration.eventId,
    paymentId: payment.id,
    transactionId: payment.transactionId,
    provider: payment.provider,
    providerPaymentId:
      payment.providerPaymentId,
    amount: Number(payment.amount),
    eventTitle: registration.event.title,
    customer: {
      name: participant.name,
      ...(participant.email
        ? { email: participant.email }
        : {}),
      ...(participant.phone
        ? { mobilePhone: participant.phone }
        : {})
    }
  };
}

export async function attachEventPaymentProviderId(
  prisma: PrismaClient,
  churchId: string,
  eventPaymentId: string,
  providerPaymentId: string
): Promise<boolean> {
  const payment =
    await prisma.eventPayment.findFirst({
      where: {
        id: eventPaymentId,
        churchId
      },
      select: {
        id: true,
        providerPaymentId: true
      }
    });

  if (!payment) {
    return false;
  }

  if (
    payment.providerPaymentId ===
    providerPaymentId
  ) {
    return true;
  }

  if (payment.providerPaymentId) {
    throw new Error(
      "EVENT_PAYMENT_PROVIDER_ID_CONFLICT"
    );
  }

  await prisma.eventPayment.update({
    where: {
      id: payment.id
    },
    data: {
      providerPaymentId
    }
  });

  return true;
}

export async function resetPendingEventPaymentProviderReference(
  prisma: PrismaClient,
  churchId: string,
  eventPaymentId: string,
  providerPaymentId: string
): Promise<boolean> {
  const payment =
    await prisma.eventPayment.findFirst({
      where: {
        id: eventPaymentId,
        churchId
      },
      select: {
        id: true,
        status: true,
        transactionId: true,
        providerPaymentId: true,
        transaction: {
          select: {
            asaasId: true
          }
        }
      }
    });

  if (!payment) {
    return false;
  }

  if (
    payment.status !== "PENDING"
  ) {
    throw new Error(
      "EVENT_PAYMENT_NOT_PENDING"
    );
  }

  if (
    payment.providerPaymentId !==
      providerPaymentId
  ) {
    throw new Error(
      "EVENT_PAYMENT_PROVIDER_ID_CONFLICT"
    );
  }

  if (
    payment.transaction.asaasId &&
    payment.transaction.asaasId !==
      providerPaymentId
  ) {
    throw new Error(
      "TRANSACTION_PROVIDER_ID_CONFLICT"
    );
  }

  await prisma.$transaction([
    prisma.eventPayment.update({
      where: {
        id: payment.id
      },
      data: {
        providerPaymentId: null
      }
    }),
    prisma.transaction.update({
      where: {
        id: payment.transactionId
      },
      data: {
        asaasId: null
      }
    })
  ]);

  return true;
}

function shouldIgnorePaymentStatusRegression(
  currentStatus: string,
  incomingStatus: string
): boolean {
  if (
    currentStatus === "CANCELLED" &&
    incomingStatus !== "CANCELLED"
  ) {
    return true;
  }

  if (
    currentStatus === "PAID" &&
    (
      incomingStatus === "PENDING" ||
      incomingStatus === "OVERDUE"
    )
  ) {
    return true;
  }

  if (
    currentStatus === "REFUND_PENDING" &&
    incomingStatus !== "REFUND_PENDING" &&
    incomingStatus !== "CANCELLED"
  ) {
    return true;
  }

  return false;
}

export async function applyEventPaymentProviderStatus(
  prisma: PrismaClient,
  churchId: string,
  input: {
    eventPaymentId: string;
    providerPaymentId: string;
    paymentStatus: RegistrationPaymentStatus;
  }
): Promise<boolean> {
  const payment =
    await prisma.eventPayment.findFirst({
      where: {
        id: input.eventPaymentId,
        churchId
      },
      select: {
        id: true,
        orderId: true,
        status: true,
        providerPaymentId: true,
        order: {
          select: {
            registrations: {
              select: {
                id: true,
                status: true,
                waitlistedAt: true
              }
            }
          }
        }
      }
    });

  if (!payment) {
    return false;
  }

  if (
    payment.providerPaymentId &&
    payment.providerPaymentId !==
      input.providerPaymentId
  ) {
    return false;
  }

  if (
    payment.providerPaymentId ===
      input.providerPaymentId &&
    payment.status === input.paymentStatus
  ) {
    return true;
  }

  if (
    shouldIgnorePaymentStatusRegression(
      payment.status,
      input.paymentStatus
    )
  ) {
    return true;
  }

  await prisma.$transaction([
    prisma.eventPayment.update({
      where: {
        id: payment.id
      },
      data: {
        providerPaymentId:
          input.providerPaymentId,
        status: input.paymentStatus
      }
    }),
    prisma.eventOrder.update({
      where: {
        id: payment.orderId
      },
      data: {
        status: input.paymentStatus
      }
    }),
    prisma.registration.updateMany({
      where: {
        churchId,
        orderId: payment.orderId
      },
      data: {
        paymentId: payment.id,
        paymentStatus:
          input.paymentStatus
      }
    })
  ]);

  if (input.paymentStatus === "PAID") {
    for (
      const registration
      of payment.order.registrations
    ) {
      if (
        registration.waitlistedAt ||
        registration.status === "CANCELLED" ||
        registration.status === "CHECKED_IN"
      ) {
        continue;
      }

      await updateRegistrationStatus(
        prisma,
        churchId,
        {
          registrationId:
            registration.id,
          status: "CONFIRMED",
          paymentId: payment.id
        }
      );
    }
  }

  return true;
}

type RegistrationPaymentStatus =
  | "PENDING"
  | "PAID"
  | "CANCELLED"
  | "OVERDUE"
  | "REFUND_PENDING";

type ApplyRegistrationPaymentStatusInput = {
  registrationId: string;
  paymentId: string;
  paymentStatus: RegistrationPaymentStatus;
};

export async function applyRegistrationPaymentStatus(
  prisma: PrismaClient,
  churchId: string,
  input: ApplyRegistrationPaymentStatusInput
): Promise<boolean> {
  const registration =
    await prisma.registration.findFirst({
      where: {
        id: input.registrationId,
        churchId
      },
      select: {
        id: true,
        orderId: true,
        status: true,
        paymentId: true,
        paymentStatus: true,
        waitlistedAt: true,
        event: {
          select: {
            id: true,
            isPaid: true
          }
        }
      }
    });

  if (
    !registration ||
    !registration.event.isPaid
  ) {
    return false;
  }

  const eventPayment =
    registration.orderId
      ? await prisma.eventPayment.findFirst({
          where: {
            churchId,
            orderId: registration.orderId,
            eventId: registration.event.id
          },
          select: {
            id: true,
            orderId: true,
            providerPaymentId: true,
            status: true
          }
        })
      : null;

  const matchesStructuredPayment =
    Boolean(eventPayment) &&
    (
      eventPayment?.id === input.paymentId ||
      eventPayment?.providerPaymentId ===
        input.paymentId
    );

  if (
    registration.paymentStatus ===
      input.paymentStatus &&
    (
      eventPayment
        ? eventPayment.status ===
            input.paymentStatus &&
          matchesStructuredPayment
        : registration.paymentId ===
          input.paymentId
    )
  ) {
    return true;
  }

  if (
    shouldIgnorePaymentStatusRegression(
      eventPayment?.status ??
        registration.paymentStatus,
      input.paymentStatus
    )
  ) {
    return true;
  }

  if (eventPayment) {
    const providerPaymentData =
      eventPayment.id === input.paymentId
        ? {}
        : {
            providerPaymentId:
              input.paymentId
          };

    await prisma.$transaction([
      prisma.eventPayment.update({
        where: {
          id: eventPayment.id
        },
        data: {
          status: input.paymentStatus,
          ...providerPaymentData
        }
      }),
      prisma.eventOrder.update({
        where: {
          id: eventPayment.orderId
        },
        data: {
          status: input.paymentStatus
        }
      }),
      prisma.registration.update({
        where: {
          id: registration.id
        },
        data: {
          paymentId: eventPayment.id,
          paymentStatus:
            input.paymentStatus
        }
      })
    ]);
  } else {
    /*
      Compatibilidade temporária com inscrições
      criadas antes de EventOrder/EventPayment.
    */
    await prisma.registration.update({
      where: {
        id: registration.id
      },
      data: {
        paymentId: input.paymentId,
        paymentStatus:
          input.paymentStatus
      }
    });
  }

  if (
    input.paymentStatus === "PAID" &&
    !registration.waitlistedAt &&
    registration.status !== "CANCELLED" &&
    registration.status !== "CHECKED_IN"
  ) {
    await updateRegistrationStatus(
      prisma,
      churchId,
      {
        registrationId:
          registration.id,
        status: "CONFIRMED",
        paymentId:
          eventPayment?.id ??
          input.paymentId
      }
    );
  }

  return true;
}

export async function checkInRegistrationByToken(
  prisma: PrismaClient,
  churchId: string,
  input: CheckInByTokenInput
) {
  const registration =
    await prisma.registration.findFirst({
      where: {
        checkInToken: input.checkInToken,
        churchId,
        eventId: input.eventId
      },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        waitlistedAt: true,
        event: {
          select: {
            isPaid: true
          }
        }
      }
    });

  if (!registration) {
    throw new Error("REGISTRATION_NOT_FOUND");
  }

  if (registration.status === "CANCELLED") {
    throw new Error("REGISTRATION_CANCELLED");
  }

  if (registration.status === "CHECKED_IN") {
    throw new Error(
      "REGISTRATION_ALREADY_CHECKED_IN"
    );
  }

  if (registration.waitlistedAt) {
    throw new Error("REGISTRATION_WAITLISTED");
  }

  if (
    registration.event.isPaid &&
    registration.paymentStatus !== "PAID"
  ) {
    throw new Error("PAYMENT_NOT_CONFIRMED");
  }

  return prisma.registration.update({
    where: {
      id: registration.id
    },
    data: {
      checkedInAt: new Date(),
      status: "CHECKED_IN"
    },
    include: {
      event: {
        select: {
          id: true,
          title: true
        }
      },
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
      }
    }
  });
}
