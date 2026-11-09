import { mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { generateAll } from "../src/generate.js";
import { presetsFor } from "../src/presets.js";

describe("generateAll", () => {
  it("writes one png per preset under <out>/<platform>/<id>.png", async () => {
    const art = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#3366cc" } })
      .png()
      .toBuffer();
    const out = await mkdtemp(path.join(os.tmpdir(), "albumwall-"));
    const presets = presetsFor(["ios", "linux"]);

    const files = await generateAll(art, presets, out);

    expect(files).toHaveLength(presets.length);
    expect(await readdir(path.join(out, "ios"))).toContain("ios-iphone-13.png");
    expect(await readdir(path.join(out, "linux"))).toContain("linux-4k.png");
    const meta = await sharp(path.join(out, "linux", "linux-4k.png")).metadata();
    expect([meta.width, meta.height]).toEqual([3840, 2160]);
  }, 30_000);
});
