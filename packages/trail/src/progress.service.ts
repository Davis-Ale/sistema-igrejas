import type { PrismaClient } from "@prisma/client";
import type { CompleteTrailStageInput } from "./trail.schema.js";

export async function listPersonTrailProgress(
  prisma: PrismaClient,
  churchId: string,
  personId: string
) {
  return prisma.trailProgress.findMany({
    where: {
      churchId,
      personId
    },
    include: {
      stage: {
        include: {
          trail: true
        }
      },
      approver: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });
}

export async function completeTrailStage(
  prisma: PrismaClient,
  churchId: string,
  approvedBy: string,
  input: CompleteTrailStageInput
) {
  const stage = await prisma.trailStage.findFirst({
    where: {
      id: input.stageId,
      churchId
    },
    include: {
      trail: {
        select: {
          id: true,
          isVolunteerGate: true
        }
      }
    }
  });

  if (!stage) {
    throw new Error("TRAIL_STAGE_NOT_FOUND");
  }

  const person = await prisma.person.findFirst({
    where: {
      id: input.personId,
      churchId
    },
    select: {
      id: true
    }
  });

  if (!person) {
    throw new Error("PERSON_NOT_FOUND");
  }

  return prisma.$transaction(async (tx) => {
    const progress = await tx.trailProgress.upsert({
      where: {
        personId_stageId: {
          personId: input.personId,
          stageId: input.stageId
        }
      },
      create: {
        churchId,
        personId: input.personId,
        stageId: input.stageId,
        completedAt: new Date(),
        approvedBy
      },
      update: {
        completedAt: new Date(),
        approvedBy
      }
    });

    const personUpdateData = stage.trail.isVolunteerGate
      ? {
          trailStageId: input.stageId,
          volunteerStatus: "ELIGIBLE" as const
        }
      : {
          trailStageId: input.stageId
        };

    await tx.person.update({
      where: {
        id: input.personId
      },
      data: personUpdateData
    });

    return progress;
  });
}
