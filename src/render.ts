import sharp from "sharp";
import type { OutputFormat } from "./output-format";
export { OUTPUT_FORMATS } from "./output-format";
export type { OutputFormat } from "./output-format";

export interface Size {
  width: number;
  height: number;
}

/** Resize to the exact requested dimensions; retain all source content without cropping or adding a background. */
export async function renderWallpaper(art: Buffer, target: Size, format: OutputFormat = "png"): Promise<Buffer> {
  const image = sharp(art)
    .resize(target.width, target.height, {
      fit: "fill",
      kernel: "lanczos3",
    });
  switch (format) {
    case "jpeg": return image.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    case "webp": return image.webp({ quality: 92, effort: 5 }).toBuffer();
    case "png": return image.png({ compressionLevel: 9 }).toBuffer();
  }
}
