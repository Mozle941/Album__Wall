import sharp from "sharp";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { handlePreview, handleZip } from "../src/web/handlers";

const png = (width = 64, height = width) => sharp({ create: { width, height, channels: 3, background: "#cc3366" } }).png().toBuffer();
async function form(fields: Record<string, string> = {}, image?: Buffer, filename = "art.png") {
  const data = new FormData();
  if (image) data.set("image", new File([new Uint8Array(image)], filename, { type: filename.endsWith(".gif") ? "image/gif" : "image/png" }));
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return new Request("http://localhost/api/preview", { method: "POST", body: data });
}
describe("user artwork endpoints", () => {
  it("returns all selected low-resolution previews in one response", async () => {
    const res = await handlePreview(await form({ platforms: "windows,ios", layout: "solid", rights: "true" }, await png()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.previews).toHaveLength(6);
    expect(body.previews[0]).toMatchObject({ id: expect.any(String), label: expect.any(String), data: expect.stringMatching(/^data:image\/png;base64,/) });
  });
  it("rejects missing image, rights, or selected platforms", async () => {
    expect((await handlePreview(await form({ platforms: "ios", rights: "true" }))).status).toBe(400);
    expect((await handlePreview(await form({ platforms: "ios" }, await png()))).status).toBe(400);
    expect((await handlePreview(await form({ platforms: "", rights: "true" }, await png()))).status).toBe(400);
  });
  it("rejects unsupported formats, malformed image bytes, and oversized bodies", async () => {
    expect((await handlePreview(await form({ platforms: "ios", rights: "true" }, await png(), "x.gif"))).status).toBe(415);
    const bad = new FormData(); bad.set("image", new File(["not an image"], "x.png", { type: "image/png" })); bad.set("platforms", "ios"); bad.set("rights", "true");
    expect((await handlePreview(new Request("http://localhost/api/preview", { method: "POST", body: bad }))).status).toBe(415);
    const oversized = { headers: new Headers({ "content-length": "11534336" }) } as Request;
    expect((await handlePreview(oversized)).status).toBe(413);
  });
  it("returns a platform-filtered ZIP and includes optional credits at a fixed path", async () => {
    const res = await handleZip(await form({ platforms: "ios", layout: "blur", rights: "true", credits: "Artist — licensed with permission" }, await png()));
    expect(res.status).toBe(200);
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(files).every((n) => n.startsWith("ios/") || n === "CREDITS.txt")).toBe(true);
    expect(Buffer.from(files["CREDITS.txt"]).toString()).toContain("Artist — licensed with permission");
  }, 30_000);
  it("rejects unknown platforms and invalid layout", async () => {
    expect((await handleZip(await form({ platforms: "beos", rights: "true" }, await png()))).status).toBe(400);
    expect((await handleZip(await form({ platforms: "ios", layout: "x", rights: "true" }, await png()))).status).toBe(400);
  });
});
