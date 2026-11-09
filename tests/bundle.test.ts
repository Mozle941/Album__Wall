import sharp from "sharp";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildZip } from "../src/bundle";
import { presetsFor } from "../src/presets";

describe("buildZip", () => {
  it("contains <platform>/<id>.png for every preset", async () => {
    const art = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#228844" } })
      .png()
      .toBuffer();
    const presets = presetsFor(["android", "windows"]);

    const zip = await buildZip(art, presets);
    const names = Object.keys(unzipSync(zip)).sort();

    expect(names).toEqual(presets.map((p) => `${p.platform}/${p.id}.png`).sort());
  }, 30_000);
});
