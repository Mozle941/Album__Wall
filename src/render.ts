import sharp from "sharp";
import type { OutputFormat } from "./output-format";
export { OUTPUT_FORMATS } from "./output-format";
export type { OutputFormat } from "./output-format";

export interface Size {
  width: number;
  height: number;
}

/** Fit the full image inside the exact target canvas without changing its proportions. */
export async function renderWallpaper(art: Buffer, target: Size, format: OutputFormat = "png"): Promise<Buffer> {
  const contained = await sharp(art)
    .rotate()
    .resize(target.width, target.height, { fit: "inside", kernel: "lanczos3" })
    .png()
    .toBuffer();
  const { width = target.width, height = target.height } = await sharp(contained).metadata();
  const horizontal = target.width - width;
  const vertical = target.height - height;
  const padding = {
    left: Math.floor(horizontal / 2),
    right: Math.ceil(horizontal / 2),
    top: Math.floor(vertical / 2),
    bottom: Math.ceil(vertical / 2),
  };
  let image = sharp(contained);
  if (format === "jpeg") {
    image = image.extend({ ...padding, extendWith: "copy" });
  } else {
    image = image.extend({ ...padding, background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }
  switch (format) {
    case "jpeg": return image.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    case "webp": return image.webp({ quality: 92, effort: 5 }).toBuffer();
    case "png": return image.png({ compressionLevel: 9 }).toBuffer();
  }
}
