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
