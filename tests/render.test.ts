import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { foregroundSide, renderWallpaper } from "../src/render";

async function redArt(size = 640) {
  return sharp({ create: { width: size, height: size, channels: 3, background: "#ff0000" } })
    .png()
    .toBuffer();
}

async function pixel(buf: Buffer, left: number, top: number) {
  const raw = await sharp(buf).extract({ left, top, width: 1, height: 1 }).raw().toBuffer();
  return { r: raw[0], g: raw[1], b: raw[2] };
}

describe("foregroundSide", () => {
  it("scales against the shorter edge", () => {
    expect(foregroundSide({ width: 1080, height: 2400 })).toBe(864);
    expect(foregroundSide({ width: 3840, height: 2160 }, 0.5)).toBe(1080);
  });
});

describe("renderWallpaper", () => {
  it("outputs exact target dimensions for portrait and landscape (blur)", async () => {
    for (const target of [
      { width: 1080, height: 2400 },
      { width: 1920, height: 1080 },
    ]) {
      const out = await renderWallpaper(await redArt(), target);
      const meta = await sharp(out).metadata();
      expect(meta.width).toBe(target.width);
      expect(meta.height).toBe(target.height);
      expect(meta.format).toBe("png");
    }
  });

  it("solid layout fills the corner with the art's dominant colour", async () => {
    const out = await renderWallpaper(await redArt(), { width: 1080, height: 2400 }, { layout: "solid" });
    const corner = await pixel(out, 0, 0);
    expect(corner.r).toBeGreaterThan(200);
    expect(corner.g).toBeLessThan(60);
    expect(corner.b).toBeLessThan(60);
  });

  it("places the sharp art in the centre", async () => {
    const out = await renderWallpaper(await redArt(), { width: 1080, height: 2400 }, { layout: "solid" });
    const centre = await pixel(out, 540, 1200);
    expect(centre.r).toBeGreaterThan(240);
    expect(centre.g).toBeLessThan(15);
  });
});
