import sharp from "sharp";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildZip } from "../src/bundle";
import { presetsFor } from "../src/presets";

describe("buildZip", () => {
  it.each([
    ["jpeg", "jpg"],
    ["png", "png"],
    ["webp", "webp"],
  ] as const)("contains correctly encoded .%s entries for every preset", async (format, extension) => {
    const art = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#228844" } })
      .png()
      .toBuffer();
    const presets = presetsFor(["android", "windows"]);

    const zip = await buildZip(art, presets, undefined, format);
    const files = unzipSync(zip);
    const names = Object.keys(files).sort();
    expect(names).toEqual(presets.map((p) => `${p.platform}/${p.id}.${extension}`).sort());
    expect((await sharp(Buffer.from(files[names[0]])).metadata()).format).toBe(format === "jpeg" ? "jpeg" : format);
  }, 30_000);
});
