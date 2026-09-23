import type { PrismaClient } from "@prisma/client";

export async function ensureCampusBelongsToChurch(
  prisma: Pick<PrismaClient, "campus">,
  churchId: string,
  campusId?: string | null
): Promise<void> {
  if (!campusId) return;
  const campus = await prisma.campus.findFirst({
    where: { id: campusId, churchId }, select: { id: true }
  });
  if (!campus) throw new Error("CAMPUS_NOT_FOUND");
}

// Audit relations point to Person, while authenticated user IDs point to UserAccount.
export async function resolveTenantActorPersonId(
  prisma: Pick<PrismaClient, "userAccount">,
  churchId: string,
  userId: string
): Promise<string> {
  const account = await prisma.userAccount.findFirst({
    where: { id: userId, churchId, person: { is: { churchId } } },
    select: { personId: true }
  });
  if (!account?.personId) throw new Error("ACTOR_NOT_FOUND");
  return account.personId;
}
