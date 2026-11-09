import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");

function runCli(...args: string[]) {
  return spawnSync("npm", ["run", "cli", "--", ...args], {
    cwd: projectRoot,
    encoding: "utf8",
  });
}

describe("CLI arguments", () => {
  it("prints usage and exits with an error when no input is provided", () => {
    const result = runCli();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Usage: npm run cli");
  });

  it("rejects an unknown platform", () => {
    const result = runCli("https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy", "--platform", "beos");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unknown platform: beos");
  });

  it("rejects an unknown layout", () => {
    const result = runCli("https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy", "--layout", "stretch");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unknown layout: stretch");
  });
});
