import "dotenv/config";
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, resolveTenantActorPersonId } from "@sistema-igrejas/database";
import { createAuthPreHandler, signToken } from "@sistema-igrejas/auth";
import { registerCellRoutes, addPersonToCell } from "@sistema-igrejas/members";
import { registerTrailRoutes, completeTrailStage } from "@sistema-igrejas/trail";

type Tenant = { churchId: string; actorId: string; accountId: string; personId: string; cellId: string; trailId: string; stageId: string; eventId: string };
type Flow = "group" | "trail";

// HTTP + real JWT + PostgreSQL: IDs of accounts and people deliberately differ.
describe("Small Groups and Trails approval identity", () => {
  let app: FastifyInstance;
  let db: PrismaClient;
  let a: Tenant;
  let b: Tenant;
  let unlinkedAccountId: string;
  let inconsistentAccountId: string;
  const churchIds: string[] = [];
  const flows: Flow[] = ["group", "trail"];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
    async function createTenant(): Promise<Tenant> {
      const key = randomUUID();
      const church = await db.church.create({ data: { name: `Approvals ${key}`, slug: `approvals-${key}`, plan: "TRIAL", status: "ACTIVE" } });
      churchIds.push(church.id);
      const actor = await db.person.create({ data: { churchId: church.id, name: "Approver", phone: `actor-${key}`, role: "PASTOR" } });
      const account = await db.userAccount.create({ data: { churchId: church.id, personId: actor.id, email: `${key}@approvals.test`, passwordHash: "unused-test-account", role: "PASTOR" } });
      const person = await db.person.create({ data: { churchId: church.id, name: "Participant", phone: `person-${key}`, role: "MEMBER" } });
      const cell = await db.celula.create({ data: { churchId: church.id, leaderId: actor.id, name: "Group", region: "Centro", meetDay: "Monday" } });
      const trail = await db.trail.create({ data: { churchId: church.id, name: "Trail", isVolunteerGate: true } });
      const stage = await db.trailStage.create({ data: { churchId: church.id, trailId: trail.id, label: "Stage", order: 0 } });
      const event = await db.event.create({ data: { churchId: church.id, title: "Required event", slug: "required", date: new Date(), capacity: 10 } });
      return { churchId: church.id, actorId: actor.id, accountId: account.id, personId: person.id, cellId: cell.id, trailId: trail.id, stageId: stage.id, eventId: event.id };
    }
    a = await createTenant();
    b = await createTenant();
    // A Person with the same raw ID as A's account must never become its approver.
    const collision = await db.person.create({ data: { id: a.accountId, churchId: b.churchId, name: "Other-tenant person", phone: randomUUID() } });
    unlinkedAccountId = (await db.userAccount.create({ data: { churchId: a.churchId, email: `${randomUUID()}@approvals.test`, passwordHash: "unused", role: "PASTOR" } })).id;
    inconsistentAccountId = (await db.userAccount.create({ data: { churchId: a.churchId, personId: collision.id, email: `${randomUUID()}@approvals.test`, passwordHash: "unused", role: "PASTOR" } })).id;

    app = Fastify();
    await app.register(jwt, { secret: "approvals-test-only-14a7fe32e10a4af39c02" });
    await app.register(async routes => {
      routes.addHook("preHandler", createAuthPreHandler(db));
      await registerCellRoutes(routes, db);
      await registerTrailRoutes(routes, db);
    }, { prefix: "/api" });
    await app.ready();
  });

  beforeEach(async () => {
    const where = { churchId: { in: churchIds } };
    await db.membership.deleteMany({ where });
    await db.trailProgress.deleteMany({ where });
    await db.person.updateMany({ where: { id: { in: [a.personId, b.personId] } }, data: { celulaId: null, trailStageId: null, volunteerStatus: "IN_FORMATION" } });
    await db.celula.update({ where: { id: a.cellId }, data: { leaderId: a.actorId } });
    await db.trailStage.update({ where: { id: a.stageId }, data: { requiresEventId: null } });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (!db) return;
    try {
      if (churchIds.length) {
        const where = { churchId: { in: churchIds } };
        await db.membership.deleteMany({ where });
        await db.trailProgress.deleteMany({ where });
        await db.celula.deleteMany({ where });
        await db.trail.deleteMany({ where });
        await db.event.deleteMany({ where });
        await db.userAccount.deleteMany({ where });
        await db.person.deleteMany({ where });
        await db.church.deleteMany({ where: { id: { in: churchIds } } });
      }
    } finally { await db.$disconnect(); }
  });

  async function headers(tenant = a, userId = tenant.accountId) {
    return { authorization: `Bearer ${await signToken(app, { userId, churchId: tenant.churchId, role: "PASTOR" })}` };
  }
  async function approve(flow: Flow, options: { tenant?: Tenant; userId?: string; body?: Record<string, unknown> } = {}) {
    const tenant = options.tenant ?? a;
    return app.inject({ method: "POST", url: flow === "group" ? "/api/cells/members" : "/api/trails/progress/complete",
      headers: await headers(tenant, options.userId ?? tenant.accountId), payload: {
        personId: tenant.personId, ...(flow === "group" ? { groupId: tenant.cellId } : { stageId: tenant.stageId }), ...options.body
      } });
  }
  async function expectNoApproval() {
    const where = { churchId: { in: churchIds } };
    expect(await db.membership.count({ where })).toBe(0);
    expect(await db.trailProgress.count({ where })).toBe(0);
    const person = await db.person.findUniqueOrThrow({ where: { id: a.personId } });
    expect(person.celulaId).toBeNull();
    expect(person.trailStageId).toBeNull();
    expect(person.volunteerStatus).toBe("IN_FORMATION");
  }

  it.each(flows)("%s approval stores the account's Person.id, even when the account ID collides with another person", async flow => {
    for (const tenant of [a, b]) {
      expect(tenant.accountId).not.toBe(tenant.actorId);
      const response = await approve(flow, { tenant });
      expect(response.statusCode).toBe(flow === "group" ? 201 : 200);
      expect(response.json()).toMatchObject({ churchId: tenant.churchId, approvedBy: tenant.actorId, personId: tenant.personId });
      expect(response.json().approvedBy).not.toBe(tenant.accountId);
      const person = await db.person.findUniqueOrThrow({ where: { id: tenant.personId } });
      if (flow === "group") expect(person.celulaId).toBe(tenant.cellId);
      else expect(person.volunteerStatus).toBe("ELIGIBLE");
    }
  });

  it.each(flows)("%s ignores a client-supplied approver", async flow => {
    const response = await approve(flow, { body: { approvedBy: b.actorId, churchId: b.churchId } });
    expect(response.statusCode).toBe(flow === "group" ? 201 : 200);
    expect(response.json()).toMatchObject({ approvedBy: a.actorId, churchId: a.churchId });
  });

  it.each(flows)("%s rejects Person.id masquerading as UserAccount.id", async flow => {
    const response = await approve(flow, { userId: a.actorId });
    expect(response.statusCode).toBe(401);
    await expect(resolveTenantActorPersonId(db, a.churchId, a.actorId)).rejects.toThrow("ACTOR_NOT_FOUND");
    await expectNoApproval();
  });

  it.each(flows)("%s rejects UserAccount.id where the participant's Person.id is required", async flow => {
    const response = await approve(flow, { body: { personId: a.accountId } });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("PERSON_NOT_FOUND");
    await expectNoApproval();
  });

  it.each(flows)("%s rejects an account without a linked person", async flow => {
    const response = await approve(flow, { userId: unlinkedAccountId });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("ACTOR_NOT_FOUND");
    await expectNoApproval();
  });

  it.each(flows)("%s rejects an account whose linked person belongs to another church", async flow => {
    expect((await approve(flow, { userId: inconsistentAccountId })).statusCode).toBe(401);
    await expect(resolveTenantActorPersonId(db, a.churchId, inconsistentAccountId)).rejects.toThrow("ACTOR_NOT_FOUND");
    await expectNoApproval();
  });

  it.each(flows)("%s rejects nonexistent accounts and accounts from another church", async flow => {
    for (const userId of [randomUUID(), b.accountId]) expect((await approve(flow, { userId })).statusCode).toBe(401);
    await expectNoApproval();
  });

  it.each(flows)("%s rejects crossed participants and group/stage IDs in both directions", async flow => {
    for (const [own, foreign] of [[a, b], [b, a]] as const) {
      expect((await approve(flow, { tenant: own, body: { personId: foreign.personId } })).statusCode).toBe(404);
      const body = flow === "group" ? { groupId: foreign.cellId } : { stageId: foreign.stageId };
      expect((await approve(flow, { tenant: own, body })).statusCode).toBe(404);
    }
    await expectNoApproval();
  });

  it("rejects wrong-type and foreign approvers passed directly to the services", async () => {
    for (const personId of [a.accountId, b.actorId]) {
      await expect(addPersonToCell(db, a.churchId, personId, { personId: a.personId, groupId: a.cellId, canVolunteer: false })).rejects.toThrow("APPROVER_NOT_FOUND");
      await expect(completeTrailStage(db, a.churchId, personId, { personId: a.personId, stageId: a.stageId })).rejects.toThrow("APPROVER_NOT_FOUND");
    }
    await expectNoApproval();
  });

  it("rejects approvals into a legacy group whose responsible person belongs to another church", async () => {
    await db.celula.update({ where: { id: a.cellId }, data: { leaderId: b.actorId } });
    expect((await approve("group")).statusCode).toBe(404);
    await expectNoApproval();
  });

  it("rejects completion and hides a stage referencing another church's required event", async () => {
    await db.trailStage.update({ where: { id: a.stageId }, data: { requiresEventId: b.eventId } });
    expect((await approve("trail")).statusCode).toBe(404);
    const response = await app.inject({ url: `/api/trails/${a.trailId}/stages`, headers: await headers() });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
    await expectNoApproval();
  });

  it("hides existing progress and nested stages with a foreign required event", async () => {
    expect((await approve("trail")).statusCode).toBe(200);
    await db.trailStage.update({ where: { id: a.stageId }, data: { requiresEventId: b.eventId } });
    const auth = await headers();
    const progress = await app.inject({ url: `/api/trails/progress/${a.personId}`, headers: auth });
    expect(progress.statusCode).toBe(200);
    expect(progress.json()).toEqual([]);
    const trails = await app.inject({ url: "/api/trails", headers: auth });
    expect(trails.statusCode).toBe(200);
    expect(trails.json()).toEqual([expect.objectContaining({ id: a.trailId, stages: [] })]);
  });

  it("preserves valid required-event completion and repeat approval", async () => {
    await db.trailStage.update({ where: { id: a.stageId }, data: { requiresEventId: a.eventId } });
    const first = await approve("trail");
    const second = await approve("trail");
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);
    expect(await db.trailProgress.count({ where: { churchId: a.churchId } })).toBe(1);
  });

  it("prevents reading or changing another church's approvals and group", async () => {
    const membership = await approve("group", { tenant: b });
    const progress = await approve("trail", { tenant: b });
    expect(membership.statusCode).toBe(201);
    expect(progress.statusCode).toBe(200);
    const auth = await headers();
    expect((await app.inject({ url: `/api/cells/${b.cellId}`, headers: auth })).statusCode).toBe(404);
    expect((await app.inject({ url: `/api/trails/progress/${b.personId}`, headers: auth })).json()).toEqual([]);
    expect((await app.inject({ method: "POST", url: "/api/cells/members/remove", headers: auth, payload: { personId: b.personId, groupId: b.cellId } })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: `/api/cells/${b.cellId}`, headers: auth, payload: { leaderId: a.actorId, name: "Changed", region: "Centro", meetDay: "Monday", meetTime: "19:00", profile: "Adults" } })).statusCode).toBe(404);
    expect((await db.membership.findUniqueOrThrow({ where: { id: membership.json().id } })).removedAt).toBeNull();
    expect((await db.trailProgress.findUniqueOrThrow({ where: { id: progress.json().id } })).approvedBy).toBe(b.actorId);
    expect((await db.celula.findUniqueOrThrow({ where: { id: b.cellId } })).name).toBe("Group");
  });
});
