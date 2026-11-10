import { describe, expect, it } from "vitest";
import { dimensionsForRatio, PRESETS, getPreset, presetsFor } from "../src/presets";

describe("presets", () => {
  it("has unique ids and positive integer sizes", () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PRESETS) {
      expect(Number.isInteger(p.width) && p.width > 0).toBe(true);
      expect(Number.isInteger(p.height) && p.height > 0).toBe(true);
    }
  });

  it("covers all five platforms", () => {
    const platforms = new Set(PRESETS.map((p) => p.platform));
    expect([...platforms].sort()).toEqual(["android", "ios", "linux", "mac", "windows"]);
  });

  it("filters by platform", () => {
    const ios = presetsFor(["ios"]);
    expect(ios.length).toBeGreaterThan(0);
    expect(ios.every((p) => p.platform === "ios")).toBe(true);
    expect(presetsFor().length).toBe(PRESETS.length);
  });

  it("throws on unknown preset id", () => {
    expect(() => getPreset("nope")).toThrow("Unknown preset: nope");
    expect(getPreset("windows-4k").width).toBe(3840);
  });

  it("keeps device dimensions by default and preserves the long edge for chosen ratios", () => {
    expect(dimensionsForRatio(1170, 2532, "device")).toEqual({ width: 1170, height: 2532 });
    expect(dimensionsForRatio(1170, 2532, "9:16")).toEqual({ width: 1424, height: 2532 });
    expect(dimensionsForRatio(1920, 1080, "1:1")).toEqual({ width: 1920, height: 1920 });
    expect(dimensionsForRatio(3024, 1964, "4:5")).toEqual({ width: 3024, height: 3780 });
  });
});
