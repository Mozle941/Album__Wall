"use client";

import { useEffect, useRef, useState } from "react";
import { PRESETS, PLATFORMS, type Platform } from "../src/presets";

type Layout = "blur" | "solid";
type Preview = { id: string; platform: Platform; label: string; data: string };
type ViewMode = "quick" | "full" | "compare";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Home() {
  const [image, setImage] = useState<File | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [layout, setLayout] = useState<Layout>("blur");
  const [rights, setRights] = useState(false);
  const [credits, setCredits] = useState("");
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [error, setError] = useState("");
  const [viewerError, setViewerError] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("quick");
  const [fullImages, setFullImages] = useState<Record<string, string>>({});
  const [loadingFullId, setLoadingFullId] = useState<string | null>(null);

  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const viewerWasOpen = useRef(false);
  const previousOverflow = useRef("");
  const previewGeneration = useRef(0);
  const previewRequestId = useRef(0);
  const fullRequestId = useRef(0);
  const previewController = useRef<AbortController | null>(null);
  const fullController = useRef<AbortController | null>(null);
  const objectUrls = useRef(new Set<string>());

  const activeIndex = previews.findIndex((preview) => preview.id === activeId);
  const active = activeIndex >= 0 ? previews[activeIndex] : undefined;
  const activePreset = active ? PRESETS.find((preset) => preset.id === active.id) : undefined;
  const selected = PRESETS.filter((preset) => platforms.includes(preset.platform));
  const canGenerate = !!image && platforms.length > 0 && rights && !busy;

  function cancelFullRequest() {
    fullRequestId.current++;
    fullController.current?.abort();
    fullController.current = null;
    setLoadingFullId(null);
  }

  function cancelPreviewRequest() {
    previewRequestId.current++;
    previewController.current?.abort();
    previewController.current = null;
    setBusy(false);
  }

  function clearFullImages() {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
    setFullImages({});
  }

  function invalidate() {
    previewGeneration.current++;
    cancelPreviewRequest();
    cancelFullRequest();
    clearFullImages();
    setPreviews([]);
    setActiveId(null);
    setMode("quick");
    setError("");
    setViewerError("");
  }

  function metadata(pathname: string) {
    return { pathname, platforms: platforms.join(","), layout, rights, credits };
  }

  async function upload(signal?: AbortSignal): Promise<string> {
    if (!image) throw new Error("Select an image first");
    if (image.size > 10 * 1024 * 1024) throw new Error("Image exceeds the 10 MiB upload limit");
    const signed = await fetch("/api/upload-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentType: image.type, ...metadata("pending") }),
      signal,
    });
    const signedBody = await signed.json();
    if (!signed.ok) throw new Error(signedBody.error ?? "Could not prepare private upload");
    const put = await fetch(signedBody.url, {
      method: "PUT",
      headers: { "content-type": image.type },
      body: image,
      signal,
    });
    if (!put.ok) throw new Error("Private image upload failed");
    return signedBody.pathname;
  }

  async function preview() {
    setError("");
    invalidate();
    const generation = previewGeneration.current;
    const requestId = ++previewRequestId.current;
    const controller = new AbortController();
    previewController.current = controller;
    setBusy(true);
    try {
      const pathname = await upload(controller.signal);
      const response = await fetch("/api/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(metadata(pathname)),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Preview failed");
      if (generation === previewGeneration.current && !controller.signal.aborted) {
        setPreviews(result.previews);
      }
    } catch (cause) {
      if (!controller.signal.aborted && generation === previewGeneration.current) {
        setError(cause instanceof Error ? cause.message : "Preview failed");
      }
    } finally {
      if (requestId === previewRequestId.current) {
        previewController.current = null;
        setBusy(false);
      }
    }
  }

  async function download() {
    setError("");
    setBusy(true);
    try {
      const pathname = await upload();
      const response = await fetch("/api/zip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(metadata(pathname)),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Download failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "albumwall.zip";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  async function requestFull(presetId: string) {
    if (fullImages[presetId] || loadingFullId === presetId) return;
    if (fullController.current) cancelFullRequest();
    const generation = previewGeneration.current;
    const requestId = ++fullRequestId.current;
    const controller = new AbortController();
    fullController.current = controller;
    setViewerError("");
    setLoadingFullId(presetId);
    try {
      const pathname = await upload(controller.signal);
      const response = await fetch("/api/full-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...metadata(pathname), presetId }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Full-resolution preview failed");
      }
      const url = URL.createObjectURL(await response.blob());
      if (
        controller.signal.aborted ||
        requestId !== fullRequestId.current ||
        generation !== previewGeneration.current ||
        !previews.some((preview) => preview.id === presetId)
      ) {
        URL.revokeObjectURL(url);
        return;
      }
      objectUrls.current.add(url);
      setFullImages((current) => ({ ...current, [presetId]: url }));
    } catch (cause) {
      if (!controller.signal.aborted && requestId === fullRequestId.current) {
        setViewerError(cause instanceof Error ? cause.message : "Full-resolution preview failed");
      }
    } finally {
      if (requestId === fullRequestId.current) {
        fullController.current = null;
        setLoadingFullId(null);
      }
    }
  }

  function navigate(delta: number) {
    if (!previews.length) return;
    cancelFullRequest();
    setViewerError("");
    setActiveId(previews[(Math.max(0, activeIndex) + delta + previews.length) % previews.length].id);
    setMode("quick");
  }

  function selectPreset(presetId: string) {
    if (presetId !== activeId) cancelFullRequest();
    setViewerError("");
    setActiveId(presetId);
    setMode("quick");
  }

  function closeViewer() {
    cancelFullRequest();
    setActiveId(null);
    setMode("quick");
  }

  useEffect(() => {
    if (!active) {
      if (viewerWasOpen.current) {
        openerRef.current?.focus();
        viewerWasOpen.current = false;
      }
      return;
    }

    viewerWasOpen.current = true;
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeViewer();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigate(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        navigate(1);
      } else if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (!focusable?.length) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const focusOutside = !dialogRef.current?.contains(document.activeElement);
        if ((event.shiftKey && (document.activeElement === first || focusOutside))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || focusOutside)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow.current;
    };
  }, [activeId, previews.length]);

  useEffect(() => () => {
    previewController.current?.abort();
    fullController.current?.abort();
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.current.clear();
  }, []);

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <div inert={active ? true : undefined} aria-hidden={active ? "true" : undefined}>
        <h1>Albumwall</h1>
        <p>Make device wallpapers from an image you own or are licensed to use.</p>
        <label>
          Artwork image (PNG, JPEG, or WebP; max 10 MiB)
          <br />
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(event) => {
              setImage(event.target.files?.[0] ?? null);
              invalidate();
            }}
          />
        </label>
        <p style={{ fontSize: 13 }}>
          Privacy: uploads go directly to a private Vercel Blob store. The temporary copy is deleted after each processing request; abandoned uploads are swept daily. Images are not publicly accessible or attached to end-user accounts.
        </p>
        <div style={{ margin: "12px 0", display: "flex", gap: 12, flexWrap: "wrap" }}>
          {PLATFORMS.map((platform) => (
            <label key={platform}>
              <input
                type="checkbox"
                checked={platforms.includes(platform)}
                disabled={busy}
                onChange={() => {
                  setPlatforms((current) => current.includes(platform)
                    ? current.filter((item) => item !== platform)
                    : [...current, platform]);
                  invalidate();
                }}
              /> {platform}
            </label>
          ))}
          <select
            value={layout}
            disabled={busy}
            onChange={(event) => {
              setLayout(event.target.value as Layout);
              invalidate();
            }}
          >
            <option value="blur">blur</option>
            <option value="solid">solid</option>
          </select>
        </div>
        <label style={{ display: "block", margin: "12px 0" }}>
          <input
            type="checkbox"
            checked={rights}
            disabled={busy}
            onChange={(event) => setRights(event.target.checked)}
          /> I own this image or have permission/a license that permits its use, and I will provide attribution when required.
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          Optional attribution / credit
          <br />
          <input
            maxLength={2000}
            value={credits}
            disabled={busy}
            onChange={(event) => setCredits(event.target.value)}
            placeholder="Credit text (included as CREDITS.txt)"
            style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
          />
        </label>
        <button onClick={() => void preview()} disabled={!canGenerate}>
          {busy ? "Preparing…" : `Preview ${selected.length} wallpaper${selected.length === 1 ? "" : "s"}`}
        </button>{" "}
        <button onClick={() => void download()} disabled={!canGenerate}>Download ZIP</button>
        {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}
        {previews.length > 0 && (
          <div>
            <div style={{ margin: "12px 0" }}>
              Preview ready for {previews.length} wallpapers. Select any image to inspect its quick preview or compare it with a native-resolution render.
              {" "}<button onClick={() => void download()} disabled={!canGenerate}>Download ZIP</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
              {previews.map((preview) => (
                <figure key={preview.id} style={{ margin: 0 }}>
                  <button
                    onClick={(event) => {
                      openerRef.current = event.currentTarget;
                      setActiveId(preview.id);
                      setMode("quick");
                      setViewerError("");
                    }}
                    aria-haspopup="dialog"
                    aria-label={`Open full-screen preview: ${preview.label}`}
                    style={{ cursor: "zoom-in", border: 0, padding: 0, background: "transparent", width: "100%" }}
                  >
                    <img src={preview.data} alt={preview.label} style={{ width: "100%", height: "auto" }} />
                  </button>
                  <figcaption style={{ fontSize: 12 }}>{preview.label}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        )}
      </div>

      {active && activePreset && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${active.label} wallpaper preview`}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeViewer();
          }}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.96)", color: "white", display: "flex", flexDirection: "column", padding: 12, boxSizing: "border-box" }}
        >
          <header className="viewer-header">
            <button ref={closeRef} onClick={closeViewer} aria-label="Close preview">Close</button>
            <button onClick={() => navigate(-1)} aria-label="Previous preset">← Previous</button>
            <button onClick={() => navigate(1)} aria-label="Next preset">Next →</button>
            <strong style={{ flex: 1 }}>{active.label}</strong>
            <span>{activePreset.width} × {activePreset.height} px</span>
          </header>

          <nav aria-label="Preview quality" className="viewer-controls">
            <button aria-pressed={mode === "quick"} onClick={() => setMode("quick")}>Quick preview (15%)</button>
            <button aria-pressed={mode === "full"} onClick={() => { setMode("full"); void requestFull(active.id); }}>Full resolution</button>
            <button aria-pressed={mode === "compare"} onClick={() => { setMode("compare"); void requestFull(active.id); }}>Compare side by side</button>
          </nav>

          {viewerError && <p role="alert" className="viewer-error">{viewerError}</p>}
          <div className={`viewer-stage ${mode === "compare" ? "viewer-stage--compare" : "viewer-stage--single"}`}>
            {(mode === "quick" || mode === "compare") && (
              <figure className="viewer-panel">
                <figcaption>Quick preview · 15% scale</figcaption>
                <img src={active.data} alt={`${active.label}, quick 15% preview`} />
              </figure>
            )}
            {(mode === "full" || mode === "compare") && (
              <figure className="viewer-panel">
                <figcaption>Full resolution · {activePreset.width} × {activePreset.height} px</figcaption>
                {fullImages[active.id]
                  ? <img src={fullImages[active.id]} alt={`${active.label}, full-resolution rendered PNG`} />
                  : <div className="viewer-loading" aria-live="polite">
                      {loadingFullId === active.id
                        ? "Rendering full-resolution wallpaper…"
                        : <button onClick={() => void requestFull(active.id)}>Render full-resolution preview</button>}
                    </div>}
              </figure>
            )}
          </div>

          <div aria-label="Choose preset" className="viewer-strip">
            {previews.map((preview) => (
              <button
                key={preview.id}
                onClick={() => selectPreset(preview.id)}
                aria-current={preview.id === active.id ? "true" : undefined}
                aria-label={`View ${preview.label}`}
              >
                <img src={preview.data} alt="" />
              </button>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .viewer-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .viewer-controls { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }
        .viewer-error { color: #ff8585; margin: 0 0 8px; }
        .viewer-stage { flex: 1; min-height: 0; }
        .viewer-stage--single { display: flex; justify-content: center; align-items: center; overflow: auto; }
        .viewer-stage--compare { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; gap: 12px; overflow: auto; }
        .viewer-panel { margin: 0; min-width: 0; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
        .viewer-panel img { max-width: 100%; max-height: calc(100% - 24px); object-fit: contain; }
        .viewer-loading { padding: 24px; }
        .viewer-strip { display: flex; gap: 8px; overflow-x: auto; padding-top: 12px; }
        .viewer-strip button { flex: 0 0 76px; padding: 3px; border: 1px solid #888; background: #222; }
        .viewer-strip button[aria-current="true"] { border: 2px solid white; }
        .viewer-strip img { display: block; width: 100%; }
        @media (max-width: 680px) {
          .viewer-header { gap: 6px; }
          .viewer-stage--compare { grid-template-columns: minmax(0, 1fr); align-content: start; }
          .viewer-stage--compare .viewer-panel img { max-height: 34vh; }
        }
      `}</style>
    </main>
  );
}
