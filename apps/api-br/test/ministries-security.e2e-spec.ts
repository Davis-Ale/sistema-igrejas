import Fastify, { type FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import type { PrismaClient } from "@prisma/client";
import { createAuthPreHandler, type Role } from "@sistema-igrejas/auth";
import { registerMinistryRoutes } from "@sistema-igrejas/ministries";

// Real HTTP routes, Zod and JWT middleware; deterministic tenant-aware persistence.
describe("Ministries security without external services", () => {
  let app: FastifyInstance;
  let db: PrismaClient;
  let rows: any[];
  let links: any[];
  let people: any[];
  let accounts: any[];
  let domainReads: jest.Mock;
  let writes: jest.Mock;
  const roles: Role[] = ["SUPER_ADMIN", "PASTOR", "LEADER", "MEMBER", "VOLUNTEER"];

  function matches(row: any, where: any): boolean {
    return Object.entries(where ?? {}).every(([key, value]) => value && typeof value === "object" && "is" in value
      ? Boolean(row[key]) && matches(row[key], (value as any).is) : row[key] === value);
  }
  function project(row: any, select: any): any {
    return Object.fromEntries(Object.entries(select).map(([key, value]) => {
      if (value === true) return [key, row[key]];
      const relation = value as any;
      return [key, Array.isArray(row[key]) ? row[key].filter((item: any) => matches(item, relation.where)).map((item: any) => project(item, relation.select)) : project(row[key], relation.select)];
    }));
  }
  function joined(row: any) {
    return { ...row, leader: people.find(person => person.id === row.leaderId), members: links.filter(link => link.ministryId === row.id).map(link => ({ ...link, person: people.find(person => person.id === link.personId) })) };
  }

  beforeEach(async () => {
    domainReads = jest.fn(); writes = jest.fn(); links = [];
    people = ["a", "b"].flatMap(churchId => ["PASTOR", "MEMBER", "VOLUNTEER", "VISITOR"].map(role => ({ id: `${churchId}-${role}`, churchId, role, name: `${churchId} ${role}`, phone: "private" })));
    accounts = ["a", "b"].flatMap(churchId => roles.map(role => ({ id: `user-${churchId}-${role}`, churchId, role, status: "ACTIVE", person: null })));
    rows = ["a", "b"].map(churchId => ({ id: `ministry-${churchId}`, churchId, name: `Ministry ${churchId}`, description: "Existing", status: "INACTIVE", leaderId: `${churchId}-PASTOR`, createdAt: new Date(), updatedAt: new Date() }));
    const ministry = {
      findMany: jest.fn(async ({ where, select }) => { domainReads(); return rows.map(joined).filter(row => matches(row, where)).map(row => project(row, select)); }),
      findFirst: jest.fn(async ({ where, select }) => { domainReads(); const row = rows.map(joined).find(row => matches(row, where)); return row ? project(row, select) : null; }),
      create: jest.fn(async ({ data, select }) => { writes(); const row = { ...data, id: `created-${rows.length}`, createdAt: new Date(), updatedAt: new Date() }; rows.push(row); return project(joined(row), select); }),
      update: jest.fn(async ({ where, data, select }) => { const row = rows.find(row => matches(row, where)); if (!row) throw new Error("Missing"); writes(); Object.assign(row, data); return project(joined(row), select); }),
      delete: jest.fn(async ({ where }) => { const row = rows.find(row => matches(row, where)); if (!row) throw new Error("Missing"); writes(); rows = rows.filter(item => item !== row); links = links.filter(link => link.ministryId !== row.id); return row; })
    };
    db = {
      church: { findUnique: jest.fn(async ({ where }) => ({ id: where.id, status: "ACTIVE" })) },
      userAccount: { findUnique: jest.fn(async ({ where }) => accounts.find(account => account.id === where.id) ?? null) },
      person: {
        findFirst: jest.fn(async ({ where, select }) => { domainReads(); const person = people.find(person => matches(person, where)); return person ? project(person, select) : null; }),
        findMany: jest.fn(async ({ where, select }) => { domainReads(); return people.filter(person => matches(person, where)).map(person => project(person, select)); })
      }, ministry,
      ministryMember: {
        upsert: jest.fn(async ({ where, create }) => { writes(); if (!links.some(link => matches(link, where.churchId_ministryId_personId))) links.push({ ...create, createdAt: new Date() }); }),
        deleteMany: jest.fn(async ({ where }) => { const selected = links.filter(link => matches(link, where)); writes(); links = links.filter(link => !selected.includes(link)); return { count: selected.length }; })
      },
      $transaction: async (callback: any) => callback(db)
    } as unknown as PrismaClient;
    app = Fastify();
    await app.register(jwt, { secret: "ministries-security-tests-at-least-32-characters" });
    await app.register(async routes => { routes.addHook("preHandler", createAuthPreHandler(db)); await registerMinistryRoutes(routes, db); }, { prefix: "/api" });
    await app.ready();
  });
  afterEach(async () => { await app.close(); });
  function send(method: "GET" | "POST" | "PATCH" | "DELETE", suffix = "", payload?: object, role: Role = "PASTOR", churchId = "a") {
    return app.inject({ method, url: `/api/ministries${suffix}`, headers: { authorization: `Bearer ${app.jwt.sign({ userId: `user-${churchId}-${role}`, churchId, role })}` }, ...(payload === undefined ? {} : { payload }) });
  }

  it.each(["MEMBER", "VOLUNTEER"] as const)("denies %s on every endpoint before domain access", async role => {
    for (const churchId of ["a", "b"]) for (const [method, suffix, payload] of [
      ["GET", "", undefined], ["GET", "/people", undefined], ["GET", `/ministry-${churchId}`, undefined],
      ["POST", "", { name: "Denied", leaderId: `${churchId}-PASTOR` }], ["PATCH", `/ministry-${churchId}`, { name: "Denied" }],
      ["DELETE", `/ministry-${churchId}`, undefined], ["POST", `/ministry-${churchId}/members`, { personId: `${churchId}-MEMBER` }],
      ["DELETE", `/ministry-${churchId}/members/${churchId}-MEMBER`, undefined]
    ] as const) expect((await send(method, suffix, payload, role, churchId)).statusCode).toBe(403);
    expect(domainReads).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
  });
  it("allows leaders to read but denies all mutations", async () => {
    for (const churchId of ["a", "b"]) {
      for (const suffix of ["", "/people", `/ministry-${churchId}`]) expect((await send("GET", suffix, undefined, "LEADER", churchId)).statusCode).toBe(200);
      for (const [method, suffix, payload] of [
        ["POST", "", { name: "Denied", leaderId: `${churchId}-PASTOR` }], ["PATCH", `/ministry-${churchId}`, { name: "Denied" }],
        ["DELETE", `/ministry-${churchId}`, undefined], ["POST", `/ministry-${churchId}/members`, { personId: `${churchId}-MEMBER` }],
        ["DELETE", `/ministry-${churchId}/members/${churchId}-MEMBER`, undefined]
      ] as const) expect((await send(method, suffix, payload, "LEADER", churchId)).statusCode).toBe(403);
    }
    expect(writes).not.toHaveBeenCalled();
  });
  it.each(["SUPER_ADMIN", "PASTOR"] as const)("supports CRUD and memberships for %s in both tenants", async role => {
    for (const churchId of ["a", "b"]) {
      const created = await send("POST", "", { name: "  Louvor  ", leaderId: `${churchId}-PASTOR` }, role, churchId);
      expect(created.statusCode).toBe(201); expect(created.json()).toMatchObject({ name: "Louvor", status: "ACTIVE", description: "" });
      const id = created.json().id;
      expect((await send("PATCH", `/${id}`, { description: "Música", status: "INACTIVE", leaderId: `${churchId}-VOLUNTEER` }, role, churchId)).statusCode).toBe(200);
      const partial = await send("PATCH", `/${id}`, { name: "Novo nome" }, role, churchId);
      expect(partial.json()).toMatchObject({ description: "Música", status: "INACTIVE", leaderId: `${churchId}-VOLUNTEER` });
      for (const personId of [`${churchId}-MEMBER`, `${churchId}-VOLUNTEER`, `${churchId}-MEMBER`]) expect((await send("POST", `/${id}/members`, { personId }, role, churchId)).statusCode).toBe(200);
      expect((await send("GET", `/${id}`, undefined, role, churchId)).json().members).toHaveLength(2);
      expect((await send("DELETE", `/${id}/members/${churchId}-MEMBER`, undefined, role, churchId)).json().members).toHaveLength(1);
      expect((await send("DELETE", `/${id}`, undefined, role, churchId)).statusCode).toBe(200);
      expect((await send("GET", `/${id}`, undefined, role, churchId)).statusCode).toBe(404);
      expect(people.filter(person => person.churchId === churchId)).toHaveLength(4);
    }
  });
  it("blocks all foreign IDs in both directions without writes", async () => {
    for (const [own, foreign] of [["a", "b"], ["b", "a"]] as const) {
      for (const [method, suffix, payload] of [
        ["GET", `/ministry-${foreign}`, undefined], ["PATCH", `/ministry-${foreign}`, { name: "Stolen" }], ["DELETE", `/ministry-${foreign}`, undefined],
        ["POST", "", { name: "Bad", leaderId: `${foreign}-PASTOR` }], ["PATCH", `/ministry-${own}`, { leaderId: `${foreign}-PASTOR` }],
        ["POST", `/ministry-${own}/members`, { personId: `${foreign}-MEMBER` }], ["POST", `/ministry-${foreign}/members`, { personId: `${own}-MEMBER` }],
        ["DELETE", `/ministry-${own}/members/${foreign}-MEMBER`, undefined], ["DELETE", `/ministry-${foreign}/members/${own}-MEMBER`, undefined]
      ] as const) expect((await send(method, suffix, payload, "PASTOR", own)).statusCode).toBe(404);
      expect((await send("GET", "", undefined, "PASTOR", own)).json().map((row: any) => row.id)).toEqual([`ministry-${own}`]);
      expect((await send("GET", "/people", undefined, "PASTOR", own)).json().every((person: any) => person.id.startsWith(own) && !person.phone)).toBe(true);
    }
    expect(writes).not.toHaveBeenCalled();
  });
  it("filters inconsistent nested relations without exposing foreign people", async () => {
    links.push({ churchId: "b", ministryId: "ministry-a", personId: "b-MEMBER" }, { churchId: "a", ministryId: "ministry-a", personId: "b-VOLUNTEER" });
    expect((await send("GET", "/ministry-a")).json().members).toEqual([]);
    rows[0].leaderId = "b-PASTOR";
    expect((await send("GET", "/ministry-a")).statusCode).toBe(404);
  });
  it.each([{}, { name: " " }, { name: "x".repeat(121) }, { description: "x".repeat(4001) }, { status: "DELETED" }, { leaderId: "" }, { leaderId: null }, { churchId: "b" }, { role: "SUPER_ADMIN" }])("returns 400 for invalid PATCH %# without domain reads", async payload => {
    expect((await send("PATCH", "/ministry-a", payload)).statusCode).toBe(400);
    expect(domainReads).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
  });
  it("validates create and membership bodies and rejects ineligible people", async () => {
    for (const payload of [{}, { name: "Bad" }, { name: "Bad", leaderId: "a-PASTOR", churchId: "b" }]) expect((await send("POST", "", payload)).statusCode).toBe(400);
    for (const payload of [{}, { personId: " " }, { personId: "a-MEMBER", churchId: "b" }]) expect((await send("POST", "/ministry-a/members", payload)).statusCode).toBe(400);
    for (const personId of ["a-PASTOR", "a-VISITOR"]) expect((await send("POST", "/ministry-a/members", { personId })).statusCode).toBe(409);
    expect(writes).not.toHaveBeenCalled();
  });
  it("revalidates account role and tenant, and rejects missing authentication", async () => {
    expect((await app.inject({ method: "GET", url: "/api/ministries" })).statusCode).toBe(401);
    const token = app.jwt.sign({ userId: "user-a-PASTOR", churchId: "b", role: "PASTOR" });
    expect((await app.inject({ method: "GET", url: "/api/ministries", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
    accounts.find(account => account.id === "user-a-PASTOR").role = "MEMBER";
    expect((await send("GET")).statusCode).toBe(403);
    expect(domainReads).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
  });
  it("maps database conflicts without exposing internal errors", async () => {
    (db.ministry.create as jest.Mock).mockRejectedValueOnce({ code: "P2034", message: "private database details" });
    const response = await send("POST", "", { name: "Conflict", leaderId: "a-PASTOR" });
    expect(response.statusCode).toBe(409); expect(response.body).not.toContain("private database");
  });
});
