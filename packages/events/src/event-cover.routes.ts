import { requireRole } from "@sistema-igrejas/auth";
import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z, ZodError } from "zod";
import { eventIdParamsSchema } from "./event.schema.js";
import { MAX_MAP_IMAGE_BASE64, validateMapImage } from "./participant-map-image.js";

const coverSchema = z.object({
  mimeType: z.enum(["image/png", "image/jpeg"]),
  dataBase64: z.string().min(1).max(MAX_MAP_IMAGE_BASE64)
});

function sendCoverError(error: unknown, reply: FastifyReply) {
  if (error instanceof ZodError || (error instanceof Error && error.message === "EVENT_APP_MAP_IMAGE_INVALID")) {
    return reply.code(400).send({ error: "EVENT_COVER_IMAGE_INVALID",
      message: "Selecione uma imagem JPG ou PNG válida, de até 5 MB e 16 megapixels." });
  }
  return reply.code(500).send({ error: "INTERNAL_SERVER_ERROR", message: "Não foi possível carregar ou salvar a capa." });
}

export async function registerEventCoverRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get("/events/:eventId/cover", async (request, reply) => {
    if (!request.churchId) return reply.code(401).send({ error: "UNAUTHORIZED" });
    try {
      const { eventId } = eventIdParamsSchema.parse(request.params);
      const image = await prisma.eventCoverImage.findFirst({
        where: { eventId, event: { churchId: request.churchId, deletedAt: null } },
        select: { data: true, contentType: true }
      });
      if (!image) return reply.code(404).send({ error: "EVENT_COVER_IMAGE_NOT_FOUND" });
      return reply.header("Cache-Control", "private, no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .header("Content-Disposition", `inline; filename="capa.${image.contentType === "image/png" ? "png" : "jpg"}"`)
        .type(image.contentType).send(Buffer.from(image.data));
    } catch (error) { return sendCoverError(error, reply); }
  });

  app.put("/events/:eventId/cover", {
    preHandler: requireRole(["SUPER_ADMIN", "PASTOR"]), bodyLimit: 7 * 1024 * 1024
  }, async (request, reply) => {
    if (!request.churchId) return reply.code(401).send({ error: "UNAUTHORIZED" });
    try {
      const { eventId } = eventIdParamsSchema.parse(request.params);
      const event = await prisma.event.findFirst({
        where: { id: eventId, churchId: request.churchId, deletedAt: null }, select: { id: true }
      });
      if (!event) return reply.code(404).send({ error: "EVENT_NOT_FOUND", message: "Evento não encontrado." });
      const image = await validateMapImage(coverSchema.parse(request.body));
      const saved = await prisma.eventCoverImage.upsert({
        where: { eventId }, create: { eventId, ...image }, update: image,
        select: { updatedAt: true }
      });
      return { updatedAt: saved.updatedAt.toISOString() };
    } catch (error) { return sendCoverError(error, reply); }
  });
}
