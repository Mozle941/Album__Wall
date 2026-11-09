import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Preset } from "./presets";
import { renderWallpaper, type RenderOptions } from "./render";

export async function generateAll(
  art: Buffer,
  presets: Preset[],
  outDir: string,
  opts: RenderOptions = {},
): Promise<string[]> {
  const written: string[] = [];
  for (const preset of presets) {
    const dir = path.join(outDir, preset.platform);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${preset.id}.png`);
    await writeFile(file, await renderWallpaper(art, preset, opts));
    written.push(file);
  }
  return written;
}
