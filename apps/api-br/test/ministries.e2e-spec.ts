import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import Fastify, { type FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createAuthPreHandler, type Role } from "@sistema-igrejas/auth";
import { registerMinistryRoutes, createMinistrySchema, updateMinistrySchema } from "@sistema-igrejas/ministries";

type Tenant = { id: string; leaderId: string; memberId: string; volunteerId: string; visitorId: string; ministryId: string; accounts: Record<string, string> };
const roles: Role[] = ["SUPER_ADMIN", "PASTOR", "LEADER", "MEMBER", "VOLUNTEER"];

describe("Ministries: HTTP authorization and PostgreSQL tenant isolation", () => {
  let admin: Client;
  let db: PrismaClient;
  let app: FastifyInstance;
  let a: Tenant;
  let b: Tenant;
  let schemaCreated = false;
  // Every migration and fixture stays inside a unique disposable schema.
  const schema = `ministries_test_${randomUUID().replaceAll("-", "")}`;

  beforeAll(async () => {
    const connectionString = process.env.MINISTRIES_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL or MINISTRIES_TEST_DATABASE_URL is required.");
    admin = new Client({ connectionString, connectionTimeoutMillis: 5000 });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await admin.query(`SET search_path TO "${schema}"`);
    const migrations = path.resolve(__dirname, "../../../packages/database/prisma/migrations");
    for (const folder of (await readdir(migrations, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((x, y) => x.name.localeCompare(y.name))) {
      await admin.query(await readFile(path.join(migrations, folder.name, "migration.sql"), "utf8"));
    }
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema }) });
    app = Fastify();
    await app.register(jwt, { secret: "ministries-test-only-secret-at-least-32-characters" });
    await app.register(async routes => {
      routes.addHook("preHandler", createAuthPreHandler(db));
      await registerMinistryRoutes(routes, db);
    }, { prefix: "/api" });
    await app.ready();
    async function fixture(label: string): Promise<Tenant> {
      const church = await db.church.create({ data: { name: `Igreja ${label}`, slug: label, plan: "TRIAL", status: "ACTIVE" } });
      async function person(role: "PASTOR" | "MEMBER" | "VOLUNTEER" | "VISITOR") {
        return db.person.create({ data: { churchId: church.id, name: `${label}-${role}`, role, phone: "11999999999" } });
      }
      const leader = await person("PASTOR"), member = await person("MEMBER"), volunteer = await person("VOLUNTEER"), visitor = await person("VISITOR");
      const accounts: Record<string, string> = {};
      for (const role of roles) {
        const account = await db.userAccount.create({ data: { churchId: church.id, role, email: `${label}-${role}@ministries.test`, passwordHash: "unused-test-hash" } });
        accounts[role] = account.id;
      }
      return { id: church.id, leaderId: leader.id, memberId: member.id, volunteerId: volunteer.id, visitorId: visitor.id, ministryId: "", accounts };
    }
    a = await fixture("a"); b = await fixture("b");
  }, 120000);

  beforeEach(async () => {
    if (!db) return;
    await db.ministry.deleteMany();
    for (const tenant of [a, b]) {
      for (const role of roles) await db.userAccount.update({ where: { id: tenant.accounts[role]! }, data: { role, status: "ACTIVE" } });
      const ministry = await db.ministry.create({ data: { churchId: tenant.id, name: `Equipe ${tenant.id}`, leaderId: tenant.leaderId } });
      tenant.ministryId = ministry.id;
    }
  });

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (admin) {
      // Never accept a configurable schema name for destructive test cleanup.
      if (schemaCreated && /^ministries_test_[a-f0-9]{32}$/.test(schema)) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.end();
    }
  });

  function send(method: "GET" | "POST" | "PATCH" | "DELETE", suffix = "", payload?: unknown, tenant = a, role: Role = "PASTOR") {
    const token = app.jwt.sign({ userId: tenant.accounts[role]!, churchId: tenant.id, role });
    return app.inject({ method, url: `/api/ministries${suffix}`, headers: { authorization: `Bearer ${token}` }, ...(payload === undefined ? {} : { payload: payload as object }) });
  }

  it.each(["SUPER_ADMIN", "PASTOR"] as const)("supports complete CRUD for %s in both churches", async role => {
    for (const tenant of [a, b]) {
      const created = await send("POST", "", { name: "  Louvor  ", description: "Equipe de música", leaderId: tenant.leaderId }, tenant, role);
      expect(created.statusCode).toBe(201);
      const row = created.json();
      expect(row).toMatchObject({ name: "Louvor", status: "ACTIVE", leaderId: tenant.leaderId, description: "Equipe de música", members: [] });
      expect(row).not.toHaveProperty("churchId");
      expect(row.leader).not.toHaveProperty("phone");
      expect((await send("GET", `/${row.id}`, undefined, tenant, role)).statusCode).toBe(200);
      const updated = await send("PATCH", `/${row.id}`, { name: "Música", description: "", status: "INACTIVE", leaderId: tenant.volunteerId }, tenant, role);
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ name: "Música", description: "", status: "INACTIVE", leaderId: tenant.volunteerId });
      // A partial update must not reset defaulted fields.
      expect((await send("PATCH", `/${row.id}`, { name: "Música nova" }, tenant, role)).json()).toMatchObject({ status: "INACTIVE", description: "" });
      expect((await send("DELETE", `/${row.id}`, undefined, tenant, role)).statusCode).toBe(200);
      expect((await send("GET", `/${row.id}`, undefined, tenant, role)).statusCode).toBe(404);
    }
  });

  it.each(roles)("enforces permissions for %s on every endpoint", async role => {
    const canRead = ["SUPER_ADMIN", "PASTOR", "LEADER"].includes(role);
    const canManage = ["SUPER_ADMIN", "PASTOR"].includes(role);
    for (const tenant of [a, b]) {
      for (const suffix of ["", "/people", `/${tenant.ministryId}`]) expect((await send("GET", suffix, undefined, tenant, role)).statusCode).toBe(canRead ? 200 : 403);
      if (!canManage) {
        for (const [method, suffix, payload] of [
          ["POST", "", { name: "Blocked", leaderId: tenant.leaderId }],
          ["PATCH", `/${tenant.ministryId}`, { name: "Blocked" }],
          ["DELETE", `/${tenant.ministryId}`, undefined],
          ["POST", `/${tenant.ministryId}/members`, { personId: tenant.memberId }],
          ["DELETE", `/${tenant.ministryId}/members/${tenant.memberId}`, undefined]
        ] as const) expect((await send(method, suffix, payload, tenant, role)).statusCode).toBe(403);
        expect(await db.ministry.count({ where: { churchId: tenant.id } })).toBe(1);
        expect(await db.ministryMember.count({ where: { churchId: tenant.id } })).toBe(0);
      }
    }
  });

  it("isolates lists, selectors and every operation using foreign ministry IDs", async () => {
    for (const [own, foreign] of [[a, b], [b, a]] as const) {
      expect((await send("GET", "", undefined, own)).json().map((row: { id: string }) => row.id)).toEqual([own.ministryId]);
      const people = (await send("GET", "/people", undefined, own)).json();
      expect(people).toHaveLength(4);
      expect(people.map((row: { id: string }) => row.id)).not.toContain(foreign.memberId);
      expect(Object.keys(people[0]).sort()).toEqual(["id", "name", "role"]);
      for (const [method, suffix, payload] of [
        ["GET", `/${foreign.ministryId}`, undefined], ["PATCH", `/${foreign.ministryId}`, { name: "Stolen" }],
        ["DELETE", `/${foreign.ministryId}`, undefined], ["POST", `/${foreign.ministryId}/members`, { personId: own.memberId }],
        ["DELETE", `/${foreign.ministryId}/members/${foreign.memberId}`, undefined]
      ] as const) expect((await send(method, suffix, payload, own)).statusCode).toBe(404);
      expect((await db.ministry.findUniqueOrThrow({ where: { id: foreign.ministryId } })).name).not.toBe("Stolen");
    }
  });

  it("rejects foreign leaders and members without creating or changing records", async () => {
    for (const [own, foreign] of [[a, b], [b, a]] as const) {
      expect((await send("POST", "", { name: "Bad", leaderId: foreign.leaderId }, own)).statusCode).toBe(404);
      expect((await send("PATCH", `/${own.ministryId}`, { leaderId: foreign.leaderId }, own)).statusCode).toBe(404);
      expect((await send("POST", `/${own.ministryId}/members`, { personId: foreign.memberId }, own)).statusCode).toBe(404);
      expect((await send("DELETE", `/${own.ministryId}/members/${foreign.memberId}`, undefined, own)).statusCode).toBe(404);
      expect((await db.ministry.findUniqueOrThrow({ where: { id: own.ministryId } })).leaderId).toBe(own.leaderId);
      expect(await db.ministry.count({ where: { churchId: own.id } })).toBe(1);
    }
  });

  it("adds members/volunteers idempotently, removes links and preserves people on ministry deletion", async () => {
    for (const tenant of [a, b]) {
      for (const personId of [tenant.memberId, tenant.volunteerId, tenant.memberId]) expect((await send("POST", `/${tenant.ministryId}/members`, { personId }, tenant)).statusCode).toBe(200);
      const detail = (await send("GET", `/${tenant.ministryId}`, undefined, tenant)).json();
      expect(detail.members.map((row: { personId: string }) => row.personId).sort()).toEqual([tenant.memberId, tenant.volunteerId].sort());
      expect((await send("DELETE", `/${tenant.ministryId}/members/${tenant.memberId}`, undefined, tenant)).json().members).toHaveLength(1);
      expect((await send("DELETE", `/${tenant.ministryId}/members/${tenant.memberId}`, undefined, tenant)).statusCode).toBe(404);
      expect((await send("DELETE", `/${tenant.ministryId}`, undefined, tenant)).statusCode).toBe(200);
      expect(await db.ministryMember.count({ where: { churchId: tenant.id } })).toBe(0);
      expect(await db.person.count({ where: { churchId: tenant.id } })).toBe(4);
      expect((await db.person.findUniqueOrThrow({ where: { id: tenant.volunteerId } })).role).toBe("VOLUNTEER");
    }
  });

  it("rejects ineligible people but permits unlinking after a role change", async () => {
    expect((await send("POST", `/${a.ministryId}/members`, { personId: a.visitorId })).statusCode).toBe(409);
    expect((await send("POST", `/${a.ministryId}/members`, { personId: a.leaderId })).statusCode).toBe(409);
    await send("POST", `/${a.ministryId}/members`, { personId: a.memberId });
    await db.person.update({ where: { id: a.memberId }, data: { role: "LEADER" } });
    try { expect((await send("DELETE", `/${a.ministryId}/members/${a.memberId}`)).statusCode).toBe(200); }
    finally { await db.person.update({ where: { id: a.memberId }, data: { role: "MEMBER" } }); }
  });

  it.each([
    {}, { name: "   " }, { name: "x".repeat(121) }, { description: "x".repeat(4001) },
    { status: "DELETED" }, { leaderId: "" }, { leaderId: null }, { churchId: "forged" }, { role: "SUPER_ADMIN" }
  ])("validates PATCH input %# with Zod", async payload => {
    expect((await send("PATCH", `/${a.ministryId}`, payload)).statusCode).toBe(400);
  });
  it("validates creates and membership bodies, including mass-assignment attempts", async () => {
    for (const payload of [{}, { name: "Bad" }, { name: "Bad", leaderId: a.leaderId, churchId: b.id }]) expect((await send("POST", "", payload)).statusCode).toBe(400);
    for (const payload of [{}, { personId: " " }, { personId: a.memberId, churchId: b.id }]) expect((await send("POST", `/${a.ministryId}/members`, payload)).statusCode).toBe(400);
    expect(createMinistrySchema.parse({ name: "Good", leaderId: a.leaderId }).status).toBe("ACTIVE");
    expect(updateMinistrySchema.parse({ name: "Good" })).toEqual({ name: "Good" });
  });

  it("uses current account permissions and rejects disabled/missing/forged authentication", async () => {
    expect((await app.inject({ method: "GET", url: "/api/ministries" })).statusCode).toBe(401);
    const forged = app.jwt.sign({ userId: a.accounts.PASTOR!, churchId: b.id, role: "PASTOR" });
    expect((await app.inject({ method: "GET", url: "/api/ministries", headers: { authorization: `Bearer ${forged}` } })).statusCode).toBe(401);
    await db.userAccount.update({ where: { id: a.accounts.PASTOR! }, data: { role: "LEADER" } });
    expect((await send("POST", "", { name: "Denied", leaderId: a.leaderId })).statusCode).toBe(403);
    await db.userAccount.update({ where: { id: a.accounts.PASTOR! }, data: { status: "DISABLED" } });
    expect((await send("GET")).statusCode).toBe(403);
  });

  it("enforces tenant references in PostgreSQL even when bypassing the service", async () => {
    await expect(db.ministry.create({ data: { churchId: a.id, leaderId: b.leaderId, name: "Bad" } })).rejects.toMatchObject({ code: "P2003" });
    await expect(db.ministryMember.create({ data: { churchId: a.id, ministryId: a.ministryId, personId: b.memberId } })).rejects.toMatchObject({ code: "P2003" });
    await expect(db.ministryMember.create({ data: { churchId: a.id, ministryId: b.ministryId, personId: a.memberId } })).rejects.toMatchObject({ code: "P2003" });
    await expect(db.ministry.update({ where: { id: a.ministryId }, data: { churchId: b.id } })).rejects.toMatchObject({ code: "P2003" });
    expect(await db.ministryMember.count()).toBe(0);
  });
});
