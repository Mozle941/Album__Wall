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

  assertSpotifyCdn(thumbnail);
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
