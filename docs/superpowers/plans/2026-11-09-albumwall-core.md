# Albumwall Core Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Node/TypeScript library + CLI that takes a Spotify album/track link (or a local image) and writes wallpapers for Android, iOS, macOS, Windows and Linux at standard resolutions.

**Architecture:** Three pure units: `presets` (resolution table), `spotify` (URL → artwork bytes), `render` (artwork + size → PNG). `generate` and `cli` wire them together. Web app and mobile app (later plans) import this core unchanged.

**Tech Stack:** Node 20+, TypeScript, `sharp` (image processing), `vitest` (tests), `tsx` (run TS directly).

---

## Scope split

The request covers three independent subsystems. Each gets its own plan and ships working software alone.

| Plan | Deliverable | Status |
|---|---|---|
| **1 (this)** | Core library + CLI | Written, code verified |
| 2 | Website (Next.js): paste link, preview, download zip | Not written |
| 3 | Mobile app (Expo or installable PWA): share-sheet from Spotify, save to gallery | Not written |

## Constraints that shape the design

| Constraint | Source | Decision |
|---|---|---|
| Spotify Web API dev mode: owner needs Premium, 5 test users, 1 client ID, reduced endpoints | Spotify Feb 2026 changes | **Do not use the Web API.** Use the keyless oEmbed endpoint (`open.spotify.com/oembed`) |
| Extended access needs 250k MAU | Spotify | Not a path for a new app |
| oEmbed thumbnail is 300px; the 640px URL swap is **unofficial** | Spotify CDN behaviour | `upgradeImageUrl` tries 640px, falls back to original on failure |
| Source art is ≤640px, wallpapers are up to 5120px | Physics | Art is **centered at ≤80% of the short edge** over a blurred fill, never stretched to full screen. CLI warns when upscaling |
| Spotify's developer terms may restrict altering album art | Not verified in this plan | **Read Spotify's Developer Terms and Design Guidelines before any public launch** (Plan 2 gate) |
| Higher-res fallback (iTunes Search API, 3000px) | Not in Plan 1 (YAGNI) | Add in Plan 2 if softness matters |

## File structure

| File | Responsibility |
|---|---|
| `src/presets.ts` | Device resolution table, lookup/filter |
| `src/spotify.ts` | Parse Spotify URL, fetch oEmbed, download best-available art |
| `src/render.ts` | Compose one wallpaper (`blur` or `solid` background + centered art) |
| `src/generate.ts` | Render many presets to `<out>/<platform>/<id>.png` |
| `src/cli.ts` | Argument parsing, warnings, wiring |
| `tests/*.test.ts` | One test file per source file |

Preset data is editable: verify resolutions against current devices before release.

---

### Task 1: Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`

- [x] **Step 1: Init repo and install**

```bash
mkdir albumwall && cd albumwall && git init
npm init -y
npm install sharp
npm install -D typescript vitest tsx @types/node
mkdir src tests
```

- [x] **Step 2: Replace `package.json` scripts and set ESM**

Edit `package.json` so it contains (keep the dependency blocks npm generated):

```json
{
  "name": "albumwall",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "build": "tsc --noEmit",
    "cli": "tsx src/cli.ts"
  }
}
```

- [x] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "rootDir": ".",
    "noEmit": true
  },
  "include": ["src", "tests"]
}
```

- [x] **Step 4: Create `.gitignore`**

```
node_modules
out
```

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold project"
```

### Task 2: Device presets

**Files:**
- Create: `src/presets.ts`
- Test: `tests/presets.test.ts`

- [x] **Step 1: Write the failing test** — `tests/presets.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { PRESETS, getPreset, presetsFor } from "../src/presets.js";

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
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/presets.test.ts`
Expected: FAIL — cannot resolve `../src/presets.js`.

- [x] **Step 3: Write minimal implementation** — `src/presets.ts`

```ts
export type Platform = "android" | "ios" | "mac" | "windows" | "linux";

export interface Preset {
  id: string;
  platform: Platform;
  label: string;
  width: number;
  height: number;
}

export const PRESETS: readonly Preset[] = [
  { id: "android-fhd", platform: "android", label: "Android FHD+ (1080x2400)", width: 1080, height: 2400 },
  { id: "android-qhd", platform: "android", label: "Android QHD+ (1440x3120)", width: 1440, height: 3120 },
  { id: "ios-iphone-13", platform: "ios", label: "iPhone 12/13/14 (1170x2532)", width: 1170, height: 2532 },
  { id: "ios-iphone-15-pro", platform: "ios", label: "iPhone 14 Pro/15/15 Pro (1179x2556)", width: 1179, height: 2556 },
  { id: "ios-iphone-pro-max", platform: "ios", label: "iPhone Pro Max (1290x2796)", width: 1290, height: 2796 },
  { id: "mac-mbp-14", platform: "mac", label: 'MacBook Pro 14" (3024x1964)', width: 3024, height: 1964 },
  { id: "mac-mbp-16", platform: "mac", label: 'MacBook Pro 16" (3456x2234)', width: 3456, height: 2234 },
  { id: "mac-5k", platform: "mac", label: "iMac 5K / Studio Display (5120x2880)", width: 5120, height: 2880 },
  { id: "windows-fhd", platform: "windows", label: "Windows FHD (1920x1080)", width: 1920, height: 1080 },
  { id: "windows-qhd", platform: "windows", label: "Windows QHD (2560x1440)", width: 2560, height: 1440 },
  { id: "windows-4k", platform: "windows", label: "Windows 4K (3840x2160)", width: 3840, height: 2160 },
  { id: "linux-fhd", platform: "linux", label: "Linux FHD (1920x1080)", width: 1920, height: 1080 },
  { id: "linux-4k", platform: "linux", label: "Linux 4K (3840x2160)", width: 3840, height: 2160 },
];

export function presetsFor(platforms?: Platform[]): Preset[] {
  if (!platforms || platforms.length === 0) return [...PRESETS];
  return PRESETS.filter((p) => platforms.includes(p.platform));
}

export function getPreset(id: string): Preset {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown preset: ${id}`);
  return preset;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/presets.test.ts`
Expected: PASS, 4 tests.

- [x] **Step 5: Commit**

```bash
git add src/presets.ts tests/presets.test.ts
git commit -m "feat: add device presets"
```

### Task 3: Spotify URL parsing, image upgrade, artwork fetch

**Files:**
- Create: `src/spotify.ts`
- Test: `tests/spotify.test.ts`

- [x] **Step 1: Write the failing test** — `tests/spotify.test.ts`

```ts
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { fetchArtwork, parseSpotifyUrl, upgradeImageUrl } from "../src/spotify.js";

describe("parseSpotifyUrl", () => {
  it("parses album and track urls, ignoring query and intl prefix", () => {
    expect(parseSpotifyUrl("https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy?si=abc")).toEqual({
      kind: "album",
      id: "4aawyAB9vmqN3uQ7FjRGTy",
      canonical: "https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy",
    });
    expect(parseSpotifyUrl("https://open.spotify.com/intl-de/track/ABC123").kind).toBe("track");
  });

  it("rejects non-spotify urls and playlists", () => {
    expect(() => parseSpotifyUrl("https://example.com/album/1")).toThrow("Not a Spotify");
    expect(() => parseSpotifyUrl("https://open.spotify.com/playlist/1")).toThrow("Not a Spotify");
  });
});

describe("upgradeImageUrl", () => {
  it("swaps 300px and 64px prefixes for the 640px prefix", () => {
    expect(upgradeImageUrl("https://i.scdn.co/image/ab67616d00001e02deadbeef")).toBe(
      "https://i.scdn.co/image/ab67616d0000b273deadbeef",
    );
    expect(upgradeImageUrl("https://i.scdn.co/image/ab67616d00004851deadbeef")).toBe(
      "https://i.scdn.co/image/ab67616d0000b273deadbeef",
    );
  });

  it("leaves unknown urls untouched", () => {
    expect(upgradeImageUrl("https://example.com/a.jpg")).toBe("https://example.com/a.jpg");
  });
});

describe("fetchArtwork", () => {
  async function png(size: number) {
    return sharp({ create: { width: size, height: size, channels: 3, background: "#ff0000" } })
      .png()
      .toBuffer();
  }

  const small = "https://i.scdn.co/image/ab67616d00001e02deadbeef";
  const large = "https://i.scdn.co/image/ab67616d0000b273deadbeef";

  function fakeFetch(opts: { largeOk: boolean }) {
    return (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.startsWith("https://open.spotify.com/oembed")) {
        return new Response(JSON.stringify({ thumbnail_url: small }), { status: 200 });
      }
      if (u === large) {
        return opts.largeOk
          ? new Response(new Uint8Array(await png(640)), { status: 200 })
          : new Response("nope", { status: 404 });
      }
      if (u === small) return new Response(new Uint8Array(await png(300)), { status: 200 });
      return new Response("?", { status: 500 });
    }) as typeof fetch;
  }

  it("uses the 640px image when available", async () => {
    const art = await fetchArtwork("https://open.spotify.com/album/abc", fakeFetch({ largeOk: true }));
    expect(art.width).toBe(640);
    expect(art.sourceUrl).toBe(large);
  });

  it("falls back to the original thumbnail when the upgrade 404s", async () => {
    const art = await fetchArtwork("https://open.spotify.com/album/abc", fakeFetch({ largeOk: false }));
    expect(art.width).toBe(300);
    expect(art.sourceUrl).toBe(small);
  });

  it("throws when oEmbed fails", async () => {
    const failing = (async () => new Response("x", { status: 404 })) as unknown as typeof fetch;
    await expect(fetchArtwork("https://open.spotify.com/album/abc", failing)).rejects.toThrow(
      "oEmbed failed: HTTP 404",
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/spotify.test.ts`
Expected: FAIL — cannot resolve `../src/spotify.js`.

- [x] **Step 3: Write minimal implementation** — `src/spotify.ts`

```ts
import sharp from "sharp";

export interface Artwork {
  buffer: Buffer;
  sourceUrl: string;
  width: number;
  height: number;
}

export interface ParsedSpotifyUrl {
  kind: "album" | "track";
  id: string;
  canonical: string;
}

const SPOTIFY_URL =
  /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2,3}\/)?(album|track)\/([A-Za-z0-9]+)/;

export function parseSpotifyUrl(input: string): ParsedSpotifyUrl {
  const match = SPOTIFY_URL.exec(input.trim());
  if (!match) throw new Error(`Not a Spotify album or track URL: ${input}`);
  const kind = match[1] as "album" | "track";
  const id = match[2];
  return { kind, id, canonical: `https://open.spotify.com/${kind}/${id}` };
}

// Unofficial: Spotify's image CDN encodes size in a hash prefix.
// 00001e02 = 300px, 00004851 = 64px, 0000b273 = 640px. Callers must fall back if it 404s.
const SMALL_PREFIXES = ["ab67616d00001e02", "ab67616d00004851"];
const LARGE_PREFIX = "ab67616d0000b273";

export function upgradeImageUrl(url: string): string {
  for (const small of SMALL_PREFIXES) {
    if (url.includes(small)) return url.replace(small, LARGE_PREFIX);
  }
  return url;
}

type FetchFn = typeof fetch;

async function download(url: string, fetchFn: FetchFn): Promise<Buffer | null> {
  const res = await fetchFn(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

export async function fetchArtwork(input: string, fetchFn: FetchFn = fetch): Promise<Artwork> {
  const { canonical } = parseSpotifyUrl(input);
  const oembedRes = await fetchFn(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(canonical)}`,
  );
  if (!oembedRes.ok) throw new Error(`Spotify oEmbed failed: HTTP ${oembedRes.status}`);
  const { thumbnail_url: thumbnail } = (await oembedRes.json()) as { thumbnail_url?: string };
  if (!thumbnail) throw new Error("Spotify oEmbed returned no thumbnail_url");

  const upgraded = upgradeImageUrl(thumbnail);
  let sourceUrl = upgraded;
  let buffer = await download(upgraded, fetchFn);
  if (!buffer && upgraded !== thumbnail) {
    sourceUrl = thumbnail;
    buffer = await download(thumbnail, fetchFn);
  }
  if (!buffer) throw new Error(`Could not download artwork from ${sourceUrl}`);

  const meta = await sharp(buffer).metadata();
  return { buffer, sourceUrl, width: meta.width ?? 0, height: meta.height ?? 0 };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/spotify.test.ts`
Expected: PASS, 7 tests. Tests use an injected fake `fetch`; no network needed.

- [x] **Step 5: Commit**

```bash
git add src/spotify.ts tests/spotify.test.ts
git commit -m "feat: fetch spotify artwork via oEmbed"
```

### Task 4: Wallpaper renderer

**Files:**
- Create: `src/render.ts`
- Test: `tests/render.test.ts`

- [x] **Step 1: Write the failing test** — `tests/render.test.ts`

```ts
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { foregroundSide, renderWallpaper } from "../src/render.js";

async function redArt(size = 640) {
  return sharp({ create: { width: size, height: size, channels: 3, background: "#ff0000" } })
    .png()
    .toBuffer();
}

async function pixel(buf: Buffer, left: number, top: number) {
  const raw = await sharp(buf).extract({ left, top, width: 1, height: 1 }).raw().toBuffer();
  return { r: raw[0], g: raw[1], b: raw[2] };
}

describe("foregroundSide", () => {
  it("scales against the shorter edge", () => {
    expect(foregroundSide({ width: 1080, height: 2400 })).toBe(864);
    expect(foregroundSide({ width: 3840, height: 2160 }, 0.5)).toBe(1080);
  });
});

describe("renderWallpaper", () => {
  it("outputs exact target dimensions for portrait and landscape (blur)", async () => {
    for (const target of [
      { width: 1080, height: 2400 },
      { width: 1920, height: 1080 },
    ]) {
      const out = await renderWallpaper(await redArt(), target);
      const meta = await sharp(out).metadata();
      expect(meta.width).toBe(target.width);
      expect(meta.height).toBe(target.height);
      expect(meta.format).toBe("png");
    }
  });

  it("solid layout fills the corner with the art's dominant colour", async () => {
    const out = await renderWallpaper(await redArt(), { width: 1080, height: 2400 }, { layout: "solid" });
    const corner = await pixel(out, 0, 0);
    expect(corner.r).toBeGreaterThan(200);
    expect(corner.g).toBeLessThan(60);
    expect(corner.b).toBeLessThan(60);
  });

  it("places the sharp art in the centre", async () => {
    const out = await renderWallpaper(await redArt(), { width: 1080, height: 2400 }, { layout: "solid" });
    const centre = await pixel(out, 540, 1200);
    expect(centre.r).toBeGreaterThan(240);
    expect(centre.g).toBeLessThan(15);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render.test.ts`
Expected: FAIL — cannot resolve `../src/render.js`.

- [x] **Step 3: Write minimal implementation** — `src/render.ts`

```ts
import sharp from "sharp";

export type Layout = "blur" | "solid";

export interface RenderOptions {
  layout?: Layout;
  /** Foreground art side as a fraction of the shorter wallpaper edge. Default 0.8. */
  artScale?: number;
}

export interface Size {
  width: number;
  height: number;
}

export function foregroundSide(target: Size, artScale = 0.8): number {
  return Math.round(Math.min(target.width, target.height) * artScale);
}

export async function renderWallpaper(
  art: Buffer,
  target: Size,
  opts: RenderOptions = {},
): Promise<Buffer> {
  const { layout = "blur", artScale = 0.8 } = opts;
  const side = foregroundSide(target, artScale);

  const background =
    layout === "blur"
      ? await sharp(art)
          .resize(target.width, target.height, { fit: "cover" })
          .blur(40)
          .modulate({ brightness: 0.7 })
          .toBuffer()
      : await solidBackground(art, target);

  const foreground = await sharp(art)
    .resize(side, side, { fit: "cover", kernel: "lanczos3" })
    .toBuffer();

  return sharp(background)
    .composite([{ input: foreground, gravity: "centre" }])
    .png()
    .toBuffer();
}

async function solidBackground(art: Buffer, target: Size): Promise<Buffer> {
  const { dominant } = await sharp(art).stats();
  return sharp({
    create: {
      width: target.width,
      height: target.height,
      channels: 3,
      background: { r: dominant.r, g: dominant.g, b: dominant.b },
    },
  })
    .png()
    .toBuffer();
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/render.test.ts`
Expected: PASS, 4 tests (about 1 s).

- [x] **Step 5: Commit**

```bash
git add src/render.ts tests/render.test.ts
git commit -m "feat: render wallpapers with blur and solid layouts"
```

### Task 5: Batch generation to disk

**Files:**
- Create: `src/generate.ts`
- Test: `tests/generate.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/generate.test.ts`

```ts
import { mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { generateAll } from "../src/generate.js";
import { presetsFor } from "../src/presets.js";

describe("generateAll", () => {
  it("writes one png per preset under <out>/<platform>/<id>.png", async () => {
    const art = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#3366cc" } })
      .png()
      .toBuffer();
    const out = await mkdtemp(path.join(os.tmpdir(), "albumwall-"));
    const presets = presetsFor(["ios", "linux"]);

    const files = await generateAll(art, presets, out);

    expect(files).toHaveLength(presets.length);
    expect(await readdir(path.join(out, "ios"))).toContain("ios-iphone-13.png");
    expect(await readdir(path.join(out, "linux"))).toContain("linux-4k.png");
    const meta = await sharp(path.join(out, "linux", "linux-4k.png")).metadata();
    expect([meta.width, meta.height]).toEqual([3840, 2160]);
  }, 30_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/generate.test.ts`
Expected: FAIL — cannot resolve `../src/generate.js`.

- [ ] **Step 3: Write minimal implementation** — `src/generate.ts`

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Preset } from "./presets.js";
import { renderWallpaper, type RenderOptions } from "./render.js";

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/generate.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/generate.ts tests/generate.test.ts
git commit -m "feat: generate wallpapers for all presets"
```

### Task 6: CLI

**Files:**
- Create: `src/cli.ts`

No unit test: it is argument wiring over tested units. Verified by typecheck plus an offline smoke run.

- [ ] **Step 1: Write `src/cli.ts`**

```ts
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { generateAll } from "./generate.js";
import { presetsFor, type Platform } from "./presets.js";
import { foregroundSide, type Layout } from "./render.js";
import { fetchArtwork } from "./spotify.js";
import sharp from "sharp";

const PLATFORMS: Platform[] = ["android", "ios", "mac", "windows", "linux"];
const LAYOUTS: Layout[] = ["blur", "solid"];

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
```

- [ ] **Step 2: Typecheck and run all tests**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; `4 passed (4)` files, `16 passed (16)` tests.

- [ ] **Step 3: Offline smoke test (local image)**

```bash
node -e "require('sharp')({create:{width:640,height:640,channels:3,background:'#8844aa'}}).png().toFile('/tmp/cover.png')"
npm run cli -- --image /tmp/cover.png --platform android,ios --out /tmp/wp
find /tmp/wp -type f | sort
```

Expected: five `note: ... upscales art 640px -> ...` lines, `Wrote 5 wallpapers to /tmp/wp/`, and files `android/android-fhd.png`, `android/android-qhd.png`, `ios/ios-iphone-13.png`, `ios/ios-iphone-15-pro.png`, `ios/ios-iphone-pro-max.png`.

- [ ] **Step 4: Live smoke test (needs internet)**

```bash
npm run cli -- "https://open.spotify.com/album/<any-album-id>" --platform windows --out ./out
```

Expected: `Artwork: 640x640 from https://i.scdn.co/...`. If it prints `300x300`, the unofficial 640px swap no longer works and fallback is active: record this, it affects output quality.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts
git commit -m "feat: add CLI"
```

---

## Self-review

| Check | Result |
|---|---|
| Spec: extract art from Spotify | Task 3 (oEmbed, link input) |
| Spec: resize to wallpapers | Tasks 4–5 |
| Spec: android, ios, mac, linux, windows | Task 2 table, all five asserted by test |
| Spec: "app and website" | **Not in Plan 1.** Plans 2 and 3 |
| Placeholders | None; every step has code or exact commands |
| Type consistency | `Preset`, `Artwork`, `RenderOptions`, `Layout`, `Platform` names identical across tasks; code was compiled and 16 tests passed |

## Open questions for Plans 2 and 3

| Question | Why it matters |
|---|---|
| Mobile: native app or installable PWA? | PWA reuses the web code; native Expo gives share-sheet and gallery save |
| Public launch vs personal tool? | Public needs the Spotify terms check and likely a higher-res source |
| Run `sharp` server-side or in-browser (canvas)? | Server is simpler and consistent; browser avoids hosting costs |
