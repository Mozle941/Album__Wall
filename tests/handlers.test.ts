import sharp from "sharp";
import { unzipSync } from "fflate";
import { describe, expect, it, vi, beforeEach } from "vitest";
const blob = vi.hoisted(() => ({ issueSignedToken: vi.fn(), presignUrl: vi.fn(), get: vi.fn(), del: vi.fn(), list: vi.fn() }));
vi.mock("@vercel/blob", () => blob);
import { handlePreview, handleFullPreview, handleZip, handleUploadUrl, handleTempCleanup } from "../src/web/handlers";
const uuid = "550e8400-e29b-41d4-a716-446655440000";
const path = `albumwall-temp/${uuid}.png`;
const png = () => sharp({ create: { width: 64, height: 64, channels: 3, background: "#cc3366" } }).png().toBuffer();
const body = (pathname = path, fields: Record<string, unknown> = {}) => new Request("http://localhost/api/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pathname, platforms: "ios", rights: true, ...fields }) });
async function mockBlob(content?: Buffer) {
  const data = content ?? await png();
  blob.get.mockResolvedValue({ statusCode: 200, blob: { etag: '"etag"', size: data.length }, stream: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(data)); c.close(); } }) });
}
beforeEach(() => { vi.clearAllMocks(); blob.issueSignedToken.mockResolvedValue({ clientSigningToken: "t", delegationToken: "d" }); blob.presignUrl.mockResolvedValue({ presignedUrl: "https://private.test/signed" }); blob.del.mockResolvedValue(undefined); });
describe("private Blob upload and processing", () => {
  it("issues a five-minute single-path put token with type and size constraints after metadata/rights validation", async () => {
    const res = await handleUploadUrl(new Request("http://localhost/api/upload-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contentType: "image/png", platforms: "ios", rights: true }) }));
    expect(res.status).toBe(200); const result = await res.json(); expect(result.pathname).toMatch(/^albumwall-temp\/[0-9a-f-]+\.png$/); expect(result.url).toBe("https://private.test/signed");
    expect(blob.issueSignedToken).toHaveBeenCalledWith(expect.objectContaining({ pathname: result.pathname, operations: ["put"], maximumSizeInBytes: 10 * 1024 * 1024, allowedContentTypes: ["image/png", "image/jpeg", "image/webp"] }));
    expect(blob.presignUrl).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pathname: result.pathname, operation: "put", access: "private", allowOverwrite: false }));
  });
  it("rejects invalid upload metadata, rights, MIME, and arbitrary paths", async () => {
    const make = (v: unknown) => new Request("http://localhost/api/upload-url", { method: "POST", body: JSON.stringify(v) });
    expect((await handleUploadUrl(make({ contentType: "image/png", platforms: "ios", rights: false }))).status).toBe(400);
    expect((await handleUploadUrl(make({ contentType: "image/gif", platforms: "ios", rights: true }))).status).toBe(415);
    expect((await handleUploadUrl(make({ contentType: "image/png", platforms: "beos", rights: true }))).status).toBe(400);
    expect((await handleUploadUrl(make({ contentType: "image/png", platforms: "ios", rights: true, aspectRatio: "3:2" }))).status).toBe(400);
    expect((await handleUploadUrl(make({ contentType: "image/png", platforms: "ios", rights: true, outputFormat: "gif" }))).status).toBe(400);
    expect((await handlePreview(body("https://evil.test/x.png"))).status).toBe(400);
    expect(blob.get).not.toHaveBeenCalled();
  });
  it("reads only private blobs and deletes after successful preview and invalid image processing", async () => {
    await mockBlob(); const ok = await handlePreview(body()); expect(ok.status).toBe(200); expect(blob.get).toHaveBeenCalledWith(path, { access: "private" }); expect(blob.del).toHaveBeenCalledWith(path, { ifMatch: '"etag"' });
    vi.clearAllMocks(); await mockBlob(Buffer.from("bad image")); const bad = await handlePreview(body()); expect(bad.status).toBe(415); expect(blob.del).toHaveBeenCalledWith(path, { ifMatch: '"etag"' });
  });
  it("renders one allowed preset at native dimensions, streams PNG, and deletes source", async () => {
    await mockBlob(); const res = await handleFullPreview(body(path, { presetId: "ios-iphone-13" }));
    expect(res.status).toBe(200); expect(res.headers.get("content-type")).toBe("image/png"); expect(res.body).toBeTruthy();
    expect(await sharp(Buffer.from(await res.arrayBuffer())).metadata()).toMatchObject({ width: 1170, height: 2532, format: "png" });
    expect(blob.get).toHaveBeenCalledWith(path, { access: "private" }); expect(blob.del).toHaveBeenCalledWith(path, { ifMatch: '"etag"' });
  });
  it("uses a selected aspect ratio for preview and full-resolution output", async () => {
    await mockBlob();
    const previewResponse = await handlePreview(body(path, { aspectRatio: "9:16" }));
    expect(previewResponse.status).toBe(200);
    expect((await previewResponse.json()).previews[0]).toMatchObject({ width: 1424, height: 2532 });
    await mockBlob();
    const fullResponse = await handleFullPreview(body(path, { presetId: "ios-iphone-13", aspectRatio: "9:16" }));
    expect(fullResponse.status).toBe(200);
    expect(await sharp(Buffer.from(await fullResponse.arrayBuffer())).metadata()).toMatchObject({ width: 1424, height: 2532, format: "png" });
  });
  it("rejects malformed JSON values without treating them as metadata objects", async () => {
    for (const value of ["null", "[]", "false", "42", "\"text\"", "{"]) {
      const req = new Request("http://localhost/api/full-preview", { method: "POST", headers: { "content-type": "application/json" }, body: value });
      expect((await handleFullPreview(req)).status).toBe(400);
    }
    expect(blob.get).not.toHaveBeenCalled(); expect(blob.del).not.toHaveBeenCalled();
  });
  it("rejects unselected presets and failed rights attestation before reading the Blob, deleting valid temp paths", async () => {
    expect((await handleFullPreview(body(path, { presetId: "mac-mbp-14" }))).status).toBe(400);
    expect((await handleFullPreview(body(path, { presetId: "ios-iphone-13", rights: false }))).status).toBe(400);
    expect((await handleFullPreview(body(path, { presetId: "missing" }))).status).toBe(400);
    expect(blob.get).not.toHaveBeenCalled(); expect(blob.del).toHaveBeenCalledTimes(3);
  });
  it("deletes temporary source after invalid full-preview image input", async () => {
    await mockBlob(Buffer.from("bad image")); expect((await handleFullPreview(body(path, { presetId: "ios-iphone-13" }))).status).toBe(415);
    expect(blob.del).toHaveBeenCalledWith(path, { ifMatch: '"etag"' });
  });
  it("streams ZIP output and deletes source on success", async () => {
    await mockBlob(); const res = await handleZip(body()); expect(res.status).toBe(200); expect(res.headers.get("content-disposition")).toContain("albumwall.zip"); expect(res.body).toBeTruthy(); expect(blob.del).toHaveBeenCalledWith(path, { ifMatch: '"etag"' }); expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });
  it("uses the selected aspect ratio in ZIP wallpaper dimensions", async () => {
    await mockBlob();
    const response = await handleZip(body(path, { aspectRatio: "9:16" }));
    expect(response.status).toBe(200);
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(await sharp(Buffer.from(files["ios/ios-iphone-13.png"])).metadata()).toMatchObject({ width: 1424, height: 2532 });
  });
  it("supports selected JPEG format in a batch ZIP", async () => {
    await mockBlob();
    const response = await handleZip(body(path, { outputFormat: "jpeg" }));
    expect(response.status).toBe(200);
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const output = Buffer.from(files["ios/ios-iphone-13.jpg"]);
    expect(await sharp(output).metadata()).toMatchObject({ format: "jpeg", width: 1170, height: 2532 });
  });
  it("authenticates cleanup and deletes only stale temp objects with conditional ETags", async () => {
    process.env.CRON_SECRET = "a-long-cron-secret";
    expect((await handleTempCleanup(new Request("http://localhost/api/cron/cleanup-temp"))).status).toBe(401);
    blob.list.mockResolvedValue({ blobs: [{ pathname: path, uploadedAt: new Date(Date.now() - 7200000), etag: "etag" }, { pathname: "other/private.png", uploadedAt: new Date(0), etag: "x" }], hasMore: false });
    const res = await handleTempCleanup(new Request("http://localhost/api/cron/cleanup-temp", { headers: { authorization: "Bearer a-long-cron-secret" } })); expect(res.status).toBe(200); expect(blob.list).toHaveBeenCalledWith(expect.objectContaining({ prefix: "albumwall-temp/" })); expect(blob.del).toHaveBeenCalledOnce(); expect(blob.del).toHaveBeenCalledWith(path, { ifMatch: "etag" });
    delete process.env.CRON_SECRET;
  });
});
