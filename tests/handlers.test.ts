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
