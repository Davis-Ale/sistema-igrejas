import Fastify, { type FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import type { PrismaClient } from "@prisma/client";
import {
  canAccessCampus, canAccessChurch, createAuthPreHandler, getJwtSecret,
  hashPassword, registerAuthRoutes, requireRole, signToken, type JWTPayload, type Role
} from "@sistema-igrejas/auth";
import { buildApp as buildMainApi } from "../src/app.js";
import { buildApp as buildEventsApi } from "../../events-api/src/app.js";

const secret = "auth-tests-only-6eafb526acb540edbfe87ec778b72b51";
const roles: Role[] = ["SUPER_ADMIN", "PASTOR", "LEADER", "VOLUNTEER", "MEMBER"];

describe("Required JWT configuration", () => {
  it.each([undefined, "", "   "])("rejects missing or blank configuration: %j", value => {
    expect(() => getJwtSecret(value === undefined ? {} : { JWT_SECRET: value })).toThrow("JWT_SECRET is required.");
  });

  it.each(["dev-secret-change-me", "short-secret"])("rejects weak configuration: %s", value => {
    expect(() => getJwtSecret({ JWT_SECRET: value })).toThrow("at least 32 characters");
  });

  it("preserves the explicitly configured project secret", () => {
    expect(getJwtSecret({ JWT_SECRET: secret })).toBe(secret);
  });

  it.each([["api-br", buildMainApi], ["events-api", buildEventsApi]] as const)(
    "%s fails before creating resources when JWT_SECRET is absent", async (_name, build) => {
      const previous = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      try {
        await expect(build()).rejects.toThrow("JWT_SECRET is required.");
      } finally {
        if (previous === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = previous;
      }
    }
  );
});

// Real JWT signatures, authentication middleware, login and operation guards.
// Only persistence is replaced by mutable, tenant-aware fixtures.
describe("Auth/JWT security", () => {
  let app: FastifyInstance;
  let passwordHash: string;
  let accounts: Array<{
    id: string; email: string; churchId: string; role: Role; status: string; passwordHash: string;
    church: { id: string; status: string };
    person: null | { churchId: string; campusId: string; campus: { churchId: string } };
  }>;
  let findAccount: jest.Mock;
  let operation: jest.Mock;

  beforeAll(async () => { passwordHash = await hashPassword("test-password-123"); });

  beforeEach(async () => {
    accounts = ["a", "b"].map(churchId => ({
      id: `user-${churchId}`, email: `${churchId}@example.test`, churchId,
      role: "PASTOR", status: "ACTIVE", passwordHash, person: null,
      church: { id: churchId, status: "ACTIVE" }
    }));
    findAccount = jest.fn(async ({ where }) => accounts.find(account =>
      Object.entries(where).every(([key, value]) => account[key as keyof typeof account] === value)) ?? null);
    const db = {
      userAccount: { findUnique: findAccount, update: jest.fn(async () => ({})) },
      church: { findUnique: jest.fn(async ({ where }) => accounts.find(account => account.churchId === where.id)?.church ?? null) }
    } as unknown as PrismaClient;
    operation = jest.fn(async () => ({ ok: true }));
    app = Fastify();
    await app.register(jwt, { secret: getJwtSecret({ JWT_SECRET: secret }) });
    await registerAuthRoutes(app, db);
    await app.register(async protectedRoutes => {
      protectedRoutes.addHook("preHandler", createAuthPreHandler(db));
      protectedRoutes.get("/session", async request => request.user);
      protectedRoutes.post("/operation", { preHandler: requireRole(["SUPER_ADMIN", "PASTOR"]) }, operation);
      protectedRoutes.delete("/operation", { preHandler: requireRole(["SUPER_ADMIN"]) }, operation);
      protectedRoutes.get<{ Params: { churchId: string } }>("/church/:churchId", async (request, reply) => {
        if (!canAccessChurch(request, request.params.churchId)) return reply.code(403).send();
        return { churchId: request.churchId };
      });
      protectedRoutes.get<{ Params: { campusId: string } }>("/campus/:campusId", async (request, reply) => {
        if (!canAccessCampus(request, request.params.campusId)) return reply.code(403).send();
        return { campusId: request.campusId };
      });
    }, { prefix: "/auth-test" });
    await app.ready();
  });

  afterEach(async () => { await app.close(); });

  function token(overrides: Partial<JWTPayload> = {}) {
    return signToken(app, { userId: "user-a", churchId: "a", role: "PASTOR", ...overrides });
  }
  async function session(signedToken: string) {
    return app.inject({ url: "/auth-test/session", headers: { authorization: `Bearer ${signedToken}` } });
  }

  it("keeps project login and the eight-hour JWT lifetime", async () => {
    const login = await app.inject({ method: "POST", url: "/auth/login", payload: {
      email: "a@example.test", password: "test-password-123"
    } });
    expect(login.statusCode).toBe(200);
    const claims = app.jwt.decode<{ exp: number; iat: number }>(login.json().token)!;
    expect(claims.exp - claims.iat).toBe(8 * 60 * 60);
    expect((await session(login.json().token)).json()).toMatchObject({ userId: "user-a", churchId: "a", role: "PASTOR" });
  });

  it("rejects absent and malformed Bearer headers", async () => {
    for (const authorization of [undefined, "Basic abc", `Bearer ${await token()} extra`]) {
      const response = await app.inject({ url: "/auth-test/session", headers: authorization ? { authorization } : {} });
      expect(response.statusCode).toBe(401);
    }
    expect(findAccount).not.toHaveBeenCalled();
  });

  it("rejects invalid, tampered and expired tokens before consulting persistence", async () => {
    const valid = await token();
    const parts = valid.split(".");
    parts[1] = Buffer.from(JSON.stringify({ userId: "user-a", churchId: "b", role: "SUPER_ADMIN" })).toString("base64url");
    const expired = app.jwt.sign({ userId: "user-a", churchId: "a", role: "PASTOR" }, { expiresIn: -10 });
    for (const invalid of ["not-a-jwt", parts.join("."), expired]) {
      const response = await session(invalid);
      expect(response.statusCode).toBe(401);
      expect(response.json().error).toBe("INVALID_TOKEN");
    }
    expect(findAccount).not.toHaveBeenCalled();
  });

  it.each([{ userId: 123 }, { churchId: "" }, { role: "OWNER" }])("rejects malformed signed claims: %j", override => {
    return session(app.jwt.sign({ userId: "user-a", churchId: "a", role: "PASTOR", ...override } as JWTPayload))
      .then(response => {
        expect(response.statusCode).toBe(401);
        expect(findAccount).not.toHaveBeenCalled();
      });
  });

  it.each(["PASTOR", "SUPER_ADMIN"] as Role[])("revokes an old token immediately when a %s account is disabled", async role => {
    accounts[0]!.role = role;
    const oldToken = await token({ role });
    expect((await session(oldToken)).statusCode).toBe(200);
    accounts[0]!.status = "DISABLED";
    const response = await session(oldToken);
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("ACCOUNT_DISABLED");
    expect((await app.inject({ method: "POST", url: "/auth-test/operation", headers: { authorization: `Bearer ${oldToken}` } })).statusCode).toBe(403);
    expect(operation).not.toHaveBeenCalled();
    expect((await app.inject({ method: "POST", url: "/auth/login", payload: { email: "a@example.test", password: "test-password-123" } })).statusCode).toBe(403);
  });

  it("rejects a token after the account is deleted", async () => {
    const oldToken = await token();
    accounts.shift();
    expect((await session(oldToken)).statusCode).toBe(401);
  });

  it.each(roles)("enforces distinct operation permissions for current role %s", async role => {
    accounts[0]!.role = role;
    const headers = { authorization: `Bearer ${await token({ role })}` };
    expect((await app.inject({ url: "/auth-test/session", headers })).statusCode).toBe(200);
    for (const method of ["POST", "DELETE"] as const) {
      const allowed = role === "SUPER_ADMIN" || (method === "POST" && role === "PASTOR");
      expect((await app.inject({ method, url: "/auth-test/operation", headers })).statusCode).toBe(allowed ? 200 : 403);
    }
    expect(operation).toHaveBeenCalledTimes(role === "SUPER_ADMIN" ? 2 : role === "PASTOR" ? 1 : 0);
  });

  it("does not retain old privileges after a role change", async () => {
    accounts[0]!.role = "SUPER_ADMIN";
    const oldToken = await token({ role: "SUPER_ADMIN" });
    accounts[0]!.role = "MEMBER";
    expect((await session(oldToken)).json().role).toBe("MEMBER");
    expect((await app.inject({ method: "DELETE", url: "/auth-test/operation", headers: { authorization: `Bearer ${oldToken}` } })).statusCode).toBe(403);
    expect(operation).not.toHaveBeenCalled();
  });

  it("does not retain the administrator church-status bypass after demotion", async () => {
    accounts[0]!.role = "SUPER_ADMIN";
    const oldToken = await token({ role: "SUPER_ADMIN" });
    accounts[0]!.role = "MEMBER";
    accounts[0]!.church.status = "BLOCKED";
    const response = await session(oldToken);
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("CHURCH_BLOCKED");
  });

  it.each(["PASTOR", "SUPER_ADMIN"] as Role[])("isolates two churches for %s including mismatched signed claims", async role => {
    for (const account of accounts) account.role = role;
    for (const churchId of ["a", "b"]) {
      const signedToken = await token({ userId: `user-${churchId}`, churchId, role });
      const headers = { authorization: `Bearer ${signedToken}` };
      const foreign = churchId === "a" ? "b" : "a";
      expect((await app.inject({ url: `/auth-test/church/${churchId}`, headers })).statusCode).toBe(200);
      expect((await app.inject({ url: `/auth-test/church/${foreign}`, headers })).statusCode).toBe(403);
      expect((await session(await token({ userId: `user-${churchId}`, churchId: foreign, role }))).statusCode).toBe(401);
    }
  });

  it("revokes old tenant context after account transfer", async () => {
    const oldToken = await token();
    accounts[0]!.churchId = "b";
    expect((await session(oldToken)).statusCode).toBe(401);
  });

  it("uses current campus context and rejects inconsistent related ownership", async () => {
    accounts[0]!.person = { churchId: "a", campusId: "current-campus", campus: { churchId: "a" } };
    const oldToken = await token({ campusId: "old-campus" });
    expect((await session(oldToken)).json().campusId).toBe("current-campus");
    const headers = { authorization: `Bearer ${oldToken}` };
    expect((await app.inject({ url: "/auth-test/campus/old-campus", headers })).statusCode).toBe(403);
    accounts[0]!.person.campus.churchId = "b";
    expect((await session(oldToken)).statusCode).toBe(401);
    accounts[0]!.person = null;
    expect((await session(oldToken)).json()).not.toHaveProperty("campusId");
  });

  it("fails closed when the account lookup is unavailable", async () => {
    findAccount.mockRejectedValue(new Error("database unavailable"));
    const response = await app.inject({ method: "POST", url: "/auth-test/operation", headers: { authorization: `Bearer ${await token()}` } });
    expect(response.statusCode).toBe(503);
    expect(operation).not.toHaveBeenCalled();
  });
});
