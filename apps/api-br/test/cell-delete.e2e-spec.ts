import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@sistema-igrejas/database";
import type { FastifyInstance } from "fastify";
import request from "supertest";
import { buildApp } from "../src/app.js";

describe("Cell delete E2E", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient | null = null;
  let pastorToken = "";
  let superAdminToken = "";
  let otherTenantToken = "";
  let churchId = "";
  let emptyCellId = "";
  let historyCellId = "";
  let membershipId = "";

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const loginResponse = await request(app.server)
      .post("/auth/login")
      .send({
        email: "pastor@sistemaigrejas.local",
        password: "12345678"
      });

    expect(loginResponse.status).toBe(200);

    pastorToken = loginResponse.body.token as string;
    churchId = loginResponse.body.church.id as string;

    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required.");
    }

    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: databaseUrl
      })
    });

    const person = await prisma.person.findFirst({
      where: {
        churchId
      },
      select: {
        id: true
      }
    });

    expect(person).not.toBeNull();

    const personId = person!.id;
    const suffix = Date.now().toString();

    superAdminToken = await app.jwt.sign({
      userId: personId,
      churchId,
      role: "SUPER_ADMIN"
    });

    otherTenantToken = await app.jwt.sign({
      userId: personId,
      churchId: "other-church",
      role: "SUPER_ADMIN"
    });

    const emptyCell = await prisma.celula.create({
      data: {
        churchId,
        leaderId: personId,
        name: `E2E Delete Empty ${suffix}`,
        region: "E2E",
        state: "PR",
        city: "Curitiba",
        neighborhood: "E2E",
        meetDay: "segunda",
        meetTime: "20:00",
        profile: "Famílias"
      }
    });

    emptyCellId = emptyCell.id;

    const historyCell = await prisma.celula.create({
      data: {
        churchId,
        leaderId: personId,
        name: `E2E Delete History ${suffix}`,
        region: "E2E",
        state: "PR",
        city: "Curitiba",
        neighborhood: "E2E",
        meetDay: "terça",
        meetTime: "20:00",
        profile: "Famílias"
      }
    });

    historyCellId = historyCell.id;

    const membership = await prisma.membership.create({
      data: {
        churchId,
        personId,
        groupId: historyCellId,
        approvedBy: personId,
        removedAt: new Date(),
        removalNote: "Histórico criado pelo E2E."
      }
    });

    membershipId = membership.id;
  });

  afterAll(async () => {
    if (prisma) {
      if (membershipId) {
        await prisma.membership.deleteMany({
          where: {
            id: membershipId
          }
        });
      }

      await prisma.celula.deleteMany({
        where: {
          id: {
            in: [emptyCellId, historyCellId].filter(Boolean)
          }
        }
      });

      await prisma.$disconnect();
    }

    await app.close();
  });

  it("rejects delete without authentication", async () => {
    const response = await request(app.server)
      .delete(`/api/cells/${emptyCellId}`);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: "UNAUTHORIZED"
    });
  });

  it("rejects delete for pastor", async () => {
    const response = await request(app.server)
      .delete(`/api/cells/${emptyCellId}`)
      .set("Authorization", `Bearer ${pastorToken}`);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      error: "FORBIDDEN"
    });
  });

  it("does not delete a cell from another tenant", async () => {
    const response = await request(app.server)
      .delete(`/api/cells/${historyCellId}`)
      .set("Authorization", `Bearer ${otherTenantToken}`);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: "CELL_NOT_FOUND"
    });
  });

  it("rejects delete when historical membership exists", async () => {
    const response = await request(app.server)
      .delete(`/api/cells/${historyCellId}`)
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: "CELL_HAS_HISTORY"
    });

    const existingCell = await prisma!.celula.findUnique({
      where: {
        id: historyCellId
      },
      select: {
        id: true
      }
    });

    expect(existingCell).not.toBeNull();
  });

  it("returns 404 for a nonexistent cell", async () => {
    const response = await request(app.server)
      .delete("/api/cells/cell-that-does-not-exist")
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: "CELL_NOT_FOUND"
    });
  });

  it("deletes an empty cell without history", async () => {
    const response = await request(app.server)
      .delete(`/api/cells/${emptyCellId}`)
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: emptyCellId,
      deleted: true
    });

    const deletedCell = await prisma!.celula.findUnique({
      where: {
        id: emptyCellId
      },
      select: {
        id: true
      }
    });

    expect(deletedCell).toBeNull();
  });
});
