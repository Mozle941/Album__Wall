import { buildZip } from "../bundle";
import { validateImage, ImageInputError, MAX_IMAGE_BYTES } from "../image-input";
import { PLATFORMS, presetsFor, type Platform } from "../presets";
import { LAYOUTS, renderWallpaper, type Layout } from "../render";
const PREVIEW_SCALE = 0.15;
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
function json(body: unknown, status = 200): Response { return Response.json(body, { status, headers: { "cache-control": "no-store" } }); }
async function guarded(fn: () => Promise<Response>): Promise<Response> {
  try { return await fn(); } catch (err) {
    if (err instanceof HttpError || err instanceof ImageInputError) return json({ error: err.message }, err.status);
    console.error(err); return json({ error: "Internal error" }, 500);
  }
}
async function readForm(req: Request) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_IMAGE_BYTES + 64 * 1024) throw new HttpError(413, "Request exceeds the 10 MiB image upload limit");
  let form: FormData;
  try { form = await req.formData(); } catch { throw new HttpError(400, "Expected multipart form data with an image file"); }
  const value = form.get("image");
  if (!(value instanceof File) || !value.size) throw new HttpError(400, "Select a non-empty image file");
  if (value.size > MAX_IMAGE_BYTES) throw new HttpError(413, "Image exceeds the 10 MiB upload limit");
  if (!["image/png", "image/jpeg", "image/webp"].includes(value.type)) throw new HttpError(415, "Upload a PNG, JPEG, or WebP image");
  const bytes = Buffer.from(await value.arrayBuffer());
  const imageMeta = await validateImage(bytes);
  const expectedMime = imageMeta.format === "jpeg" ? "image/jpeg" : `image/${imageMeta.format}`;
  if (value.type !== expectedMime) throw new HttpError(415, "Image contents do not match the declared PNG, JPEG, or WebP type");
  const rights = form.get("rights");
  if (rights !== "true") throw new HttpError(400, "Confirm that you own the image or have permission/a license allowing its use");
  const raw = String(form.get("platforms") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!raw.length) throw new HttpError(400, "Select at least one platform");
  const platforms = [...new Set(raw)] as Platform[];
  for (const platform of platforms) if (!PLATFORMS.includes(platform)) throw new HttpError(400, `Unknown platform: ${platform}`);
  const layout = String(form.get("layout") ?? "blur") as Layout;
  if (!LAYOUTS.includes(layout)) throw new HttpError(400, `Unknown layout: ${layout}`);
  const credits = String(form.get("credits") ?? "").trim();
  if (credits.length > 2000) throw new HttpError(400, "Attribution text must be 2,000 characters or fewer");
  return { art: bytes, presets: presetsFor(platforms), layout, credits };
}
export function handlePreview(req: Request): Promise<Response> {
  return guarded(async () => {
    const { art, presets, layout } = await readForm(req);
    const previews = [];
    for (const preset of presets) {
      const width = Math.max(1, Math.round(preset.width * PREVIEW_SCALE));
      const height = Math.max(1, Math.round(preset.height * PREVIEW_SCALE));
      const data = await renderWallpaper(art, { width, height }, { layout });
      previews.push({ id: preset.id, platform: preset.platform, label: preset.label, data: `data:image/png;base64,${data.toString("base64")}` });
    }
    return json({ previews });
  });
}
export function handleZip(req: Request): Promise<Response> {
  return guarded(async () => {
    const { art, presets, layout, credits } = await readForm(req);
    const zip = await buildZip(art, presets, { layout }, credits || undefined);
    return new Response(new Uint8Array(zip), { headers: { "content-type": "application/zip", "content-disposition": 'attachment; filename="albumwall.zip"', "cache-control": "no-store" } });
  });
}
