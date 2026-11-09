import { zipSync } from "fflate";
import { renderAll } from "./generate";
import type { Preset } from "./presets";
import type { RenderOptions } from "./render";

/** level 0: PNGs are already compressed, so storing is faster and no larger. */
export async function buildZip(
  art: Buffer,
  presets: Preset[],
  opts: RenderOptions = {},
): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const f of await renderAll(art, presets, opts)) {
    files[`${f.platform}/${f.id}.png`] = new Uint8Array(f.data);
  }
  return zipSync(files, { level: 0 });
}
