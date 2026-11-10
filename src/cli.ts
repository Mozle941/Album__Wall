import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { generateAll } from "./generate";
import { PLATFORMS, presetsFor, type Platform } from "./presets";
import { validateImage } from "./image-input";
const USAGE = `Usage: npm run cli -- --image ./cover.jpg [options]
Input image must be yours or licensed/otherwise permitted for your use; provide attribution when required.

Options:
  --platform  comma list of: ${PLATFORMS.join(",")} (required)
  --out       output directory (default: out)
  --image     local PNG, JPEG, or WebP file (required)`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: false,
    options: {
      platform: { type: "string" },
      out: { type: "string", default: "out" },
      image: { type: "string" },
    },
  });

  if (positionals.length || !values.image) {
    console.error(USAGE);
    process.exit(1);
  }

  const platforms = values.platform?.split(",").map((s) => s.trim()) as Platform[] | undefined;
  if (!platforms?.length || platforms.some((p) => !p)) throw new Error("Select at least one --platform");
  for (const p of platforms ?? []) {
    if (!PLATFORMS.includes(p)) throw new Error(`Unknown platform: ${p}`);
  }
  const art = await readFile(values.image);
  const { width: artWidth, height: artHeight } = await validateImage(art);
  const presets = presetsFor(platforms);
  for (const preset of presets) {
    if (preset.width > artWidth || preset.height > artHeight) {
      console.warn(`  note: ${preset.id} upscales art ${artWidth}×${artHeight}px -> ${preset.width}×${preset.height}px (softer)`);
    }
  }

  const files = await generateAll(art, presets, values.out!);
  console.log(`Wrote ${files.length} wallpapers to ${values.out}/`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
