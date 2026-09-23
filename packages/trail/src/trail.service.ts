import type { PrismaClient } from "@prisma/client";
import type { CreateTrailInput, CreateTrailStageInput } from "./trail.schema.js";

export async function createTrail(
  prisma: PrismaClient,
  churchId: string,
  input: CreateTrailInput
) {
  return prisma.trail.create({
    data: {
      churchId,
      name: input.name,
      isVolunteerGate: input.isVolunteerGate
    }
  });
}

export async function listTrails(prisma: PrismaClient, churchId: string) {
  return prisma.trail.findMany({
    where: {
      churchId
    },
    include: {
      stages: {
        where: { churchId },
        orderBy: {
          order: "asc"
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });
}

export async function createTrailStage(
  prisma: PrismaClient,
  churchId: string,
  input: CreateTrailStageInput
) {
  const trail = await prisma.trail.findFirst({
    where: {
      id: input.trailId,
      churchId
    },
    select: {
      id: true
    }
  });

  if (!trail) {
    throw new Error("TRAIL_NOT_FOUND");
  }

  if (input.requiresEventId && !await prisma.event.findFirst({
    where: { id: input.requiresEventId, churchId }, select: { id: true }
  })) throw new Error("EVENT_NOT_FOUND");

  return prisma.trailStage.create({
    data: {
      churchId,
      trailId: input.trailId,
      label: input.label,
      order: input.order,
      requiresEventId: input.requiresEventId ?? null
    }
  });
}

export async function listTrailStages(
  prisma: PrismaClient,
  churchId: string,
  trailId: string
) {
  return prisma.trailStage.findMany({
    where: {
      churchId,
      trailId,
      trail: { churchId }
    },
    orderBy: {
      order: "asc"
    }
  });
}
