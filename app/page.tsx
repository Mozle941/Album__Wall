"use client";
import { useState } from "react";
import { PRESETS, PLATFORMS, type Platform } from "../src/presets";
type Layout = "blur" | "solid";
type Preview = { id: string; platform: Platform; label: string; data: string };
export default function Home() {
  const [image, setImage] = useState<File | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [layout, setLayout] = useState<Layout>("blur");
  const [rights, setRights] = useState(false);
  const [credits, setCredits] = useState("");
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function toggle(p: Platform) { setPlatforms((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]); }
  function payload() {
    const data = new FormData();
    if (image) data.set("image", image);
    data.set("platforms", platforms.join(",")); data.set("layout", layout);
    data.set("rights", String(rights)); data.set("credits", credits);
    return data;
  }
  async function preview() {
    setError(""); setPreviews([]); setBusy(true);
    try { const res = await fetch("/api/preview", { method: "POST", body: payload() }); const body = await res.json(); if (!res.ok) throw new Error(body.error ?? "Preview failed"); setPreviews(body.previews); }
    catch (e) { setError(e instanceof Error ? e.message : "Preview failed"); } finally { setBusy(false); }
  }
  async function download() {
    setError(""); setBusy(true);
    try { const res = await fetch("/api/zip", { method: "POST", body: payload() }); if (!res.ok) { const body = await res.json(); throw new Error(body.error ?? "Download failed"); } const blob = await res.blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "albumwall.zip"; a.click(); URL.revokeObjectURL(a.href); }
    catch (e) { setError(e instanceof Error ? e.message : "Download failed"); } finally { setBusy(false); }
  }
  const selected = PRESETS.filter((p) => platforms.includes(p.platform));
  const canGenerate = !!image && platforms.length > 0 && rights && !busy;
  return <main style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
    <h1>Albumwall</h1>
    <p>Make device wallpapers from an image you own or are licensed to use.</p>
    <label>Artwork image (PNG, JPEG, or WebP; max 10 MiB)<br/><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { setImage(e.target.files?.[0] ?? null); setPreviews([]); }}/></label>
    <p style={{ fontSize: 13 }}>Privacy: the image is used transiently to generate previews and downloads; it is not saved to disk or an account.</p>
    <div style={{ margin: "12px 0", display: "flex", gap: 12, flexWrap: "wrap" }}>
      {PLATFORMS.map((p) => <label key={p}><input type="checkbox" checked={platforms.includes(p)} onChange={() => toggle(p)} /> {p}</label>)}
      <select value={layout} onChange={(e) => setLayout(e.target.value as Layout)}><option value="blur">blur</option><option value="solid">solid</option></select>
    </div>
    <label style={{ display: "block", margin: "12px 0" }}><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)}/> I own this image or have permission/a license that permits its use, and I will provide attribution when required.</label>
    <label style={{ display: "block", marginBottom: 12 }}>Optional attribution / credit<br/><input maxLength={2000} value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="Credit text (included as CREDITS.txt)" style={{ width: "100%", padding: 8, boxSizing: "border-box" }}/></label>
    <button onClick={preview} disabled={!canGenerate}>Preview {selected.length} wallpaper{selected.length === 1 ? "" : "s"}</button>{" "}
    <button onClick={download} disabled={!canGenerate}>Download ZIP</button>
    {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}
    {previews.length > 0 && <div><div style={{ margin: "12px 0" }}>Preview ready for {selected.length} wallpapers. <button onClick={download} disabled={!canGenerate}>Download ZIP</button></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
      {previews.map((p) => <figure key={p.id} style={{ margin: 0 }}><img src={p.data} alt={p.label} style={{ width: "100%", height: "auto" }}/><figcaption style={{ fontSize: 12 }}>{p.label}</figcaption></figure>)}
    </div></div>}
  </main>;
}
