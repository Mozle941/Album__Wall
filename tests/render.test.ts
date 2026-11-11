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

async function rgbaPixel(buf: Buffer, left: number, top: number) {
  const raw = await sharp(buf).ensureAlpha().extract({ left, top, width: 1, height: 1 }).raw().toBuffer();
  return [...raw];
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

  it("preserves a circular subject on a portrait canvas with transparent padding", async () => {
    const size = 100;
    const raw = Buffer.alloc(size * size * 3, 255);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if ((x - 50) ** 2 + (y - 50) ** 2 <= 20 ** 2) {
          const index = (y * size + x) * 3;
          raw[index] = raw[index + 1] = raw[index + 2] = 0;
        }
      }
    }
    const art = await sharp(raw, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
    for (const format of ["png", "webp"] as const) {
      const out = await renderWallpaper(art, { width: 90, height: 160 }, format);
      expect(await sharp(out).metadata()).toMatchObject({ width: 90, height: 160, format });
      expect((await rgbaPixel(out, 45, 0))[3]).toBe(0);
      const { data, info } = await sharp(out).extract({ left: 0, top: 35, width: 90, height: 90 }).greyscale().raw().toBuffer({ resolveWithObject: true });
      let minX = info.width, maxX = -1, minY = info.height, maxY = -1;
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          if (data[y * info.width + x] < 128) {
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          }
        }
      }
      const ratio = (maxY - minY + 1) / (maxX - minX + 1);
      expect(ratio).toBeGreaterThan(0.95);
      expect(ratio).toBeLessThan(1.05);
    }
  });

  it("extends JPEG margins from image-edge pixels rather than a flat color", async () => {
    const width = 40, height = 20;
    const raw = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 3;
        const topHalf = y < height / 2;
        raw[index] = topHalf ? 235 : 20;
        raw[index + 1] = topHalf ? 30 : 45;
        raw[index + 2] = topHalf ? 25 : 225;
      }
    }
    const art = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const out = await renderWallpaper(art, { width: 100, height: 100 }, "jpeg");
    expect(await sharp(out).metadata()).toMatchObject({ width: 100, height: 100, format: "jpeg" });
    const top = await pixel(out, 50, 0);
    const bottom = await pixel(out, 50, 99);
    expect(top.r).toBeGreaterThan(180);
    expect(top.b).toBeLessThan(80);
    expect(bottom.r).toBeLessThan(70);
    expect(bottom.b).toBeGreaterThan(170);
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
