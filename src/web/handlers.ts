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
