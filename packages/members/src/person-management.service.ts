import { Prisma, type PrismaClient } from "@prisma/client";
import { ensureCampusBelongsToChurch } from "@sistema-igrejas/database";
import type { UpdateMemberInput } from "./member.schema.js";

type ManagedRole = "MEMBER" | "VISITOR";
type Store = Prisma.TransactionClient;

export const managedPersonSelect = {
  id: true, name: true, phone: true, email: true, role: true,
  volunteerStatus: true, campusId: true, createdAt: true, updatedAt: true
} as const;

async function requireManagedPerson(db: Store, churchId: string, id: string, role: ManagedRole) {
  const person = await db.person.findFirst({
    where: { id, churchId, role },
    select: {
      ...managedPersonSelect,
      campus: { select: { churchId: true } },
      userAccount: { select: { id: true, churchId: true, role: true } }
    }
  });
  if (!person) throw new Error("PERSON_NOT_FOUND");
  if ((person.campus && person.campus.churchId !== churchId) ||
      (person.userAccount && person.userAccount.churchId !== churchId)) {
    throw new Error("PERSON_RELATION_CONFLICT");
  }
  return person;
}

export async function getManagedPerson(db: PrismaClient, churchId: string, id: string, role: ManagedRole) {
  const { campus, userAccount, ...person } = await requireManagedPerson(db, churchId, id, role);
  return person;
}

export async function updateManagedPerson(db: PrismaClient, churchId: string, id: string, role: ManagedRole, input: UpdateMemberInput) {
  return db.$transaction(async tx => {
    await requireManagedPerson(tx, churchId, id, role);
    await ensureCampusBelongsToChurch(tx, churchId, input.campusId);
    return tx.person.update({ where: { id, churchId, role }, data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.campusId !== undefined ? { campusId: input.campusId } : {})
    }, select: managedPersonSelect });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function deleteManagedPerson(db: PrismaClient, churchId: string, id: string, role: ManagedRole) {
  return db.$transaction(async tx => {
    const person = await requireManagedPerson(tx, churchId, id, role);
    // Never orphan a login or erase history through Person's cascading relations.
    if (person.userAccount) throw new Error("PERSON_HAS_LINKS");
    const linked = await tx.person.findFirst({
      where: { id, churchId, role },
      select: { celulaId: true, trailStageId: true, _count: { select: {
        ledCampuses: true, ledCelulas: true, trailProgress: true, approvedProgress: true,
        memberships: true, approvedMembership: true, volunteerLogs: true,
        changedLogs: true, registrations: true, transactions: true
      } } }
    });
    if (!linked) throw new Error("PERSON_NOT_FOUND");
    if (linked.celulaId || linked.trailStageId || Object.values(linked._count).some(count => count > 0)) {
      throw new Error("PERSON_HAS_LINKS");
    }
    await tx.person.delete({ where: { id, churchId, role } });
    return { id, deleted: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function convertVisitorToMember(db: PrismaClient, churchId: string, id: string) {
  return db.$transaction(async tx => {
    const person = await requireManagedPerson(tx, churchId, id, "VISITOR");
    // Conversion changes the existing person, preserving all historical links.
    // Only migrate a visitor account; preserve any other account permissions and status.
    if (person.userAccount?.role === "VISITOR") {
      await tx.userAccount.update({
        where: { id: person.userAccount.id, churchId, personId: id, role: "VISITOR" },
        data: { role: "MEMBER" }
      });
    }
    return tx.person.update({ where: { id, churchId, role: "VISITOR" }, data: { role: "MEMBER" }, select: managedPersonSelect });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function linkMemberAccount(db: PrismaClient, churchId: string, id: string, accountId: string) {
  return db.$transaction(async tx => {
    const person = await requireManagedPerson(tx, churchId, id, "MEMBER");
    const account = await tx.userAccount.findFirst({
      where: { id: accountId, churchId },
      select: { id: true, personId: true, role: true }
    });
    if (!account) throw new Error("ACCOUNT_NOT_FOUND");
    if ((person.userAccount && person.userAccount.id !== accountId) ||
        (account.personId && account.personId !== id) || account.role !== "MEMBER") {
      throw new Error("ACCOUNT_LINK_CONFLICT");
    }
    return tx.userAccount.update({
      where: { id: accountId, churchId, OR: [{ personId: null }, { personId: id }] },
      data: { personId: id },
      select: { id: true, personId: true, role: true, status: true }
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
