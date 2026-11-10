import sharp from "sharp";

export interface Size {
  width: number;
  height: number;
}

/** Resize artwork to fill the requested frame; Sharp upscales smaller inputs by default. */
export async function renderWallpaper(art: Buffer, target: Size): Promise<Buffer> {
  return sharp(art)
    .resize(target.width, target.height, {
      fit: "cover",
      position: "centre",
      kernel: "lanczos3",
    })
    .png()
    .toBuffer();
}
