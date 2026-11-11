import { zipSync } from "fflate";
import type { Preset } from "./presets";
import { renderWallpaper, type OutputFormat } from "./render";

/** level 0: image payloads are already compressed, so storing is faster and no larger. */
export async function buildZip(
  art: Buffer,
  presets: Preset[],
  credits?: string,
  format: OutputFormat = "png",
): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const extension = format === "jpeg" ? "jpg" : format;
  for (const preset of presets) {
    const data = await renderWallpaper(art, preset, format);
    files[`${preset.platform}/${preset.id}.${extension}`] = new Uint8Array(data);
  }
  if (credits) files["CREDITS.txt"] = new TextEncoder().encode(`${credits}\n`);
  return zipSync(files, { level: 0 });
}
