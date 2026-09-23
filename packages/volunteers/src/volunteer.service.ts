import { Prisma, type PrismaClient } from "@prisma/client";
import type { UpdateVolunteerStatusInput } from "./volunteer.schema.js";

export async function listVolunteers(prisma: PrismaClient, churchId: string) {
  return prisma.person.findMany({
    where: {
      churchId,
      role: { in: ["MEMBER", "VOLUNTEER", "LEADER", "PASTOR", "SUPER_ADMIN"] },
      OR: [{ role: "VOLUNTEER" }, { volunteerStatus: { in: ["ELIGIBLE", "ACTIVE", "SUSPENDED"] } }],
      AND: [
        { OR: [{ celulaId: null }, { celula: { churchId, leader: { churchId } } }] },
        { OR: [{ trailStageId: null }, { trailStage: {
          churchId, trail: { churchId },
          OR: [{ requiresEventId: null }, { requiresEvent: { churchId } }]
        } }] }
      ]
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
      personId,
      person: { churchId },
      changer: { churchId }
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
  return prisma.$transaction(async (tx) => {
    const [person, changer] = await Promise.all([
      tx.person.findFirst({
        where: {
          id: input.personId,
          churchId
        },
        select: {
          id: true,
          role: true,
          userAccount: { select: { churchId: true } }
        }
      }),
      tx.person.findFirst({
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

    if (person.role === "VISITOR") throw new Error("INVALID_VOLUNTEER_ROLE");
    if (person.userAccount && person.userAccount.churchId !== churchId) throw new Error("PERSON_RELATION_CONFLICT");

    const personUpdateData =
      input.status === "ACTIVE" && person.role === "MEMBER"
        ? {
            role: "VOLUNTEER" as const,
            volunteerStatus: input.status
          }
        : {
            volunteerStatus: input.status
          };

    const updatedPerson = await tx.person.update({
      where: {
        id: input.personId,
        churchId
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
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
