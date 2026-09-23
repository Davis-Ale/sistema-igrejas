import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, resolveTenantActorPersonId } from "@sistema-igrejas/database";
import {
  createMember, createVisitor, createCell, updateCell, getCellById, listMembers, listVisitors,
  createCellSchema, deleteCellSafely, addPersonToCell, removePersonFromCell, archiveCell, reactivateCell,
  listPaginatedCells, listCellsQuerySchema
} from "@sistema-igrejas/members";
import { createTrailStage, completeTrailStage, listTrails, listTrailStages, listPersonTrailProgress } from "@sistema-igrejas/trail";
import { createEvent, duplicateEvent, updateEvent, deleteEvent, getEventById } from "../../../packages/events/src/event.service.js";
import { createEventSchema } from "../../../packages/events/src/event.schema.js";
import { updateVolunteerStatus, listVolunteerLogs } from "@sistema-igrejas/volunteers";

type Tenant = { churchId: string; campusId: string; actorId: string; personId: string; cellId: string; trailId: string; stageId: string; eventId: string; accountId: string };

describe("Tenant isolation against PostgreSQL", () => {
  let db: PrismaClient;
  let a: Tenant;
  let b: Tenant;
  const churchIds: string[] = [];
  const eventData = createEventSchema.parse({ title: "Tenant test", slug: "test", date: "2027-01-01", capacity: 10 });
  const cellData = createCellSchema.parse({ name: "Tenant group", leaderId: "placeholder", region: "Centro", meetDay: "Monday", meetTime: "19:00", profile: "Adults" });

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for tenant integration tests.");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
    async function fixture(): Promise<Tenant> {
      const key = randomUUID();
      const church = await db.church.create({ data: { name: `Tenant isolation ${key}`, slug: `tenant-test-${key}`, status: "ACTIVE", plan: "TRIAL" } });
      churchIds.push(church.id);
      const campus = await db.campus.create({ data: { churchId: church.id, name: "Test campus" } });
      const actor = await db.person.create({ data: { churchId: church.id, campusId: campus.id, name: "Actor", phone: key, role: "PASTOR" } });
      const person = await createMember(db, church.id, { name: "Member", phone: `member-${key}`, campusId: campus.id });
      const account = await db.userAccount.create({ data: { churchId: church.id, personId: actor.id, email: `${key}@tenant.test`, passwordHash: "unused-test-account", role: "PASTOR" } });
      const cell = await createCell(db, church.id, { ...cellData, leaderId: actor.id, campusId: campus.id });
      const trail = await db.trail.create({ data: { churchId: church.id, name: "Test trail", isVolunteerGate: true } });
      const stage = await createTrailStage(db, church.id, { trailId: trail.id, label: "Stage", order: 0 });
      const event = await createEvent(db, church.id, { ...eventData, campusId: campus.id, trailStageId: stage.id });
      return { churchId: church.id, campusId: campus.id, actorId: actor.id, personId: person.id, cellId: cell.id, trailId: trail.id, stageId: stage.id, eventId: event.id, accountId: account.id };
    }
    a = await fixture();
    b = await fixture();
  });

  afterAll(async () => {
    if (!db) return;
    try {
      if (churchIds.length) {
        const where = { churchId: { in: churchIds } };
        await db.volunteerLog.deleteMany({ where });
        await db.trailProgress.deleteMany({ where });
        await db.membership.deleteMany({ where });
        await db.celula.deleteMany({ where });
        await db.event.deleteMany({ where });
        await db.trail.deleteMany({ where });
        await db.userAccount.deleteMany({ where });
        await db.person.deleteMany({ where });
        await db.campus.deleteMany({ where });
        await db.church.deleteMany({ where: { id: { in: churchIds } } });
      }
    } finally { await db.$disconnect(); }
  });

  it("rejects foreign campus IDs on all affected create/update operations", async () => {
    const personData = { name: "Rejected", phone: "rejected", campusId: b.campusId };
    await expect(createMember(db, a.churchId, personData)).rejects.toThrow("CAMPUS_NOT_FOUND");
    await expect(createVisitor(db, a.churchId, personData)).rejects.toThrow("CAMPUS_NOT_FOUND");
    await expect(createCell(db, a.churchId, { ...cellData, leaderId: a.actorId, campusId: b.campusId })).rejects.toThrow("CAMPUS_NOT_FOUND");
    await expect(updateCell(db, a.churchId, a.cellId, { ...cellData, leaderId: a.actorId, campusId: b.campusId })).rejects.toThrow("CAMPUS_NOT_FOUND");
    await expect(createEvent(db, a.churchId, { ...eventData, campusId: b.campusId })).rejects.toThrow("CAMPUS_NOT_FOUND");
    expect(await db.person.count({ where: { churchId: a.churchId, phone: "rejected" } })).toBe(0);
  });

  it("rejects foreign trail, stage, required event and approver references", async () => {
    await expect(createTrailStage(db, a.churchId, { trailId: b.trailId, label: "Bad", order: 1 })).rejects.toThrow("TRAIL_NOT_FOUND");
    await expect(createTrailStage(db, a.churchId, { trailId: a.trailId, label: "Bad", order: 1, requiresEventId: b.eventId })).rejects.toThrow("EVENT_NOT_FOUND");
    await expect(createEvent(db, a.churchId, { ...eventData, trailStageId: b.stageId })).rejects.toThrow("TRAIL_STAGE_NOT_FOUND");
    await expect(completeTrailStage(db, a.churchId, a.actorId, { personId: a.personId, stageId: b.stageId })).rejects.toThrow("TRAIL_STAGE_NOT_FOUND");
    await expect(completeTrailStage(db, a.churchId, b.actorId, { personId: a.personId, stageId: a.stageId })).rejects.toThrow("APPROVER_NOT_FOUND");
    await expect(addPersonToCell(db, a.churchId, b.actorId, { personId: a.personId, groupId: a.cellId, canVolunteer: false })).rejects.toThrow("APPROVER_NOT_FOUND");
    await expect(updateVolunteerStatus(db, a.churchId, b.actorId, { personId: a.personId, status: "ACTIVE" })).rejects.toThrow("CHANGER_NOT_FOUND");
  });

  it("rejects foreign reads, edits, deletions and duplication in both directions", async () => {
    for (const [own, foreign] of [[a, b], [b, a]] as const) {
      await expect(getCellById(db, own.churchId, foreign.cellId)).rejects.toThrow("CELL_NOT_FOUND");
      await expect(getEventById(db, own.churchId, foreign.eventId)).rejects.toThrow("EVENT_NOT_FOUND");
      await expect(updateCell(db, own.churchId, foreign.cellId, { ...cellData, leaderId: own.actorId })).rejects.toThrow("CELL_NOT_FOUND");
      await expect(deleteCellSafely(db, own.churchId, foreign.cellId)).rejects.toThrow("CELL_NOT_FOUND");
      await expect(updateEvent(db, own.churchId, foreign.eventId, { title: "Bad" })).rejects.toThrow("EVENT_NOT_FOUND");
      await expect(deleteEvent(db, own.churchId, foreign.eventId)).rejects.toThrow("EVENT_NOT_FOUND");
      await expect(duplicateEvent(db, own.churchId, foreign.eventId, { title: "Bad", slug: "bad", date: new Date() })).rejects.toThrow("EVENT_NOT_FOUND");
      expect(await listTrailStages(db, own.churchId, foreign.trailId)).toEqual([]);
      expect(await listPersonTrailProgress(db, own.churchId, foreign.personId)).toEqual([]);
    }
  });

  it("resolves account IDs to people only inside the current church", async () => {
    expect(await resolveTenantActorPersonId(db, a.churchId, a.accountId)).toBe(a.actorId);
    await expect(resolveTenantActorPersonId(db, a.churchId, b.accountId)).rejects.toThrow("ACTOR_NOT_FOUND");
  });

  it("filters legacy inconsistent nested records without exposing the other church", async () => {
    const badStage = await db.trailStage.create({ data: { churchId: b.churchId, trailId: a.trailId, label: "Private B", order: 100 } });
    const badProgress = await db.trailProgress.create({ data: { churchId: a.churchId, personId: a.personId, stageId: b.stageId, approvedBy: b.actorId } });
    const badLog = await db.volunteerLog.create({ data: { churchId: a.churchId, personId: a.personId, changedBy: b.actorId, status: "ACTIVE" } });
    await db.person.update({ where: { id: b.personId }, data: { celulaId: a.cellId } });
    try {
      expect((await listTrails(db, a.churchId))[0]!.stages.map(row => row.id)).not.toContain(badStage.id);
      expect((await getCellById(db, a.churchId, a.cellId)).people.map(row => row.id)).not.toContain(b.personId);
      const paginated = await listPaginatedCells(db, a.churchId, listCellsQuerySchema.parse({}));
      expect(paginated.items.find(row => row.id === a.cellId)!.memberCount).toBe(0);
      expect(await listPersonTrailProgress(db, a.churchId, a.personId)).toEqual([]);
      expect(await listVolunteerLogs(db, a.churchId, a.personId)).toEqual([]);
    } finally {
      await db.trailProgress.delete({ where: { id: badProgress.id } });
      await db.volunteerLog.delete({ where: { id: badLog.id } });
      await db.trailStage.delete({ where: { id: badStage.id } });
      await db.person.update({ where: { id: b.personId }, data: { celulaId: null } });
    }
  });

  it("preserves valid relations, progress upserts and volunteer eligibility", async () => {
    const visitor = await createVisitor(db, a.churchId, { name: "Visitor", phone: "valid-visitor", campusId: a.campusId });
    expect((await listVisitors(db, a.churchId, {})).map(row => row.id)).toContain(visitor.id);
    expect((await listMembers(db, a.churchId, {})).map(row => row.id)).toContain(a.personId);
    expect((await listMembers(db, a.churchId, {})).map(row => row.id)).not.toContain(b.personId);
    const stage = await createTrailStage(db, a.churchId, { trailId: a.trailId, label: "Valid", order: 1, requiresEventId: a.eventId });
    const progress = await completeTrailStage(db, a.churchId, a.actorId, { personId: a.personId, stageId: stage.id });
    const repeated = await completeTrailStage(db, a.churchId, a.actorId, { personId: a.personId, stageId: stage.id });
    expect(repeated.id).toBe(progress.id);
    expect((await db.person.findUniqueOrThrow({ where: { id: a.personId } })).volunteerStatus).toBe("ELIGIBLE");
    const membership = await addPersonToCell(db, a.churchId, a.actorId, { personId: a.personId, groupId: a.cellId, canVolunteer: true });
    expect(membership.approvedBy).toBe(a.actorId);
    await removePersonFromCell(db, a.churchId, { personId: a.personId, groupId: a.cellId });
    expect((await db.person.findUniqueOrThrow({ where: { id: a.personId } })).celulaId).toBeNull();
    const status = await updateVolunteerStatus(db, a.churchId, a.actorId, { personId: a.personId, status: "ACTIVE" });
    expect(status.log.changedBy).toBe(a.actorId);
  });

  it("preserves own edits/deletes and the prohibition on deleting group history", async () => {
    const updated = await updateCell(db, a.churchId, a.cellId, { ...cellData, name: "Edited", leaderId: a.actorId, campusId: a.campusId });
    expect(updated.name).toBe("Edited");
    expect((await archiveCell(db, a.churchId, a.cellId)).status).toBe("ARCHIVED");
    expect((await reactivateCell(db, a.churchId, a.cellId)).status).toBe("ACTIVE");
    await expect(deleteCellSafely(db, a.churchId, a.cellId)).rejects.toThrow("CELL_HAS_HISTORY");
    expect((await deleteCellSafely(db, b.churchId, b.cellId)).deleted).toBe(true);
    const event = await duplicateEvent(db, a.churchId, a.eventId, { title: "Copy", slug: "copy", date: new Date() });
    expect(event.churchId).toBe(a.churchId);
    expect((await updateEvent(db, a.churchId, event.id, { title: "Edited copy" })).title).toBe("Edited copy");
    await deleteEvent(db, a.churchId, event.id);
    expect(await db.event.findUnique({ where: { id: event.id } })).toBeNull();
  });
});
