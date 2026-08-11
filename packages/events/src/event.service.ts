import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  CheckInByTokenInput,
  CreateEventInput,
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

async function createEventRegistrationTransaction(
  prisma: PrismaClient,
  input: {
    churchId: string;
    campusId: string | null;
    eventId: string;
    personId: string | null;
    amount: Prisma.Decimal | number | string;
  }
) {
  const transaction = await prisma.transaction.create({
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

  return transaction.id;
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
      publicRegistrationEnabled: input.publicRegistrationEnabled,
      waitlistEnabled: input.waitlistEnabled,
      trailStageId: input.trailStageId ?? null
    }
  });
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
      id: true
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

  if (input.isPublic !== undefined) {
    data.isPublic = input.isPublic;
  }

  if (input.isPaid !== undefined) {
    data.isPaid = input.isPaid;
  }

  if (input.publicRegistrationEnabled !== undefined) {
    data.publicRegistrationEnabled =
      input.publicRegistrationEnabled;
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
      isPublic: true,
      publicRegistrationEnabled: true
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
                  registrations: true
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

  const paymentId = await createEventRegistrationTransaction(prisma, {
    churchId,
    campusId: event.campusId,
    eventId: event.id,
    personId: input.personId ?? null,
    amount: event.price
  });

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
                  registrations: true
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
    await createEventRegistrationTransaction(
      prisma,
      {
        churchId: event.churchId,
        campusId: event.campusId,
        eventId: event.id,
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

type RegistrationPaymentStatus =
  | "PENDING"
  | "PAID"
  | "CANCELLED"
  | "OVERDUE";

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
        status: true,
        paymentId: true,
        paymentStatus: true,
        waitlistedAt: true,
        event: {
          select: {
            isPaid: true
          }
        }
      }
    });

  /*
    A referência pode pertencer a outra cobrança financeira
    que não seja inscrição de evento.
  */
  if (
    !registration ||
    !registration.event.isPaid
  ) {
    return false;
  }

  /*
    Webhooks podem ser reenviados.
    Se o mesmo estado do mesmo pagamento já foi processado,
    não executamos novamente confirmação/e-mail.
  */
  if (
    registration.paymentId === input.paymentId &&
    registration.paymentStatus === input.paymentStatus
  ) {
    return true;
  }

  await prisma.registration.update({
    where: {
      id: registration.id
    },
    data: {
      paymentId: input.paymentId,
      paymentStatus: input.paymentStatus
    }
  });

  /*
    Apenas pagamento realmente confirmado pelo provedor
    pode confirmar a inscrição.
  */
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
        registrationId: registration.id,
        status: "CONFIRMED",
        paymentId: input.paymentId
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
