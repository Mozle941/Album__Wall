import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Preset } from "./presets";
import { renderWallpaper, type RenderOptions } from "./render";

export interface RenderedFile {
  platform: Preset["platform"];
  id: string;
  data: Buffer;
}

/** Sequential on purpose: large renders are memory-heavy. */
export async function renderAll(
  art: Buffer,
  presets: Preset[],
  opts: RenderOptions = {},
): Promise<RenderedFile[]> {
  const out: RenderedFile[] = [];
  for (const preset of presets) {
    out.push({ platform: preset.platform, id: preset.id, data: await renderWallpaper(art, preset, opts) });
  }
  return out;
}

export async function generateAll(
  art: Buffer,
  presets: Preset[],
  outDir: string,
  opts: RenderOptions = {},
): Promise<string[]> {
  const written: string[] = [];
  for (const file of await renderAll(art, presets, opts)) {
    const dir = path.join(outDir, file.platform);
    await mkdir(dir, { recursive: true });
    const target = path.join(dir, `${file.id}.png`);
    await writeFile(target, file.data);
    written.push(target);
  }
  return written;
}
