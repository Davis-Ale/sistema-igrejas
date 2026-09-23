import "dotenv/config";
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@sistema-igrejas/database";
import { createAuthPreHandler, signToken } from "@sistema-igrejas/auth";
import { registerMemberRoutes, registerVisitorRoutes } from "@sistema-igrejas/members";
import { registerVolunteerRoutes, updateVolunteerStatus } from "@sistema-igrejas/volunteers";

type Tenant = { churchId: string; campusId: string; actorId: string; accountId: string; memberId: string; visitorId: string };

describe("Members, visitors and existing volunteers (HTTP + PostgreSQL)", () => {
  let db: PrismaClient;
  let app: FastifyInstance;
  let a: Tenant;
  let b: Tenant;
  const churchIds: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
    app = Fastify();
    await app.register(jwt, { secret: "members-volunteers-test-only-97d436bb785c" });
    await app.register(async routes => {
      routes.addHook("preHandler", createAuthPreHandler(db));
      await registerMemberRoutes(routes, db);
      await registerVisitorRoutes(routes, db);
      await registerVolunteerRoutes(routes, db);
    }, { prefix: "/api" });
    await app.ready();
  });

  async function fixture(): Promise<Tenant> {
    const key = randomUUID();
    const church = await db.church.create({ data: { name: "People test", slug: `people-${key}`, plan: "TRIAL", status: "ACTIVE" } });
    churchIds.push(church.id);
    const campus = await db.campus.create({ data: { churchId: church.id, name: "Campus" } });
    const actor = await db.person.create({ data: { churchId: church.id, name: "Pastor", phone: key, role: "PASTOR" } });
    const account = await db.userAccount.create({ data: { churchId: church.id, personId: actor.id, email: `${key}@people.test`, passwordHash: "unused", role: "PASTOR" } });
    const member = await db.person.create({ data: { churchId: church.id, campusId: campus.id, name: "Member", phone: key, role: "MEMBER" } });
    const visitor = await db.person.create({ data: { churchId: church.id, campusId: campus.id, name: "Visitor", phone: key, role: "VISITOR" } });
    return { churchId: church.id, campusId: campus.id, actorId: actor.id, accountId: account.id, memberId: member.id, visitorId: visitor.id };
  }

  beforeEach(async () => { a = await fixture(); b = await fixture(); });
  afterEach(async () => {
    if (!churchIds.length) return;
    const where = { churchId: { in: churchIds } };
    await db.volunteerLog.deleteMany({ where });
    await db.celula.deleteMany({ where });
    await db.trail.deleteMany({ where });
    await db.userAccount.deleteMany({ where });
    await db.person.deleteMany({ where });
    await db.campus.deleteMany({ where });
    await db.church.deleteMany({ where: { id: { in: churchIds } } });
    churchIds.length = 0;
  });
  afterAll(async () => { if (app) await app.close(); if (db) await db.$disconnect(); });

  async function send(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, payload?: object, tenant = a) {
    const token = await signToken(app, { userId: tenant.accountId, churchId: tenant.churchId, role: "PASTOR" });
    return app.inject({ method, url: `/api${path}`, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });
  }
  function account(tenant = a, personId?: string, role: "MEMBER" | "VISITOR" | "PASTOR" = "MEMBER") {
    return db.userAccount.create({ data: { churchId: tenant.churchId, personId: personId ?? null, role, email: `${randomUUID()}@people.test`, passwordHash: "unused" } });
  }

  it.each(["members", "visitors"])("completes valid %s CRUD in both churches", async resource => {
    for (const tenant of [a, b]) {
      const created = await send("POST", `/${resource}`, { name: "New", phone: "123", campusId: tenant.campusId }, tenant);
      expect(created.statusCode).toBe(201);
      const id = created.json().id;
      expect((await send("GET", `/${resource}/${id}`, undefined, tenant)).json().id).toBe(id);
      expect((await send("PATCH", `/${resource}/${id}`, { name: "Edited", email: "edited@test.local" }, tenant)).json().name).toBe("Edited");
      const cleared = await send("PUT", `/${resource}/${id}`, { campusId: null, email: null }, tenant);
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json()).toMatchObject({ campusId: null, email: null, name: "Edited" });
      expect((await send("DELETE", `/${resource}/${id}`, undefined, tenant)).statusCode).toBe(200);
      expect(await db.person.findUnique({ where: { id } })).toBeNull();
    }
  });

  it.each(["members", "visitors"])("blocks cross-tenant %s reads, edits and deletion in both directions", async resource => {
    for (const [own, foreign] of [[a, b], [b, a]]) {
      const id = resource === "members" ? foreign!.memberId : foreign!.visitorId;
      for (const method of ["GET", "DELETE", "PATCH", "PUT"] as const) {
        const response = await send(method, `/${resource}/${id}`, ["PATCH", "PUT"].includes(method) ? { name: "Stolen" } : undefined, own);
        expect(response.statusCode).toBe(404);
      }
      const rows = (await send("GET", `/${resource}`, undefined, own)).json();
      expect(rows.map((row: { id: string }) => row.id)).not.toContain(id);
      expect((await db.person.findUniqueOrThrow({ where: { id } })).name).not.toBe("Stolen");
    }
  });

  it.each(["members", "visitors"])("rejects foreign campus references for %s", async resource => {
    const id = resource === "members" ? a.memberId : a.visitorId;
    expect((await send("POST", `/${resource}`, { name: "Bad", phone: "123", campusId: b.campusId })).statusCode).toBe(404);
    expect((await send("PATCH", `/${resource}/${id}`, { campusId: b.campusId })).statusCode).toBe(404);
    expect((await db.person.findUniqueOrThrow({ where: { id } })).campusId).toBe(a.campusId);
    await db.person.update({ where: { id }, data: { campusId: b.campusId } });
    expect((await send("GET", `/${resource}`)).json().map((row: { id: string }) => row.id)).not.toContain(id);
    expect((await send("GET", `/${resource}/${id}`)).statusCode).toBe(409);
  });

  it("links an existing local member account without changing its status or permissions", async () => {
    const login = await account();
    await db.userAccount.update({ where: { id: login.id }, data: { status: "DISABLED" } });
    for (let i = 0; i < 2; i++) {
      const response = await send("PUT", `/members/${a.memberId}/account`, { accountId: login.id });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ id: login.id, personId: a.memberId, role: "MEMBER", status: "DISABLED" });
    }
    expect((await send("DELETE", `/members/${a.memberId}`)).statusCode).toBe(409);
  });

  it("rejects foreign, wrong-type and privileged account links", async () => {
    const foreign = await account(b);
    for (const accountId of [foreign.id, a.memberId]) {
      expect((await send("PUT", `/members/${a.memberId}/account`, { accountId })).statusCode).toBe(404);
    }
    expect((await send("PUT", `/members/${b.memberId}/account`, { accountId: foreign.id })).statusCode).toBe(404);
    expect((await send("PUT", `/members/${a.memberId}/account`, { accountId: a.accountId })).statusCode).toBe(409);
    expect((await db.userAccount.findUniqueOrThrow({ where: { id: foreign.id } })).personId).toBeNull();
  });

  it("does not replace either side of an existing account link", async () => {
    const linked = await account(a, a.memberId);
    const other = await account();
    expect((await send("PUT", `/members/${a.memberId}/account`, { accountId: other.id })).statusCode).toBe(409);
    const person = await db.person.create({ data: { churchId: a.churchId, name: "Other", phone: "123" } });
    expect((await send("PUT", `/members/${person.id}/account`, { accountId: linked.id })).statusCode).toBe(409);
    expect((await db.userAccount.findUniqueOrThrow({ where: { id: linked.id } })).personId).toBe(a.memberId);
  });

  it("converts the existing visitor and linked account atomically, preserving ID and disabled status", async () => {
    const login = await account(a, a.visitorId, "VISITOR");
    await db.userAccount.update({ where: { id: login.id }, data: { status: "DISABLED" } });
    const count = await db.person.count({ where: { churchId: a.churchId } });
    const history = await db.volunteerLog.create({ data: { churchId: a.churchId, personId: a.visitorId, changedBy: a.actorId, status: "IN_FORMATION" } });
    const result = await send("POST", `/visitors/${a.visitorId}/convert`);
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({ id: a.visitorId, role: "MEMBER", campusId: a.campusId });
    expect(await db.person.count({ where: { churchId: a.churchId } })).toBe(count);
    expect((await db.volunteerLog.findUniqueOrThrow({ where: { id: history.id } })).personId).toBe(a.visitorId);
    expect((await send("GET", `/members/${a.visitorId}`)).statusCode).toBe(200);
    expect((await send("GET", "/visitors")).json()).toEqual([]);
    expect(await db.userAccount.findUniqueOrThrow({ where: { id: login.id } })).toMatchObject({ personId: a.visitorId, role: "MEMBER", status: "DISABLED" });
    expect((await send("POST", `/visitors/${a.visitorId}/convert`)).statusCode).toBe(404);
  });

  it("rejects foreign visitors, member/account IDs, and conversion into an arbitrary person", async () => {
    for (const id of [b.visitorId, a.memberId, a.accountId]) expect((await send("POST", `/visitors/${id}/convert`)).statusCode).toBe(404);
    expect((await send("POST", `/visitors/${a.visitorId}/convert`, { personId: b.memberId })).statusCode).toBe(400);
    expect((await db.person.findUniqueOrThrow({ where: { id: a.visitorId } })).role).toBe("VISITOR");
  });

  it("refuses inconsistent existing person-account links", async () => {
    await account(b, a.memberId);
    await account(b, a.visitorId, "VISITOR");
    for (const [resource, id] of [["members", a.memberId], ["visitors", a.visitorId]]) {
      expect((await send("PATCH", `/${resource}/${id}`, { name: "Bad" })).statusCode).toBe(409);
      expect((await send("DELETE", `/${resource}/${id}`)).statusCode).toBe(409);
    }
    expect((await send("POST", `/visitors/${a.visitorId}/convert`)).statusCode).toBe(409);
  });

  it("protects historical records from cascading deletion", async () => {
    for (const [resource, id] of [["members", a.memberId], ["visitors", a.visitorId]]) {
      const log = await db.volunteerLog.create({ data: { churchId: a.churchId, personId: id!, changedBy: a.actorId, status: "IN_FORMATION" } });
      expect((await send("DELETE", `/${resource}/${id}`)).statusCode).toBe(409);
      expect(await db.volunteerLog.findUnique({ where: { id: log.id } })).not.toBeNull();
    }
  });

  it.each(["members", "visitors"])("rejects empty edits, invalid fields and role/tenant changes in %s", async resource => {
    const id = resource === "members" ? a.memberId : a.visitorId;
    for (const payload of [{}, { name: " " }, { email: "invalid" }, { churchId: b.churchId }, { role: "PASTOR" }, { status: "INACTIVE" }]) {
      expect((await send("PATCH", `/${resource}/${id}`, payload)).statusCode).toBe(400);
    }
    expect((await send("PATCH", `/${resource}/${a.actorId}`, { name: "Changed" })).statusCode).toBe(404);
  });

  it.each(["MEMBER", "VOLUNTEER", "LEADER"] as const)("enforces operation permissions for %s using current account role", async role => {
    await db.userAccount.update({ where: { id: a.accountId }, data: { role } });
    for (const resource of ["members", "visitors", "volunteers"]) {
      expect((await send("GET", `/${resource}`)).statusCode).toBe(role === "LEADER" ? 200 : 403);
    }
    for (const [method, path, payload] of [
      ["POST", "/members", { name: "Bad", phone: "123" }],
      ["PATCH", `/members/${a.memberId}`, { name: "Bad" }],
      ["DELETE", `/members/${a.memberId}`, undefined],
      ["PUT", `/members/${a.memberId}/account`, { accountId: a.accountId }],
      ["POST", "/visitors", { name: "Bad", phone: "123" }],
      ["POST", `/visitors/${a.visitorId}/convert`, undefined],
      ["POST", "/volunteers/status", { personId: a.memberId, status: "ACTIVE" }]
    ] as const) expect((await send(method, path, payload)).statusCode).toBe(403);
  });

  it("lists eligible members and records valid activation/suspension with the actor's Person.id", async () => {
    await db.person.update({ where: { id: a.memberId }, data: { volunteerStatus: "ELIGIBLE" } });
    expect((await send("GET", "/volunteers")).json().map((row: { id: string }) => row.id)).toContain(a.memberId);
    for (const status of ["ACTIVE", "SUSPENDED", "ACTIVE"] as const) {
      const result = await send("POST", "/volunteers/status", { personId: a.memberId, status, changedBy: b.actorId });
      expect(result.statusCode).toBe(200);
      expect(result.json().person).toMatchObject({ id: a.memberId, role: "VOLUNTEER", volunteerStatus: status });
      expect(result.json().log.changedBy).toBe(a.actorId);
    }
    expect((await send("GET", `/volunteers/${a.memberId}/logs`)).json()).toHaveLength(3);
  });

  it("preserves leadership roles when activating volunteers", async () => {
    const response = await send("POST", "/volunteers/status", { personId: a.actorId, status: "ACTIVE" });
    expect(response.statusCode).toBe(200);
    expect(response.json().person.role).toBe("PASTOR");
    expect((await db.userAccount.findUniqueOrThrow({ where: { id: a.accountId } })).role).toBe("PASTOR");
  });

  it("rejects visitors and invalid volunteer states without mutation", async () => {
    expect((await send("POST", "/volunteers/status", { personId: a.visitorId, status: "ACTIVE" })).statusCode).toBe(409);
    expect((await send("POST", "/volunteers/status", { personId: a.memberId, status: "DISABLED" })).statusCode).toBe(400);
    expect(await db.volunteerLog.count({ where: { churchId: a.churchId } })).toBe(0);
  });

  it("blocks foreign volunteers and invalid responsible people", async () => {
    expect((await send("POST", "/volunteers/status", { personId: b.memberId, status: "ACTIVE" })).statusCode).toBe(404);
    for (const changer of [b.actorId, a.accountId]) {
      await expect(updateVolunteerStatus(db, a.churchId, changer, { personId: a.memberId, status: "ACTIVE" })).rejects.toThrow("CHANGER_NOT_FOUND");
    }
    await db.userAccount.update({ where: { id: a.accountId }, data: { personId: null } });
    expect((await send("POST", "/volunteers/status", { personId: a.memberId, status: "ACTIVE" })).statusCode).toBe(404);
    expect((await send("GET", `/volunteers/${b.memberId}/logs`)).json()).toEqual([]);
    expect(await db.volunteerLog.count({ where: { churchId: a.churchId } })).toBe(0);
  });

  it("hides foreign nested relationships and inconsistent status authors", async () => {
    const cell = await db.celula.create({ data: { churchId: b.churchId, leaderId: b.actorId, name: "Private group", region: "Centro", meetDay: "Monday" } });
    await db.person.update({ where: { id: a.memberId }, data: { role: "VOLUNTEER", celulaId: cell.id } });
    expect((await send("GET", "/volunteers")).json()).toEqual([]);
    await db.volunteerLog.create({ data: { churchId: a.churchId, personId: a.memberId, changedBy: b.actorId, status: "ACTIVE" } });
    expect((await send("GET", `/volunteers/${a.memberId}/logs`)).json()).toEqual([]);
    await db.person.update({ where: { id: a.memberId }, data: { celulaId: null } });
    const trail = await db.trail.create({ data: { churchId: b.churchId, name: "Private trail" } });
    const stage = await db.trailStage.create({ data: { churchId: b.churchId, trailId: trail.id, label: "Private", order: 0 } });
    await db.person.update({ where: { id: a.memberId }, data: { trailStageId: stage.id } });
    expect((await send("GET", "/volunteers")).json()).toEqual([]);
  });

  it("preserves valid group/trail references and rejects a foreign linked account during activation", async () => {
    const cell = await db.celula.create({ data: { churchId: a.churchId, leaderId: a.actorId, name: "Local group", region: "Centro", meetDay: "Monday" } });
    const trail = await db.trail.create({ data: { churchId: a.churchId, name: "Local trail" } });
    const stage = await db.trailStage.create({ data: { churchId: a.churchId, trailId: trail.id, label: "Local", order: 0 } });
    await db.person.update({ where: { id: a.memberId }, data: { volunteerStatus: "ELIGIBLE", celulaId: cell.id, trailStageId: stage.id } });
    const list = await send("GET", "/volunteers");
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([expect.objectContaining({ id: a.memberId, celula: expect.objectContaining({ id: cell.id }), trailStage: expect.objectContaining({ id: stage.id }) })]);
    await account(b, a.memberId);
    expect((await send("POST", "/volunteers/status", { personId: a.memberId, status: "ACTIVE" })).statusCode).toBe(409);
    expect((await db.person.findUniqueOrThrow({ where: { id: a.memberId } })).volunteerStatus).toBe("ELIGIBLE");
    expect(await db.volunteerLog.count({ where: { churchId: a.churchId } })).toBe(0);
  });
});
