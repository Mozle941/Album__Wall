import { randomUUID, timingSafeEqual } from "node:crypto";
import { del, get, issueSignedToken, list, presignUrl } from "@vercel/blob";
import { buildZip } from "../bundle";
import { validateImage, ImageInputError, MAX_IMAGE_BYTES } from "../image-input";
import { ASPECT_RATIOS, dimensionsForRatio, PLATFORMS, presetsFor, type AspectRatio, type Platform } from "../presets";
import { renderWallpaper } from "../render";
const PREVIEW_SCALE = 0.15;
export const TEMP_PREFIX = "albumwall-temp/";
const MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
const UUID_PATH = /^albumwall-temp\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpe?g|webp)$/i;
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
function json(body: unknown, status = 200): Response { return Response.json(body, { status, headers: { "cache-control": "no-store" } }); }
async function guarded(fn: () => Promise<Response>): Promise<Response> {
  try { return await fn(); } catch (err) {
    if (err instanceof HttpError || err instanceof ImageInputError) return json({ error: err.message }, err.status);
    console.error(err); return json({ error: "Internal error" }, 500);
  }
}
function fields(data: Record<string, unknown>) {
  if (data.rights !== true) throw new HttpError(400, "Confirm that you own the image or have permission/a license allowing its use");
  const raw = String(data.platforms ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!raw.length) throw new HttpError(400, "Select at least one platform");
  const platforms = [...new Set(raw)] as Platform[];
  for (const platform of platforms) if (!PLATFORMS.includes(platform)) throw new HttpError(400, `Unknown platform: ${platform}`);
  const aspectRatio = String(data.aspectRatio ?? "device") as AspectRatio;
  if (!ASPECT_RATIOS.includes(aspectRatio)) throw new HttpError(400, `Unknown aspect ratio: ${aspectRatio}`);
  const credits = String(data.credits ?? "").trim();
  if (credits.length > 2000) throw new HttpError(400, "Attribution text must be 2,000 characters or fewer");
  return { presets: presetsFor(platforms), aspectRatio, credits };
}
function validPath(path: unknown): path is string { return typeof path === "string" && UUID_PATH.test(path); }
async function jsonObject(req: Request, message: string): Promise<Record<string, unknown>> {
  let body: unknown;
  try { body = await req.json(); } catch { throw new HttpError(400, message); }
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new HttpError(400, message);
  return body as Record<string, unknown>;
}
function metadataFromBody(body: Record<string, unknown>) {
  if (!validPath(body.pathname)) throw new HttpError(400, "Invalid temporary image path");
  return { path: body.pathname, ...fields(body) };
}
async function readObject(path: string): Promise<{ art: Buffer; etag?: string }> {
  const object = await get(path, { access: "private" });
  if (!object) throw new HttpError(400, "Temporary image not found or expired");
  const { stream, blob } = object;
  if (!stream || blob.size > MAX_IMAGE_BYTES) throw new HttpError(413, "Image exceeds the 10 MiB upload limit");
  try {
    const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_IMAGE_BYTES) throw new HttpError(413, "Image exceeds the 10 MiB upload limit"); chunks.push(value); }
    return { art: Buffer.concat(chunks), etag: blob.etag };
  } finally { /* consumer owns cleanup via del in endpoint finally */ }
}
async function metadata(req: Request) { return metadataFromBody(await jsonObject(req, "Expected JSON metadata")); }
export async function handleUploadUrl(req: Request): Promise<Response> {
  return guarded(async () => {
    const body = await jsonObject(req, "Expected JSON upload metadata");
    if (body.rights !== true) throw new HttpError(400, "Confirm that you own the image or have permission/a license allowing its use");
    fields(body);
    const type = String(body.contentType ?? "");
    if (!MIME_TYPES.includes(type)) throw new HttpError(415, "Upload a PNG, JPEG, or WebP image");
    const extension = type === "image/jpeg" ? "jpg" : type.slice(6);
    const pathname = `${TEMP_PREFIX}${randomUUID()}.${extension}`;
    const validUntil = Date.now() + 5 * 60 * 1000;
    const token = await issueSignedToken({ pathname, operations: ["put"], validUntil, allowedContentTypes: MIME_TYPES, maximumSizeInBytes: MAX_IMAGE_BYTES });
    const result = await presignUrl(token, { operation: "put", pathname, access: "private", validUntil, allowedContentTypes: MIME_TYPES, maximumSizeInBytes: MAX_IMAGE_BYTES, allowOverwrite: false, addRandomSuffix: false });
    return json({ pathname, url: result.presignedUrl, validUntil });
  });
}
export function handlePreview(req: Request): Promise<Response> {
  return guarded(async () => {
    const { path, presets, aspectRatio } = await metadata(req);
    let etag: string | undefined;
    try {
      const object = await readObject(path); etag = object.etag; const { art } = object; await validateImage(art);
      const previews = [];
      for (const preset of presets) { const dimensions = dimensionsForRatio(preset.width, preset.height, aspectRatio); const width = Math.max(1, Math.round(dimensions.width * PREVIEW_SCALE)); const height = Math.max(1, Math.round(dimensions.height * PREVIEW_SCALE)); const data = await renderWallpaper(art, { width, height }); previews.push({ id: preset.id, platform: preset.platform, label: preset.label, width: dimensions.width, height: dimensions.height, data: `data:image/png;base64,${data.toString("base64")}` }); }
      return json({ previews });
    } finally { await del(path, etag ? { ifMatch: etag } : undefined); }
  });
}
export function handleFullPreview(req: Request): Promise<Response> {
  return guarded(async () => {
    const body = await jsonObject(req, "Expected JSON metadata");
    if (!validPath(body.pathname)) throw new HttpError(400, "Invalid temporary image path");
    const path = body.pathname;
    let etag: string | undefined;
    try {
      const { presets, aspectRatio } = fields(body);
      const presetId = typeof body.presetId === "string" ? body.presetId : "";
      const preset = presets.find((item) => item.id === presetId);
      if (!preset) throw new HttpError(400, "Requested preset is not included in the selected platforms");
      const object = await readObject(path); etag = object.etag; const { art } = object; await validateImage(art);
      const dimensions = dimensionsForRatio(preset.width, preset.height, aspectRatio);
      const data = await renderWallpaper(art, dimensions);
      const stream = new ReadableStream<Uint8Array>({ start(controller) { const chunkSize = 64 * 1024; for (let offset = 0; offset < data.length; offset += chunkSize) controller.enqueue(new Uint8Array(data.subarray(offset, Math.min(offset + chunkSize, data.length)))); controller.close(); } });
      return new Response(stream, { headers: { "content-type": "image/png", "content-disposition": `inline; filename="${preset.id}.png"`, "cache-control": "no-store" } });
    } finally { await del(path, etag ? { ifMatch: etag } : undefined); }
  });
}
export function handleZip(req: Request): Promise<Response> {
  return guarded(async () => {
    const { path, presets, aspectRatio, credits } = await metadata(req);
    let etag: string | undefined;
    try {
      const object = await readObject(path); etag = object.etag; const { art } = object; await validateImage(art);
      const ratioPresets = presets.map((preset) => ({ ...preset, ...dimensionsForRatio(preset.width, preset.height, aspectRatio) }));
      const zip = await buildZip(art, ratioPresets, credits || undefined);
      const stream = new ReadableStream<Uint8Array>({ start(controller) { const chunkSize = 64 * 1024; for (let offset = 0; offset < zip.length; offset += chunkSize) controller.enqueue(new Uint8Array(zip.subarray(offset, Math.min(offset + chunkSize, zip.length)))); controller.close(); } });
      return new Response(stream, { headers: { "content-type": "application/zip", "content-disposition": 'attachment; filename="albumwall.zip"', "cache-control": "no-store" } });
    } finally { await del(path, etag ? { ifMatch: etag } : undefined); }
  });
}
function equalSecret(a: string, b: string) { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
export async function handleTempCleanup(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || !equalSecret(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return json({ error: "Unauthorized" }, 401);
  return guarded(async () => {
    const cutoff = Date.now() - 60 * 60 * 1000; let cursor: string | undefined; let deleted = 0;
    do {
      const page = await list({ prefix: TEMP_PREFIX, limit: 1000, ...(cursor ? { cursor } : {}) });
      for (const blob of page.blobs) if (blob.pathname.startsWith(TEMP_PREFIX) && blob.uploadedAt.getTime() < cutoff) { await del(blob.pathname, { ifMatch: blob.etag }); deleted++; }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return json({ deleted });
  });
}
