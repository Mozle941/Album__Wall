import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { assertSpotifyCdn, fetchArtwork, parseSpotifyUrl, upgradeImageUrl } from "../src/spotify";

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

describe("assertSpotifyCdn", () => {
  it("accepts spotify cdn hosts and rejects others", () => {
    expect(() => assertSpotifyCdn("https://i.scdn.co/image/abc")).not.toThrow();
    expect(() => assertSpotifyCdn("https://image-cdn-ak.spotifycdn.com/image/abc")).not.toThrow();
    expect(() => assertSpotifyCdn("http://169.254.169.254/latest")).toThrow("non-Spotify");
    expect(() => assertSpotifyCdn("https://evilscdn.co/x")).toThrow("non-Spotify");
    expect(() => assertSpotifyCdn("nonsense")).toThrow("Invalid image URL");
  });
});
