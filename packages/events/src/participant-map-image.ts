import sharp from "sharp";

export const MAX_MAP_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_MAP_IMAGE_BASE64 = 4 * Math.ceil(MAX_MAP_IMAGE_BYTES / 3);

export async function validateMapImage(input: { mimeType: "image/png" | "image/jpeg"; dataBase64: string }) {
  try {
    if (!input.dataBase64 || input.dataBase64.length > MAX_MAP_IMAGE_BASE64 ||
      input.dataBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.dataBase64)) {
      throw new Error("INVALID_IMAGE");
    }
    const data = Buffer.from(input.dataBase64, "base64");
    if (!data.length || data.length > MAX_MAP_IMAGE_BYTES || data.toString("base64") !== input.dataBase64) throw new Error("INVALID_IMAGE");
    const png = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = data[0] === 255 && data[1] === 216 && data[2] === 255;
    if ((input.mimeType === "image/png" && !png) || (input.mimeType === "image/jpeg" && !jpeg)) {
      throw new Error("INVALID_IMAGE");
    }
    const image = sharp(data, { limitInputPixels: 16_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (metadata.format !== (png ? "png" : "jpeg") || (metadata.pages ?? 1) !== 1) throw new Error("INVALID_IMAGE");
    // Decode and re-encode: discard metadata and any appended non-image payload.
    const normalized = await (png ? image.rotate().png() : image.rotate().jpeg({ quality: 90 })).toBuffer();
    if (normalized.length > MAX_MAP_IMAGE_BYTES) throw new Error("INVALID_IMAGE");
    return { data: new Uint8Array(normalized), contentType: input.mimeType };
  } catch {
    throw new Error("EVENT_APP_MAP_IMAGE_INVALID");
  }
}
