import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
const projectRoot = path.resolve(import.meta.dirname, "..");
function runCli(...args: string[]) { return spawnSync("npm", ["run", "cli", "--", ...args], { cwd: projectRoot, encoding: "utf8" }); }
describe("CLI arguments", () => {
  it("requires --image and explains rights expectations", () => { const result = runCli(); expect(result.status).not.toBe(0); expect(result.stderr).toContain("--image"); expect(result.stderr).toContain("licensed"); });
  it("rejects Spotify URL positionals", () => { const result = runCli("https://open.spotify.com/album/abc"); expect(result.status).not.toBe(0); });
  it("requires a platform and rejects unknown platform or layout", () => {
    const missing = runCli("--image", "fake.png"); expect(missing.status).not.toBe(0);
    const badPlatform = runCli("--image", "fake.png", "--platform", "beos"); expect(badPlatform.stderr).toContain("Unknown platform: beos");
    const badLayout = runCli("--image", "fake.png", "--platform", "ios", "--layout", "stretch"); expect(badLayout.stderr).toContain("Unknown layout: stretch");
  });
});
