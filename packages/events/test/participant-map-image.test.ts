import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { validateMapImage, MAX_MAP_IMAGE_BYTES } from "../src/participant-map-image.ts";

test("JPG and PNG are decoded and normalized without appended content", async () => {
  for (const format of ["png", "jpeg"] as const) {
    const source = await sharp({ create: { width: 12, height: 8, channels: 3, background: "#4477aa" } }).toFormat(format).toBuffer();
    const input = Buffer.concat([source, Buffer.from("<script>untrusted payload</script>")]);
    const result = await validateMapImage({ mimeType: `image/${format}`, dataBase64: input.toString("base64") });
    const decoded = await sharp(result.data).metadata();
    assert.equal(decoded.format, format);
    assert.equal(decoded.width, 12);
    assert.equal(Buffer.from(result.data).includes(Buffer.from("<script>")), false);
  }
});

test("rejects fake MIME, malformed base64, SVG, truncated and oversized images", async () => {
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).png().toBuffer();
  for (const input of [
    { mimeType: "image/jpeg" as const, dataBase64: png.toString("base64") },
    { mimeType: "image/png" as const, dataBase64: "@@@@" },
    { mimeType: "image/png" as const, dataBase64: Buffer.from("<svg onload='alert(1)'/>").toString("base64") },
    { mimeType: "image/png" as const, dataBase64: png.subarray(0, 16).toString("base64") },
    { mimeType: "image/png" as const, dataBase64: Buffer.alloc(MAX_MAP_IMAGE_BYTES + 1).toString("base64") }
  ]) await assert.rejects(validateMapImage(input), /EVENT_APP_MAP_IMAGE_INVALID/);
});

test("rejects dimensions above the decompression limit", async () => {
  const large = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(validateMapImage({ mimeType: "image/png", dataBase64: large.toString("base64") }), /EVENT_APP_MAP_IMAGE_INVALID/);
});
