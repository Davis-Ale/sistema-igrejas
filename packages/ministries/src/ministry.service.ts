import { Prisma, type PrismaClient } from "@prisma/client";
import type { CreateMinistryInput, UpdateMinistryInput } from "./ministry.schema.js";

type Store = Prisma.TransactionClient;
const personSelect = { id: true, name: true, role: true } as const;
const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

function tenant(churchId: string) {
  if (!churchId) throw new Error("CHURCH_CONTEXT_REQUIRED");
  return churchId;
}

function ministrySelect(churchId: string) {
  return {
    id: true, name: true, description: true, status: true, leaderId: true,
    createdAt: true, updatedAt: true,
    leader: { select: personSelect },
    members: {
      where: { churchId, person: { is: { churchId } } },
      orderBy: { createdAt: "asc" as const },
      select: { personId: true, createdAt: true, person: { select: personSelect } }
    }
  } satisfies Prisma.MinistrySelect;
}

async function requireMinistry(db: Store, churchId: string, id: string) {
  const row = await db.ministry.findFirst({
    where: { id, churchId: tenant(churchId), leader: { is: { churchId } } },
    select: ministrySelect(churchId)
  });
  if (!row) throw new Error("MINISTRY_NOT_FOUND");
  return row;
}

async function requirePerson(db: Store, churchId: string, id: string, member = false) {
  const person = await db.person.findFirst({
    where: { id, churchId: tenant(churchId) }, select: personSelect
  });
  if (!person) throw new Error("MINISTRY_PERSON_NOT_FOUND");
  if (member && person.role !== "MEMBER" && person.role !== "VOLUNTEER") {
    throw new Error("MINISTRY_MEMBER_ROLE_INVALID");
  }
  return person;
}

export function listMinistries(db: PrismaClient, churchId: string) {
  return db.ministry.findMany({
    where: { churchId: tenant(churchId), leader: { is: { churchId } } },
    select: ministrySelect(churchId), orderBy: [{ name: "asc" }, { id: "asc" }]
  });
}

export function getMinistry(db: PrismaClient, churchId: string, id: string) {
  return requireMinistry(db, churchId, id);
}

// Only fields needed by this module's person selectors are exposed.
export function listMinistryPeople(db: PrismaClient, churchId: string) {
  return db.person.findMany({ where: { churchId: tenant(churchId) }, select: personSelect, orderBy: [{ name: "asc" }, { id: "asc" }] });
}

export function createMinistry(db: PrismaClient, churchId: string, input: CreateMinistryInput) {
  tenant(churchId);
  return db.$transaction(async tx => {
    await requirePerson(tx, churchId, input.leaderId);
    return tx.ministry.create({ data: {
      churchId, name: input.name, description: input.description, status: input.status, leaderId: input.leaderId
    }, select: ministrySelect(churchId) });
  }, transactionOptions);
}

export function updateMinistry(db: PrismaClient, churchId: string, id: string, input: UpdateMinistryInput) {
  tenant(churchId);
  return db.$transaction(async tx => {
    await requireMinistry(tx, churchId, id);
    if (input.leaderId !== undefined) await requirePerson(tx, churchId, input.leaderId);
    return tx.ministry.update({ where: { id, churchId }, data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.leaderId !== undefined ? { leaderId: input.leaderId } : {})
    }, select: ministrySelect(churchId) });
  }, transactionOptions);
}

export function deleteMinistry(db: PrismaClient, churchId: string, id: string) {
  tenant(churchId);
  return db.$transaction(async tx => {
    await requireMinistry(tx, churchId, id);
    // Only membership links cascade. People and their roles remain unchanged.
    await tx.ministry.delete({ where: { id, churchId } });
    return { id, deleted: true };
  }, transactionOptions);
}

export function addMinistryMember(db: PrismaClient, churchId: string, id: string, personId: string) {
  tenant(churchId);
  return db.$transaction(async tx => {
    await requireMinistry(tx, churchId, id);
    await requirePerson(tx, churchId, personId, true);
    await tx.ministryMember.upsert({
      where: { churchId_ministryId_personId: { churchId, ministryId: id, personId } },
      create: { churchId, ministryId: id, personId }, update: {}
    });
    return requireMinistry(tx, churchId, id);
  }, transactionOptions);
}

export function removeMinistryMember(db: PrismaClient, churchId: string, id: string, personId: string) {
  tenant(churchId);
  return db.$transaction(async tx => {
    await requireMinistry(tx, churchId, id);
    // Existing links may be removed even if the person has since changed roles.
    await requirePerson(tx, churchId, personId);
    const deleted = await tx.ministryMember.deleteMany({ where: { churchId, ministryId: id, personId } });
    if (!deleted.count) throw new Error("MINISTRY_MEMBERSHIP_NOT_FOUND");
    return requireMinistry(tx, churchId, id);
  }, transactionOptions);
}
