import sharp from "sharp";

export const LAYOUTS = ["blur", "solid"] as const;
export type Layout = (typeof LAYOUTS)[number];

export interface RenderOptions {
  layout?: Layout;
  /** Foreground art side as a fraction of the shorter wallpaper edge. Default 0.8. */
  artScale?: number;
}

export interface Size {
  width: number;
  height: number;
}

export function foregroundSide(target: Size, artScale = 0.8): number {
  return Math.round(Math.min(target.width, target.height) * artScale);
}

export async function renderWallpaper(
  art: Buffer,
  target: Size,
  opts: RenderOptions = {},
): Promise<Buffer> {
  const { layout = "blur", artScale = 0.8 } = opts;
  const side = foregroundSide(target, artScale);

  const background =
    layout === "blur"
      ? await sharp(art)
          .resize(target.width, target.height, { fit: "cover" })
          .blur(40)
          .modulate({ brightness: 0.7 })
          .toBuffer()
      : await solidBackground(art, target);

  const foreground = await sharp(art)
    .resize(side, side, { fit: "cover", kernel: "lanczos3" })
    .toBuffer();

  return sharp(background)
    .composite([{ input: foreground, gravity: "centre" }])
    .png()
    .toBuffer();
}

async function solidBackground(art: Buffer, target: Size): Promise<Buffer> {
  const { dominant } = await sharp(art).stats();
  return sharp({
    create: {
      width: target.width,
      height: target.height,
      channels: 3,
      background: { r: dominant.r, g: dominant.g, b: dominant.b },
    },
  })
    .png()
    .toBuffer();
}
