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
  it("directly fills portrait and landscape target dimensions without adding a background", async () => {
    for (const target of [
      { width: 1080, height: 2400 },
      { width: 1920, height: 1080 },
    ]) {
      const out = await renderWallpaper(await redArt(), target);
      const meta = await sharp(out).metadata();
      expect(meta.width).toBe(target.width);
      expect(meta.height).toBe(target.height);
      expect(meta.format).toBe("png");
      const corner = await pixel(out, 0, 0);
      const centre = await pixel(out, Math.floor(target.width / 2), Math.floor(target.height / 2));
      expect(corner).toEqual({ r: 255, g: 0, b: 0 });
      expect(centre).toEqual({ r: 255, g: 0, b: 0 });
    }
  });

  it("upscales small artwork to the requested size", async () => {
    const out = await renderWallpaper(await redArt(8, 12), { width: 320, height: 480 });
    const meta = await sharp(out).metadata();
    expect(meta).toMatchObject({ width: 320, height: 480, format: "png" });
    expect(await pixel(out, 0, 0)).toEqual({ r: 255, g: 0, b: 0 });
  });
});
