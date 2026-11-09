import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { generateAll } from "./generate";
import { PLATFORMS, presetsFor, type Platform } from "./presets";
import { foregroundSide, LAYOUTS, type Layout } from "./render";
import { fetchArtwork } from "./spotify";
import sharp from "sharp";
const USAGE = `Usage: npm run cli -- <spotify-album-or-track-url> [options]
       npm run cli -- --image ./cover.jpg [options]

Options:
  --platform  comma list of: ${PLATFORMS.join(",")} (default: all)
  --layout    ${LAYOUTS.join(" | ")} (default: blur)
  --out       output directory (default: out)
  --image     local image instead of a Spotify URL`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      platform: { type: "string" },
      layout: { type: "string", default: "blur" },
      out: { type: "string", default: "out" },
      image: { type: "string" },
    },
  });

  const url = positionals[0];
  if (!url && !values.image) {
    console.error(USAGE);
    process.exit(1);
  }

  const platforms = values.platform?.split(",").map((s) => s.trim()) as Platform[] | undefined;
  for (const p of platforms ?? []) {
    if (!PLATFORMS.includes(p)) throw new Error(`Unknown platform: ${p}`);
  }
  const layout = values.layout as Layout;
  if (!LAYOUTS.includes(layout)) throw new Error(`Unknown layout: ${layout}`);

  let art: Buffer;
  let artWidth: number;
  if (values.image) {
    art = await readFile(values.image);
    artWidth = (await sharp(art).metadata()).width ?? 0;
  } else {
    const fetched = await fetchArtwork(url);
    art = fetched.buffer;
    artWidth = fetched.width;
    console.log(`Artwork: ${fetched.width}x${fetched.height} from ${fetched.sourceUrl}`);
  }

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
