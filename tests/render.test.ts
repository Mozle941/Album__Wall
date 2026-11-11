import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { renderWallpaper } from "../src/render";

async function redArt(width = 640, height = 640) {
  return sharp({ create: { width, height, channels: 3, background: "#ff0000" } })
    .png()
    .toBuffer();
}

async function pixel(buf: Buffer, left: number, top: number) {
  const raw = await sharp(buf).extract({ left, top, width: 1, height: 1 }).raw().toBuffer();
  return { r: raw[0], g: raw[1], b: raw[2] };
}

describe("renderWallpaper", () => {
  it("resizes to exact target bounds, retains edge content, and adds no background", async () => {
    const art = await sharp({ create: { width: 100, height: 50, channels: 3, background: "#0000ff" } })
      .composite([{ input: { create: { width: 5, height: 50, channels: 3, background: "#ff0000" } }, left: 0, top: 0 }])
      .png()
      .toBuffer();
    const out = await renderWallpaper(art, { width: 200, height: 200 });
    const meta = await sharp(out).metadata();
    expect(meta).toMatchObject({ width: 200, height: 200, format: "png" });
    expect(await pixel(out, 0, 100)).toEqual({ r: 255, g: 0, b: 0 });
    expect(await pixel(out, 199, 100)).toEqual({ r: 0, g: 0, b: 255 });
  });

  it("upscales small artwork proportionally within the requested bounds", async () => {
    const out = await renderWallpaper(await redArt(8, 12), { width: 320, height: 480 });
    const meta = await sharp(out).metadata();
    expect(meta).toMatchObject({ width: 320, height: 480, format: "png" });
    expect(await pixel(out, 0, 0)).toEqual({ r: 255, g: 0, b: 0 });
  });

  it.each([
    ["jpeg", "jpeg"],
    ["png", "png"],
    ["webp", "webp"],
  ] as const)("encodes valid %s output", async (format, expectedFormat) => {
    const out = await renderWallpaper(await redArt(80, 40), { width: 160, height: 160 }, format);
    expect(await sharp(out).metadata()).toMatchObject({ width: 160, height: 160, format: expectedFormat });
  });
});
