import type { FastifyInstance } from "fastify";
import request from "supertest";
import { buildApp } from "../src/app.js";

describe("Cell status E2E", () => {
  let app: FastifyInstance;
  let token = "";
  let cellId = "";

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
    expect(typeof loginResponse.body.token).toBe("string");

    token = loginResponse.body.token as string;

    const cellsResponse = await request(app.server)
      .get("/api/cells/search?page=1&pageSize=1")
      .set("Authorization", `Bearer ${token}`);

    expect(cellsResponse.status).toBe(200);
    expect(cellsResponse.body.items.length).toBeGreaterThan(0);

    cellId = cellsResponse.body.items[0].id as string;
  });

  afterAll(async () => {
    if (token && cellId) {
      await request(app.server)
        .patch(`/api/cells/${cellId}/reactivate`)
        .set("Authorization", `Bearer ${token}`);
    }

    await app.close();
  });

  it("rejects archive without authentication", async () => {
    const response = await request(app.server)
      .patch(`/api/cells/${cellId}/archive`);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: "UNAUTHORIZED"
    });
  });

  it("returns only active cells by default with lifecycle fields", async () => {
    const response = await request(app.server)
      .get("/api/cells/search?page=1&pageSize=100")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.items.length).toBeGreaterThan(0);
    expect(
      response.body.items.every(
        (cell: { status: string }) => cell.status === "ACTIVE"
      )
    ).toBe(true);

    for (const cell of response.body.items) {
      expect(cell).toHaveProperty("status");
      expect(cell).toHaveProperty("archivedAt");
    }
  });

  it("archives, filters and reactivates a cell", async () => {
    const archiveResponse = await request(app.server)
      .patch(`/api/cells/${cellId}/archive`)
      .set("Authorization", `Bearer ${token}`);

    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.body).toMatchObject({
      id: cellId,
      status: "ARCHIVED"
    });
    expect(archiveResponse.body.archivedAt).not.toBeNull();

    try {
      const defaultResponse = await request(app.server)
        .get("/api/cells/search?page=1&pageSize=100")
        .set("Authorization", `Bearer ${token}`);

      expect(defaultResponse.status).toBe(200);
      expect(
        defaultResponse.body.items.some(
          (cell: { id: string }) => cell.id === cellId
        )
      ).toBe(false);

      const archivedResponse = await request(app.server)
        .get(
          "/api/cells/search?page=1&pageSize=100&status=ARCHIVED"
        )
        .set("Authorization", `Bearer ${token}`);

      expect(archivedResponse.status).toBe(200);
      expect(
        archivedResponse.body.items.every(
          (cell: { status: string }) =>
            cell.status === "ARCHIVED"
        )
      ).toBe(true);
      expect(
        archivedResponse.body.items.some(
          (cell: { id: string }) => cell.id === cellId
        )
      ).toBe(true);

      const allResponse = await request(app.server)
        .get("/api/cells/search?page=1&pageSize=100&status=ALL")
        .set("Authorization", `Bearer ${token}`);

      expect(allResponse.status).toBe(200);
      expect(
        allResponse.body.items.some(
          (cell: { id: string }) => cell.id === cellId
        )
      ).toBe(true);
      expect(
        allResponse.body.items.every(
          (cell: { status: string }) =>
            cell.status === "ACTIVE" ||
            cell.status === "ARCHIVED"
        )
      ).toBe(true);
    } finally {
      const reactivateResponse = await request(app.server)
        .patch(`/api/cells/${cellId}/reactivate`)
        .set("Authorization", `Bearer ${token}`);

      expect(reactivateResponse.status).toBe(200);
      expect(reactivateResponse.body).toMatchObject({
        id: cellId,
        status: "ACTIVE",
        archivedAt: null
      });
    }
  });

  it("returns 404 for a nonexistent cell", async () => {
    const response = await request(app.server)
      .patch("/api/cells/cell-that-does-not-exist/archive")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: "CELL_NOT_FOUND"
    });
  });
});
