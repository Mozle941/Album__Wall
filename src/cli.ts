import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { generateAll } from "./generate";
import { PLATFORMS, presetsFor, type Platform } from "./presets";
import { foregroundSide, LAYOUTS, type Layout } from "./render";
import { validateImage } from "./image-input";
const USAGE = `Usage: npm run cli -- --image ./cover.jpg [options]
Input image must be yours or licensed/otherwise permitted for your use; provide attribution when required.

Options:
  --platform  comma list of: ${PLATFORMS.join(",")} (required)
  --layout    ${LAYOUTS.join(" | ")} (default: blur)
  --out       output directory (default: out)
  --image     local PNG, JPEG, or WebP file (required)`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: false,
    options: {
      platform: { type: "string" },
      layout: { type: "string", default: "blur" },
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
  const layout = values.layout as Layout;
  if (!LAYOUTS.includes(layout)) throw new Error(`Unknown layout: ${layout}`);

  const art = await readFile(values.image);
  const { width: artWidth } = await validateImage(art);
  const presets = presetsFor(platforms);
  for (const preset of presets) {
    const side = foregroundSide(preset);
    if (side > artWidth) {
      console.warn(`  note: ${preset.id} upscales art ${artWidth}px -> ${side}px (softer)`);
    }
  }

  const files = await generateAll(art, presets, values.out!, { layout });
  console.log(`Wrote ${files.length} wallpapers to ${values.out}/`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
