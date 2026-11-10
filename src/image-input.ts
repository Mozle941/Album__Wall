import sharp from "sharp";
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export type AcceptedImageFormat = "png" | "jpeg" | "webp";
export class ImageInputError extends Error {
  constructor(public status: 400 | 413 | 415, message: string) { super(message); }
}
export async function validateImage(input: Buffer): Promise<{ format: AcceptedImageFormat; width: number; height: number }> {
  if (!input.length) throw new ImageInputError(400, "Image file is empty");
  if (input.length > MAX_IMAGE_BYTES) throw new ImageInputError(413, "Image exceeds the 10 MiB upload limit");
  try {
    const image = sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, animated: false, pages: 1, failOn: "error" });
    const meta = await image.metadata();
    if (!meta.width || !meta.height || !["png", "jpeg", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) !== 1) {
      throw new ImageInputError(415, "Upload a single-frame PNG, JPEG, or WebP image");
    }
    if (meta.width * meta.height > MAX_IMAGE_PIXELS) throw new ImageInputError(413, "Decoded image exceeds the 40 million pixel limit");
    await image.clone().rotate().metadata();
    return { format: meta.format as AcceptedImageFormat, width: meta.width, height: meta.height };
  } catch (err) {
    if (err instanceof ImageInputError) throw err;
    throw new ImageInputError(415, "Invalid or unsupported image; upload a single-frame PNG, JPEG, or WebP");
  }
}
