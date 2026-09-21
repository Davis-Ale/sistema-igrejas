import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@sistema-igrejas/database";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { buildApp } from "../src/app.js";

describe("Event cover upload", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let churchId = "";
  let eventId = "";
  let pastor = "";
  let leader = "";
  let otherTenant = "";
  const runId = `cover-${Date.now()}`;
  const headers = (token: string) => ({ authorization: `Bearer ${token}` });
  const url = () => `/api/events/${eventId}/cover`;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    const church = await prisma.church.create({ data: {
      name: runId, slug: runId, status: "ACTIVE", plan: "TRIAL"
    } });
    churchId = church.id;
    const event = await prisma.event.create({ data: {
      churchId, title: runId, slug: runId, date: new Date(), capacity: 10,
      participantMapImageUrl: "https://example.com/existing-map.png"
    } });
    eventId = event.id;
    pastor = app.jwt.sign({ userId: runId, churchId, role: "PASTOR" });
    leader = app.jwt.sign({ userId: runId, churchId, role: "LEADER" });
    otherTenant = app.jwt.sign({ userId: runId, churchId: `${churchId}-other`, role: "SUPER_ADMIN" });
  });

  afterAll(async () => {
    if (prisma) {
      // Delete only the isolated fixtures created by this suite.
      if (churchId) await prisma.church.delete({ where: { id: churchId } });
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  it("requires authentication, restricts uploads by role and isolates tenants", async () => {
    expect((await app.inject({ method: "GET", url: url() })).statusCode).toBe(401);
    expect((await app.inject({ method: "PUT", url: url(), payload: {}, headers: headers(leader) })).statusCode).toBe(403);
    expect((await app.inject({ method: "PUT", url: url(), payload: {}, headers: headers(otherTenant) })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: url(), headers: headers(pastor) })).statusCode).toBe(404);
  });

  it.each(["jpeg", "png"] as const)("stores and serves normalized %s without changing the map", async (format) => {
    const image = await sharp({ create: { width: 24, height: 12, channels: 3, background: "#2563eb" } }).toFormat(format).toBuffer();
    const upload = await app.inject({ method: "PUT", url: url(), headers: headers(pastor), payload: {
      mimeType: `image/${format}`, dataBase64: Buffer.concat([image, Buffer.from("<script>payload</script>")]).toString("base64")
    } });
    expect(upload.statusCode).toBe(200);
    const download = await app.inject({ method: "GET", url: url(), headers: headers(leader) });
    expect(download.statusCode).toBe(200);
    expect(download.headers["content-type"]).toBe(`image/${format}`);
    expect(download.headers["cache-control"]).toBe("private, no-store");
    expect(download.headers["x-content-type-options"]).toBe("nosniff");
    expect(download.rawPayload.includes(Buffer.from("<script>"))).toBe(false);
    expect((await sharp(download.rawPayload).metadata()).format).toBe(format);
    expect((await app.inject({ method: "GET", url: url(), headers: headers(otherTenant) })).statusCode).toBe(404);
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    expect(event.participantMapImageUrl).toBe("https://example.com/existing-map.png");
    expect(await prisma.eventAppMapImage.count({ where: { eventId } })).toBe(0);
    expect(await prisma.eventCoverImage.count({ where: { eventId } })).toBe(1);
  });

  it("rejects invalid content without overwriting the saved cover", async () => {
    const before = await prisma.eventCoverImage.findUniqueOrThrow({ where: { eventId } });
    for (const payload of [
      { mimeType: "image/svg+xml", dataBase64: "AAAA" },
      { mimeType: "image/png", dataBase64: Buffer.from("not an image").toString("base64") },
      { mimeType: "image/jpeg", dataBase64: "@@@@" },
      { mimeType: "image/png", dataBase64: Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64") }
    ]) {
      const result = await app.inject({ method: "PUT", url: url(), headers: headers(pastor), payload });
      expect(result.statusCode).toBe(400);
      expect(result.json().error).toBe("EVENT_COVER_IMAGE_INVALID");
    }
    const after = await prisma.eventCoverImage.findUniqueOrThrow({ where: { eventId } });
    expect(Buffer.from(after.data)).toEqual(Buffer.from(before.data));
  });

  it("does not expose or update a deleted event's cover", async () => {
    await prisma.event.update({ where: { id: eventId }, data: { deletedAt: new Date() } });
    expect((await app.inject({ method: "GET", url: url(), headers: headers(pastor) })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: url(), headers: headers(pastor), payload: {} })).statusCode).toBe(404);
  });
});
