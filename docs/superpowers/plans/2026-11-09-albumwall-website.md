# Albumwall Website Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A website where you paste a Spotify album/track link, preview wallpapers per device, and download a zip. Installable as a PWA on phones. Open-source ready.

**Architecture:** Next.js route handlers (`/api/info`, `/api/wallpaper`, `/api/zip`) call the Plan 1 core on the server. The page is a thin client. Handlers are plain `Request -> Response` functions in `src/web/`, so they are tested with vitest without Next.

**Tech Stack:** Plan 1 stack + Next.js 16, React 19, `fflate` (zip). Versions are what npm resolved when this plan was verified.

**Prerequisite:** Plan 1 complete (`docs/superpowers/plans/2026-11-09-albumwall-core.md`).

---

## Decision that changed from the proposal

| Proposed | Now | Why |
|---|---|---|
| Static site, render in browser | **Server-side route handlers** | Browser fetch of oEmbed needs CORS. Spotify added it after a bug report, and users have reported it breaking since. The image CDN's CORS is unconfirmed, and canvas needs it. Server-side avoids both and reuses `sharp` unchanged |

Trade-off: needs a Node host (Vercel free tier or Docker). Zip rendering can take several seconds, so `maxDuration = 60` is set and the UI downloads per selected platform.

## File structure

| File | Responsibility |
|---|---|
| `src/spotify.ts` (modify) | Add CDN host allowlist (SSRF guard) |
| `src/generate.ts` (modify) | Add `renderAll`; `generateAll` reuses it |
| `src/bundle.ts` | `buildZip` |
| `src/web/handlers.ts` | Param validation, error mapping, three handlers |
| `app/api/{info,wallpaper,zip}/route.ts` | One-line adapters |
| `app/page.tsx`, `app/layout.tsx`, `app/manifest.ts` | UI and PWA manifest |
| `scripts/make-icons.ts`, `public/icon-*.png` | PWA icons |
| `Dockerfile`, `.github/workflows/ci.yml`, `README.md`, `LICENSE` | Open-source packaging |

---

### Task 1: Prepare core for Next.js

Next's bundler cannot resolve `.js` suffixes on `.ts` imports, so the core switches to bundler-style resolution. Also move `PLATFORMS` and `LAYOUTS` into the modules the server needs.

**Files:**
- Modify: `tsconfig.json`, `src/*.ts`, `tests/*.ts`, `src/presets.ts`, `src/render.ts`, `src/cli.ts`, `package.json`

- [x] **Step 1: Install**

```bash
npm install fflate next react react-dom
npm install -D @types/react @types/react-dom
```

- [x] **Step 2: Strip `.js` suffixes from relative imports**

```bash
sed -i -E 's#(from "\.[^"]*)\.js"#\1"#' src/*.ts tests/*.ts
```

- [x] **Step 3: Replace `tsconfig.json`**

(`next build` will add the `.next/dev/types` include and set `jsx` to `react-jsx`; that is expected.)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": [
      "dom",
      "dom.iterable",
      "esnext"
    ],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "incremental": true,
    "allowJs": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "plugins": [
      {
        "name": "next"
      }
    ]
  },
  "include": [
    "next-env.d.ts",
    "src",
    "tests",
    "app",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": [
    "node_modules"
  ]
}
```

- [x] **Step 4: Export the constants**

In `src/presets.ts`, replace the `Platform` type line with:

```ts
export const PLATFORMS = ["android", "ios", "mac", "windows", "linux"] as const;
export type Platform = (typeof PLATFORMS)[number];
```

In `src/render.ts`, replace the `Layout` type line with:

```ts
export const LAYOUTS = ["blur", "solid"] as const;
export type Layout = (typeof LAYOUTS)[number];
```

In `src/cli.ts`, delete the local `PLATFORMS` and `LAYOUTS` constants and change the two imports to:

```ts
import { PLATFORMS, presetsFor, type Platform } from "./presets";
import { foregroundSide, LAYOUTS, type Layout } from "./render";
```

- [x] **Step 5: Verify nothing broke**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; `19 passed`.
Plan deviation (user-requested): the expected count is 19 rather than 16 because the user added three subprocess CLI argument tests in `tests/cli.test.ts`.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: bundler resolution and shared constants for web"
```

### Task 2: Restrict image hosts (SSRF guard)

The server fetches a URL that came from a remote JSON response. Only allow Spotify CDN hosts.

**Files:**
- Modify: `src/spotify.ts`, `tests/spotify.test.ts`

- [x] **Step 1: Write the failing test**

In `tests/spotify.test.ts`, change the import line to:

```ts
import { assertSpotifyCdn, fetchArtwork, parseSpotifyUrl, upgradeImageUrl } from "../src/spotify";
```

and append:

```ts
describe("assertSpotifyCdn", () => {
  it("accepts spotify cdn hosts and rejects others", () => {
    expect(() => assertSpotifyCdn("https://i.scdn.co/image/abc")).not.toThrow();
    expect(() => assertSpotifyCdn("https://image-cdn-ak.spotifycdn.com/image/abc")).not.toThrow();
    expect(() => assertSpotifyCdn("http://169.254.169.254/latest")).toThrow("non-Spotify");
    expect(() => assertSpotifyCdn("https://evilscdn.co/x")).toThrow("non-Spotify");
    expect(() => assertSpotifyCdn("nonsense")).toThrow("Invalid image URL");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/spotify.test.ts`
Expected: FAIL — `assertSpotifyCdn` is not exported.

- [x] **Step 3: Implement**

In `src/spotify.ts`, directly after `type FetchFn = typeof fetch;` add:

```ts
const CDN_SUFFIXES = ["scdn.co", "spotifycdn.com"];

export function assertSpotifyCdn(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`Invalid image URL: ${url}`);
  }
  const ok = CDN_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
  if (!ok) throw new Error(`Refusing non-Spotify image host: ${host}`);
}
```

and in `fetchArtwork`, add the first line below directly above `const upgraded = upgradeImageUrl(thumbnail);`:

```ts
  assertSpotifyCdn(thumbnail);
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/spotify.test.ts`
Expected: PASS, 8 tests.

- [x] **Step 5: Commit**

```bash
git add src/spotify.ts tests/spotify.test.ts
git commit -m "feat: restrict artwork downloads to spotify cdn hosts"
```

### Task 3: In-memory rendering

**Files:**
- Modify: `src/generate.ts` (full replacement)

Existing `tests/generate.test.ts` covers `generateAll`; it must still pass.

- [x] **Step 1: Replace `src/generate.ts`**

```ts
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
```

- [x] **Step 2: Run tests**

Run: `npm test`
Expected: all pass (`generateAll` behaviour unchanged).

- [x] **Step 3: Commit**

```bash
git add src/generate.ts
git commit -m "refactor: extract renderAll for in-memory use"
```

### Task 4: Zip bundle

**Files:**
- Create: `src/bundle.ts`
- Test: `tests/bundle.test.ts`

- [x] **Step 1: Write the failing test** — `tests/bundle.test.ts`

```ts
import sharp from "sharp";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildZip } from "../src/bundle";
import { presetsFor } from "../src/presets";

describe("buildZip", () => {
  it("contains <platform>/<id>.png for every preset", async () => {
    const art = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#228844" } })
      .png()
      .toBuffer();
    const presets = presetsFor(["android", "windows"]);

    const zip = await buildZip(art, presets);
    const names = Object.keys(unzipSync(zip)).sort();

    expect(names).toEqual(presets.map((p) => `${p.platform}/${p.id}.png`).sort());
  }, 30_000);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bundle.test.ts`
Expected: FAIL — cannot resolve `../src/bundle`.

- [x] **Step 3: Implement** — `src/bundle.ts`

```ts
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
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/bundle.test.ts`
Expected: PASS, 1 test. Full suite: 6 files and 21 tests passed.

- [x] **Step 5: Commit**

```bash
git add src/bundle.ts tests/bundle.test.ts
git commit -m "feat: add zip bundle builder"
```

### Task 5: HTTP handlers

`scale` (0.05–1) lets the page request small previews instead of 5120px PNGs.

**Files:**
- Create: `src/web/handlers.ts`
- Test: `tests/handlers.test.ts`

- [x] **Step 1: Write the failing test** — `tests/handlers.test.ts`

```ts
import sharp from "sharp";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { handleInfo, handleWallpaper, handleZip } from "../src/web/handlers";

const ALBUM = "https://open.spotify.com/album/abc123";
const THUMB = "https://i.scdn.co/image/ab67616d00001e02deadbeef";
const BIG = "https://i.scdn.co/image/ab67616d0000b273deadbeef";

const png = (size: number) =>
  sharp({ create: { width: size, height: size, channels: 3, background: "#cc3366" } }).png().toBuffer();

const fakeFetch = (async (input: string | URL | Request) => {
  const u = String(input);
  if (u.startsWith("https://open.spotify.com/oembed")) {
    return new Response(JSON.stringify({ thumbnail_url: THUMB }), { status: 200 });
  }
  if (u === BIG) return new Response(new Uint8Array(await png(640)), { status: 200 });
  return new Response("?", { status: 404 });
}) as typeof fetch;

const deps = { fetchFn: fakeFetch };
const req = (path: string) => new Request(`http://localhost${path}`);
const q = (extra: string) => `?url=${encodeURIComponent(ALBUM)}${extra}`;

describe("handleInfo", () => {
  it("returns artwork size and source", async () => {
    const res = await handleInfo(req(`/api/info${q("")}`), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ width: 640, height: 640, sourceUrl: BIG });
  });

  it("400 on missing or non-spotify url", async () => {
    expect((await handleInfo(req("/api/info"), deps)).status).toBe(400);
    const bad = await handleInfo(req("/api/info?url=https://example.com/x"), deps);
    expect(bad.status).toBe(400);
  });

  it("502 when upstream fails", async () => {
    const failing = { fetchFn: (async () => new Response("x", { status: 500 })) as unknown as typeof fetch };
    expect((await handleInfo(req(`/api/info${q("")}`), failing)).status).toBe(502);
  });
});

describe("handleWallpaper", () => {
  it("returns a png at the scaled preset size", async () => {
    const res = await handleWallpaper(req(`/api/wallpaper${q("&preset=windows-fhd&scale=0.25")}`), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([480, 270]);
  }, 30_000);

  it("400 on unknown preset, bad layout, bad scale", async () => {
    expect((await handleWallpaper(req(`/api/wallpaper${q("&preset=nope")}`), deps)).status).toBe(400);
    expect((await handleWallpaper(req(`/api/wallpaper${q("&preset=windows-fhd&layout=x")}`), deps)).status).toBe(400);
    expect((await handleWallpaper(req(`/api/wallpaper${q("&preset=windows-fhd&scale=5")}`), deps)).status).toBe(400);
    expect((await handleWallpaper(req(`/api/wallpaper${q("")}`), deps)).status).toBe(400);
  });
});

describe("handleZip", () => {
  it("returns a zip filtered by platform", async () => {
    const res = await handleZip(req(`/api/zip${q("&platforms=ios")}`), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    const names = Object.keys(unzipSync(new Uint8Array(await res.arrayBuffer())));
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((n) => n.startsWith("ios/"))).toBe(true);
  }, 30_000);

  it("400 on unknown platform", async () => {
    expect((await handleZip(req(`/api/zip${q("&platforms=beos")}`), deps)).status).toBe(400);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/handlers.test.ts`
Expected: FAIL — cannot resolve `../src/web/handlers`.

- [x] **Step 3: Implement** — `src/web/handlers.ts`

```ts
import { buildZip } from "../bundle";
import { getPreset, PLATFORMS, presetsFor, type Platform } from "../presets";
import { LAYOUTS, renderWallpaper, type Layout } from "../render";
import { fetchArtwork, parseSpotifyUrl } from "../spotify";

export interface Deps {
  fetchFn?: typeof fetch;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

async function guarded(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: "Internal error" }, 500);
  }
}

function readCommon(req: Request) {
  const params = new URL(req.url).searchParams;
  const url = params.get("url");
  if (!url) throw new HttpError(400, "Missing url parameter");
  try {
    parseSpotifyUrl(url);
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }
  const layout = (params.get("layout") ?? "blur") as Layout;
  if (!LAYOUTS.includes(layout)) throw new HttpError(400, `Unknown layout: ${layout}`);
  return { url, layout, params };
}

async function load(url: string, deps: Deps) {
  try {
    return await fetchArtwork(url, deps.fetchFn);
  } catch (err) {
    throw new HttpError(502, (err as Error).message);
  }
}

export function handleInfo(req: Request, deps: Deps = {}): Promise<Response> {
  return guarded(async () => {
    const { url } = readCommon(req);
    const art = await load(url, deps);
    return json(
      { width: art.width, height: art.height, sourceUrl: art.sourceUrl },
      200,
      { "cache-control": "public, max-age=3600" },
    );
  });
}

export function handleWallpaper(req: Request, deps: Deps = {}): Promise<Response> {
  return guarded(async () => {
    const { url, layout, params } = readCommon(req);
    const presetId = params.get("preset");
    if (!presetId) throw new HttpError(400, "Missing preset parameter");
    let preset;
    try {
      preset = getPreset(presetId);
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
    const scale = Number(params.get("scale") ?? "1");
    if (!(scale >= 0.05 && scale <= 1)) throw new HttpError(400, "scale must be between 0.05 and 1");

    const art = await load(url, deps);
    const png = await renderWallpaper(
      art.buffer,
      { width: Math.round(preset.width * scale), height: Math.round(preset.height * scale) },
      { layout },
    );
    return new Response(new Uint8Array(png), {
      headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
    });
  });
}

export function handleZip(req: Request, deps: Deps = {}): Promise<Response> {
  return guarded(async () => {
    const { url, layout, params } = readCommon(req);
    const raw = params.get("platforms");
    const platforms = raw ? (raw.split(",").map((s) => s.trim()) as Platform[]) : undefined;
    for (const p of platforms ?? []) {
      if (!PLATFORMS.includes(p)) throw new HttpError(400, `Unknown platform: ${p}`);
    }
    const art = await load(url, deps);
    const zip = await buildZip(art.buffer, presetsFor(platforms), { layout });
    return new Response(new Uint8Array(zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": 'attachment; filename="albumwall.zip"',
      },
    });
  });
}
```

- [x] **Step 4: Run all tests**

Run: `npm test`
Expected: `7 passed` files, `28 passed` tests.
Plan deviation (user-requested): three CLI argument tests in `tests/cli.test.ts` increase the expected total from Plan 2's 25 to 28 tests; with `tests/handlers.test.ts` this is 7 test files (previously 6). Observed: 7 files and 28 tests passed.

- [x] **Step 5: Commit**

```bash
git add src/web tests/handlers.test.ts
git commit -m "feat: add info, wallpaper and zip handlers"
```

### Task 6: Next.js app shell

No unit tests; verified by production build and Task 7.

**Files:**
- Create: `next.config.ts`, `app/api/info/route.ts`, `app/api/wallpaper/route.ts`, `app/api/zip/route.ts`, `app/layout.tsx`, `app/manifest.ts`, `app/page.tsx`, `scripts/make-icons.ts`
- Modify: `package.json` (scripts), `.gitignore`

- [x] **Step 1: `next.config.ts`**

```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["sharp"],
};

export default config;
```

- [x] **Step 2: Route adapters**

`app/api/info/route.ts`:

```ts
import { handleInfo } from "../../../src/web/handlers";

export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = (req: Request) => handleInfo(req);
```

`app/api/wallpaper/route.ts`:

```ts
import { handleWallpaper } from "../../../src/web/handlers";

export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = (req: Request) => handleWallpaper(req);
```

`app/api/zip/route.ts`:

```ts
import { handleZip } from "../../../src/web/handlers";

export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = (req: Request) => handleZip(req);
```

- [x] **Step 3: Layout and manifest**

`app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Albumwall",
  description: "Turn Spotify album art into wallpapers for every device.",
};

export const viewport: Viewport = { themeColor: "#121212" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#121212", color: "#eee", fontFamily: "system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
```

`app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Albumwall",
    short_name: "Albumwall",
    start_url: "/",
    display: "standalone",
    background_color: "#121212",
    theme_color: "#121212",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
```

- [x] **Step 4: Page** — `app/page.tsx`

```tsx
"use client";

import { useState } from "react";
import { PRESETS, PLATFORMS, type Platform } from "../src/presets";

type Layout = "blur" | "solid";

export default function Home() {
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>([...PLATFORMS]);
  const [layout, setLayout] = useState<Layout>("blur");
  const [info, setInfo] = useState<{ width: number } | null>(null);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    setInfo(null);
    setSubmitted("");
    const res = await fetch(`/api/info?url=${encodeURIComponent(input.trim())}`);
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Request failed");
      return;
    }
    setInfo(body);
    setSubmitted(input.trim());
  }

  function toggle(p: Platform) {
    setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  const base = `url=${encodeURIComponent(submitted)}&layout=${layout}`;
  const shown = PRESETS.filter((p) => platforms.includes(p.platform));

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <h1>Albumwall</h1>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="https://open.spotify.com/album/..."
        style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
      />
      <div style={{ margin: "8px 0", display: "flex", gap: 12, flexWrap: "wrap" }}>
        {PLATFORMS.map((p) => (
          <label key={p}>
            <input type="checkbox" checked={platforms.includes(p)} onChange={() => toggle(p)} /> {p}
          </label>
        ))}
        <select value={layout} onChange={(e) => setLayout(e.target.value as Layout)}>
          <option value="blur">blur</option>
          <option value="solid">solid</option>
        </select>
        <button onClick={submit} disabled={!input.trim()}>
          Load
        </button>
      </div>
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}
      {info && info.width < 640 && (
        <p>Source art is {info.width}px, so wallpapers will look softer.</p>
      )}
      {submitted && (
        <>
          <a href={`/api/zip?${base}&platforms=${platforms.join(",")}`} download>
            Download zip ({shown.length} wallpapers)
          </a>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginTop: 12 }}>
            {shown.map((p) => (
              <figure key={p.id} style={{ margin: 0 }}>
                <img
                  src={`/api/wallpaper?${base}&preset=${p.id}&scale=0.15`}
                  alt={p.label}
                  loading="lazy"
                  style={{ width: "100%", height: "auto" }}
                />
                <figcaption style={{ fontSize: 12 }}>{p.label}</figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
```

- [x] **Step 5: Icons** — `scripts/make-icons.ts`

```ts
import sharp from "sharp";

for (const size of [192, 512]) {
  const inner = Math.round(size * 0.5);
  const square = await sharp({
    create: { width: inner, height: inner, channels: 3, background: "#1db954" },
  })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: "#121212" } })
    .composite([{ input: square, gravity: "centre" }])
    .png()
    .toFile(`public/icon-${size}.png`);
}
console.log("icons written");
```

Run: `npx tsx scripts/make-icons.ts`
Expected: `icons written`; `public/icon-192.png` and `public/icon-512.png` exist. Placeholder art (green square on dark); replace with real artwork later.

- [x] **Step 6: Scripts and ignores**

Add to `package.json` `scripts`:

```json
"dev": "next dev",
"build": "next build",
"start": "next start",
"icons": "tsx scripts/make-icons.ts",
"typecheck": "tsc --noEmit"
```

Set `.gitignore` to:

```
node_modules
out
.next
next-env.d.ts
tsconfig.tsbuildinfo
```

- [x] **Step 7: Build**

Run: `npm run typecheck && npm run build`
Expected: no type errors; route table lists `/`, `/api/info`, `/api/wallpaper`, `/api/zip`, `/manifest.webmanifest`.

- [x] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Next.js site and PWA manifest"
```

### Task 7: Smoke test

- [x] **Step 1: Offline checks**

```bash
npm run build && npx next start -p 3111 &
sleep 6
for u in "/" "/manifest.webmanifest" "/icon-192.png" "/api/info" "/api/info?url=https://example.com/x"; do
  printf "%s -> " "$u"; curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "http://localhost:3111$u"
done
```

Expected: `/` 200 `text/html`; manifest 200 `application/manifest+json`; icon 200 `image/png`; both `/api/info` calls 400 `application/json`. Observed: all expected routes and statuses passed; `next start` emitted its standalone-mode warning.

- [x] **Step 2: Live checks**

Observed: live Spotify check verified; the app loaded and preview/zip flow worked.

Open `http://localhost:3111`, paste a real album link, click Load.
Expected: previews appear; zip downloads and unzips to `<platform>/<id>.png`. If previews are 300px-sourced, the "softer" notice shows (the unofficial 640px swap failed).

- [x] **Step 3: Stop the server**

```bash
kill %1
```

- [ ] **Step 4: Check on a phone**

NOT RUN: requires a phone and a deployed or tunneled site; deployment is prohibited for this workflow.

Deploy or tunnel the site, open it in Chrome (Android) or Safari (iOS), install to home screen.
Expected: launches standalone with the icon. Not verified here; iOS install behaviour varies.

### Task 8: Open-source packaging

Docker CLI is not installed and GitHub Actions cannot be run in this sandbox. Packaging files were reviewed; Docker build and GitHub Actions execution were not run.

**Files:**
- Create: `LICENSE`, `README.md`, `Dockerfile`, `.dockerignore`, `.github/workflows/ci.yml`

- [x] **Step 1: `LICENSE`** — MIT (swap for AGPL-3.0 if you want hosted forks to share changes)

```
MIT License

Copyright (c) 2026 Moses

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Copyright holder confirmed by the user: Moses.

- [x] **Step 2: `README.md`**

```markdown
# Albumwall

Turn Spotify album art into wallpapers for Android, iOS, macOS, Windows and Linux.

## Use

    npm install
    npm run dev          # website on http://localhost:3000
    npm run cli -- "https://open.spotify.com/album/<id>" --platform ios,android

No Spotify account or API key needed. Album art comes from Spotify's public oEmbed endpoint.

## Known limits

- Art is 640px at best (300px if Spotify's unofficial size URL stops working), so large wallpapers show it centered over a blurred background, not stretched.
- Relies on undocumented/unguaranteed behaviour of Spotify's oEmbed and image CDN. It may break.

## Disclaimer

Not affiliated with or endorsed by Spotify. Album art belongs to its rights holders. For personal use.

## Development

    npm test
    npm run typecheck
    npm run build

## License

MIT
```

- [ ] **Step 3: `Dockerfile`**

```dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

`.dockerignore`:

```
node_modules
.next
out
.git
```

NOT RUN: Docker CLI is not installed.

Run: `docker build -t albumwall . && docker run -p 3000:3000 albumwall`
Expected: site on `http://localhost:3000`, and a wallpaper preview renders (confirms `sharp` is in the image).

- [x] **Step 4: `.github/workflows/ci.yml`**

Workflow file created and reviewed. GitHub Actions execution NOT RUN; no GitHub integration enabled and no push/deploy authorized.

```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: add license, readme, docker and ci"
```

### Task 9: Pre-publish gate

Do before making the repo or site public.

| Check | Action |
|---|---|
| Spotify artwork policy | Superseded as the application's source: the current website and CLI do not fetch Spotify artwork. Users supply files and attest that they have permission; optional credits are included in ZIPs. This does not verify user rights or provide legal clearance. See [Spotify Developer Terms](https://developer.spotify.com/terms) and [Design & Branding Guidelines](https://developer.spotify.com/documentation/design); do not imply that arbitrary Spotify-derived uploads are authorized. |
| Public hosting abuse | Live on Vercel at [https://albumwall-lemon.vercel.app](https://albumwall-lemon.vercel.app). The project uses the Next.js preset. Vercel SSO protection is disabled so its generated domains are public (including future preview deployments). Upstash Redis is on the Free plan with auto-upgrade disabled; the limiter accepts both Vercel's `KV_REST_API_URL`/`KV_REST_API_TOKEN` names and standard Upstash names. Quotas: upload URL and quick preview 10/minute each; full-resolution preview and ZIP 3/minute each. The `albumwall-temp` Blob store is private and connected with OIDC; `ALBUMWALL_RATE_LIMIT_HASH_SECRET` and production `CRON_SECRET` are configured. Live smoke: `/` and the manifest returned 200; unauthenticated cleanup returned 401; signed upload URL and private Blob PUT succeeded; quick preview returned 3 iOS presets; retrying preview after processing returned 400 because the source had been deleted; ZIP returned 200 with 3 entries. Vercel lists `/api/cron/cleanup-temp` at `0 4 * * *`; authenticated scheduled cleanup was not manually invoked. The new full-screen comparison UI and `/api/full-preview` are implemented and locally tested, but have not been redeployed; the public alias is still on the earlier build. |
| Compute cost | Platform selection starts empty; uploads are capped at 10 MiB and 40 million pixels, and requests render only selected presets. All platforms can still be selected together; no host benchmark, per-request preset/output cap, or concurrency cap has been verified. |
| Unofficial 640px URL | Superseded: the app no longer fetches Spotify image URLs. Output resolution depends on the user-supplied image; the historical Task 7 640×640 result is not representative of current source behavior. |

---

## Self-review

Plan deviations: user-requested CLI tests were added earlier; the product redesign removed Spotify fetching in favor of user-supplied files; Vercel deployment uses private temporary Blob uploads and daily stale-object cleanup. Current worktree verification is 27 tests across 7 files; `npm test`, `npm run typecheck`, the local standalone-output build, and the Vercel-mode build passed. The corrected Next.js project is deployed publicly at [https://albumwall-lemon.vercel.app](https://albumwall-lemon.vercel.app), but the latest comparison-viewer changes remain local and are not yet deployed. Live production checks exercised Vercel's Upstash-backed limiter, OIDC-backed private upload, quick preview, ZIP generation, immediate source deletion, and cron authentication; the scheduled job is registered but was not manually run. Vercel SSO protection is off for generated deployment domains, so preview deployments are public too.

| Check | Result |
|---|---|
| Paste link, preview, download zip | Tasks 5–6 |
| PWA on phone | Manifest and icons (Task 6); phone install not verified (Task 7 Step 4 NOT RUN). No service worker or offline mode: the app needs the server, so offline adds nothing |
| Open-source ready | Task 8 |
| Placeholders | None |
| Verified here | Current worktree: 27 tests passed across 7 files; `npm test`, `npm run typecheck`, `npm run build`, and `VERCEL=1 npm run build` pass. Handler tests verify `/api/full-preview` streams a native-size PNG and deletes its private source; malformed metadata returns 400, and the new route has a 3/minute rate limit. The existing production deployment returns 200 for `/` and the manifest; its live private Blob upload, quick preview (3 iOS presets), source deletion, ZIP (3 entries), and unauthenticated cron 401 passed. The daily cleanup schedule is registered at `0 4 * * *`; Upstash uses Free with auto-upgrade disabled, and Blob is private/OIDC. Source audit found no Spotify API/artwork fetch code in the app or CLI. |
| Not verified here | Deployment/live smoke of the newly added full-screen UI and `/api/full-preview`; authenticated execution of the scheduled cleanup job; user image ownership/license scope; host-specific CPU/memory/time/concurrency benchmarks and a cap when all platforms are selected; phone install (Task 7 Step 4 NOT RUN); Docker image build (Docker CLI unavailable); and GitHub Actions execution (no Git remote/push) |
| Type consistency | Names match across tasks; code was compiled |

## Later product redesign (2026-11-10)
The originally implemented Spotify URL/oEmbed/CDN artwork flow described in this historical plan was removed after launch review identified restrictions on altering/downloading artwork. The current product instead accepts user-supplied single-frame PNG/JPEG/WebP images for both website and CLI; it performs no Spotify API, oEmbed, image CDN, or remote artwork fetch. Users must attest to rights and provide attribution when required. The implementation and tests in the current repository supersede the old route, UI, CLI, legal-copy, and verification descriptions above. Task 9's default-all-platform behavior was also replaced: platform selection starts empty, and preview/download reject absent or empty selections.
