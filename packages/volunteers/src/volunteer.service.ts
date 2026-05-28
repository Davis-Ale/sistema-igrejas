import type { PrismaClient } from "@prisma/client";
import type { UpdateVolunteerStatusInput } from "./volunteer.schema.js";

export async function listVolunteers(prisma: PrismaClient, churchId: string) {
  return prisma.person.findMany({
    where: {
      churchId,
      role: "VOLUNTEER"
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      role: true,
      volunteerStatus: true,
      celula: {
        select: {
          id: true,
          name: true,
          region: true
        }
      },
      trailStage: {
        select: {
          id: true,
          label: true,
          trail: {
            select: {
              id: true,
              name: true,
              isVolunteerGate: true
            }
          }
        }
      }
    },
    orderBy: {
      name: "asc"
    }
  });
}

export async function listVolunteerLogs(
  prisma: PrismaClient,
  churchId: string,
  personId: string
) {
  return prisma.volunteerLog.findMany({
    where: {
      churchId,
      personId
    },
    include: {
      changer: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: {
      at: "desc"
    }
  });
}

export async function updateVolunteerStatus(
  prisma: PrismaClient,
  churchId: string,
  changedBy: string,
  input: UpdateVolunteerStatusInput
) {
  const [person, changer] = await Promise.all([
    prisma.person.findFirst({
      where: {
        id: input.personId,
        churchId
      },
      select: {
        id: true
      }
    }),
    prisma.person.findFirst({
      where: {
        id: changedBy,
        churchId
      },
      select: {
        id: true
      }
    })
  ]);

  if (!person) {
    throw new Error("PERSON_NOT_FOUND");
  }

  if (!changer) {
    throw new Error("CHANGER_NOT_FOUND");
  }

  const personUpdateData =
    input.status === "ACTIVE"
      ? {
          role: "VOLUNTEER" as const,
          volunteerStatus: input.status
        }
      : {
          volunteerStatus: input.status
        };

  return prisma.$transaction(async (tx) => {
    const updatedPerson = await tx.person.update({
      where: {
        id: input.personId
      },
      data: personUpdateData,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        volunteerStatus: true
      }
    });

    const log = await tx.volunteerLog.create({
      data: {
        churchId,
        personId: input.personId,
        status: input.status,
        changedBy,
        reason: input.reason ?? null
      }
    });

    return {
      person: updatedPerson,
      log
    };
  });
}
