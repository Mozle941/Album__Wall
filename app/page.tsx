"use client";

import { useEffect, useRef, useState } from "react";
import { ASPECT_RATIOS, PLATFORMS, PRESETS, type AspectRatio, type Platform } from "../src/presets";
import { OUTPUT_FORMATS, type OutputFormat } from "../src/output-format";

type Artwork = { id: string; file: File; url: string };
type Preview = { id: string; presetId: string; imageId: string; imageName: string; originalUrl: string; platform: Platform; label: string; width: number; height: number; data: string };
type PreparedDownload = { id: string; imageName: string; url: string; filename: string };
type BatchProgress = { kind: "Preview" | "ZIP"; completed: number; total: number; imageName: string; phase: string; fraction: number; startedAt: number };
type ViewMode = "quick" | "full" | "compare";
type Theme = "light" | "dark";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_BATCH_IMAGES = 3;
const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const THEME_STORAGE_KEY = "albumwall-theme";

const WALL_TILES = Array.from({ length: 96 }, (_, index) => {
  const hue = (index * 137.5) % 360;
  const secondHue = (hue + 50) % 360;
  const deepHue = (hue + 120) % 360;
  const background = index % 3 === 0
    ? `radial-gradient(circle at 30% 28%, hsl(${hue} 90% 64%), hsl(${secondHue} 80% 36%) 58%, hsl(${deepHue} 70% 14%))`
    : index % 3 === 1
      ? `linear-gradient(${(index * 29) % 180}deg, hsl(${hue} 85% 55%) 50%, hsl(${(hue + 160) % 360} 80% 30%) 50%)`
      : `conic-gradient(from ${(index * 40) % 360}deg at 50% 60%, hsl(${hue} 90% 55%), hsl(${(hue + 90) % 360} 85% 45%), hsl(${(hue + 200) % 360} 80% 25%), hsl(${hue} 90% 55%))`;
  return { index, background };
});

function PlatformGlyph({ platform }: { platform: Platform }) {
  if (platform === "android") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 10a6 6 0 0 1 12 0v5H6z" />
        <path d="m8 4-1.5-2M16 4l1.5-2M4 10v5M20 10v5M8 17v3M16 17v3" />
        <circle cx="9.5" cy="8" r=".6" fill="currentColor" stroke="none" />
        <circle cx="14.5" cy="8" r=".6" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (platform === "ios") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
        <path d="M11 18.5h2" />
      </svg>
    );
  }

  if (platform === "mac") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="4" width="16" height="12" rx="1.5" />
        <path d="M2.5 19h19M9 16l-1 3m7-3 1 3" />
      </svg>
    );
  }

  if (platform === "windows") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 5.5 10.5 4v7H3zM12.5 3.6 21 2v9h-8.5zM3 13h7.5v7L3 18.5zM12.5 13H21v9l-8.5-1.6z" />
      </svg>
    );
  }

  if (platform === "linux") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="13" rx="1.5" />
        <path d="m7 8 3 2.5L7 13m5 0h4M9 21h6m-3-4v4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M9 20h6M12 16v4" />
    </svg>
  );
}

function ThemeToggle({ theme, onToggle, hero = false }: { theme: Theme | null; onToggle: () => void; hero?: boolean }) {
  const label = theme === null
    ? "Toggle light and dark mode"
    : `Switch to ${theme === "dark" ? "light" : "dark"} mode`;

  return (
    <button
      className={`button theme-toggle${hero ? " theme-toggle--hero" : ""}`}
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={theme === "dark"}
      title={label}
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7Z" />
        </svg>
      )}
      <span className="theme-toggle-label">{theme ?? "Theme"}</span>
    </button>
  );
}

function platformName(platform: Platform) {
  if (platform === "mac") return "Mac";
  if (platform === "ios") return "iOS";
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `about ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `about ${minutes}m ${remainder}s` : `about ${minutes}m`;
}

export default function Home() {
  const [theme, setTheme] = useState<Theme | null>(null);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("device");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("png");
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
  const [dragging, setDragging] = useState(false);
  const [showActionBar, setShowActionBar] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [progressClock, setProgressClock] = useState(Date.now());
  const [preparedDownloads, setPreparedDownloads] = useState<PreparedDownload[]>([]);

  const heroRef = useRef<HTMLElement>(null);
  const heroContentRef = useRef<HTMLDivElement>(null);
  const heroHintRef = useRef<HTMLParagraphElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const appRef = useRef<HTMLElement>(null);
  const appTitleRef = useRef<HTMLHeadingElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const viewerWasOpen = useRef(false);
  const previousOverflow = useRef("");
  const manualThemeChoiceRef = useRef(false);
  const previewGeneration = useRef(0);
  const previewRequestId = useRef(0);
  const fullRequestId = useRef(0);
  const previewController = useRef<AbortController | null>(null);
  const fullController = useRef<AbortController | null>(null);
  const objectUrls = useRef(new Set<string>());
  const artworkUrls = useRef(new Set<string>());
  const downloadUrls = useRef(new Set<string>());

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    let storedTheme: string | null = null;
    try {
      storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      storedTheme = null;
    }
    manualThemeChoiceRef.current = storedTheme === "light" || storedTheme === "dark";

    const applyTheme = (next: Theme) => {
      document.documentElement.dataset.theme = next;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#121212" : "#f5f5f7");
      setTheme(next);
    };

    applyTheme(manualThemeChoiceRef.current ? storedTheme as Theme : media.matches ? "dark" : "light");
    const followSystemTheme = (event: MediaQueryListEvent) => {
      if (!manualThemeChoiceRef.current) applyTheme(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", followSystemTheme);
    return () => media.removeEventListener("change", followSystemTheme);
  }, []);

  function toggleTheme() {
    const current = theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next: Theme = current === "dark" ? "light" : "dark";
    manualThemeChoiceRef.current = true;
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#121212" : "#f5f5f7");
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The active theme still applies when storage is unavailable.
    }
  }

  const activeIndex = previews.findIndex((preview) => preview.id === activeId);
  const active = activeIndex >= 0 ? previews[activeIndex] : undefined;
  const activePreset = active ? PRESETS.find((preset) => preset.id === active.presetId) : undefined;
  const selected = PRESETS.filter((preset) => platforms.includes(preset.platform));
  const canGenerate = artworks.length > 0 && platforms.length > 0 && rights && !busy;
  const progressRatio = batchProgress
    ? Math.min(1, (batchProgress.completed + batchProgress.fraction) / batchProgress.total)
    : 0;
  const remainingSeconds = batchProgress && progressRatio > 0.02
    ? Math.max(0, Math.ceil(((progressClock - batchProgress.startedAt) / 1000 / progressRatio) * (1 - progressRatio)))
    : null;
  const actionReason = busy
    ? "Preparing your wallpapers…"
    : artworks.length === 0
      ? "Add an image to continue"
      : platforms.length === 0
        ? "Choose at least one platform"
        : !rights
          ? "Confirm you have permission to use this image"
          : previews.length > 0
            ? `${previews.length} previews ready to inspect · ${artworks.length} images`
            : `${selected.length} wallpaper sizes × ${artworks.length} images`;

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
    downloadUrls.current.forEach((url) => URL.revokeObjectURL(url));
    downloadUrls.current.clear();
    setPreparedDownloads([]);
  }

  function metadata(pathname: string) {
    return { pathname, platforms: platforms.join(","), aspectRatio, outputFormat, rights, credits };
  }

  function chooseArtwork(fileList: FileList | File[] | null) {
    const files = fileList ? Array.from(fileList) : [];
    if (!files.length || busy) return;
    setError("");
    if (artworks.length + files.length > MAX_BATCH_IMAGES) {
      setError(`Choose up to ${MAX_BATCH_IMAGES} images per batch.`);
      return;
    }
    const invalidType = files.find((file) => !ACCEPTED_IMAGE_TYPES.has(file.type));
    if (invalidType) {
      setError(`${invalidType.name}: choose a PNG, JPEG, or WebP image.`);
      return;
    }
    const tooLarge = files.find((file) => file.size > MAX_IMAGE_SIZE);
    if (tooLarge) {
      setError(`${tooLarge.name}: image exceeds the 10 MiB per-image limit.`);
      return;
    }
    invalidate();
    const additions = files.map((file) => {
      const url = URL.createObjectURL(file);
      artworkUrls.current.add(url);
      return { id: crypto.randomUUID(), file, url };
    });
    setArtworks((current) => [...current, ...additions]);
  }

  function removeArtwork(id: string) {
    const artwork = artworks.find((item) => item.id === id);
    if (artwork) {
      URL.revokeObjectURL(artwork.url);
      artworkUrls.current.delete(artwork.url);
    }
    setArtworks((current) => current.filter((item) => item.id !== id));
    invalidate();
    setError("");
  }

  async function upload(image: File, signal?: AbortSignal): Promise<string> {
    if (image.size > MAX_IMAGE_SIZE) throw new Error(`${image.name}: image exceeds the 10 MiB upload limit`);
    setBatchProgress((current) => current ? { ...current, phase: "Preparing upload", fraction: current.completed / current.total } : current);
    const signed = await fetch("/api/upload-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentType: image.type, ...metadata("pending") }),
      signal,
    });
    const signedBody = await signed.json();
    if (!signed.ok) throw new Error(signedBody.error ?? "Could not prepare private upload");
    setBatchProgress((current) => current ? { ...current, phase: "Uploading image", fraction: (current.completed + 0.12) / current.total } : current);
    const put = await fetch(signedBody.url, {
      method: "PUT",
      headers: { "content-type": image.type },
      body: image,
      signal,
    });
    if (!put.ok) throw new Error("Private image upload failed");
    setBatchProgress((current) => current ? { ...current, phase: "Image uploaded", fraction: (current.completed + 0.52) / current.total } : current);
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
      const batchPreviews: Preview[] = [];
      const startedAt = Date.now();
      for (const [index, artwork] of artworks.entries()) {
        if (controller.signal.aborted) return;
        setBatchProgress({ kind: "Preview", completed: index, total: artworks.length, imageName: artwork.file.name, phase: "Starting", fraction: index / artworks.length, startedAt });
        const pathname = await upload(artwork.file, controller.signal);
        setBatchProgress((current) => current ? { ...current, phase: "Upscaling and creating previews", fraction: (index + 0.68) / artworks.length } : current);
        const response = await fetch("/api/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(metadata(pathname)),
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(`${artwork.file.name}: ${result.error ?? "Preview failed"}`);
        setBatchProgress((current) => current ? { ...current, completed: index + 1, fraction: 0, phase: "Image complete" } : current);
        batchPreviews.push(...result.previews.map((item: Omit<Preview, "id" | "imageId" | "imageName" | "originalUrl" | "presetId"> & { id: string }) => ({
          ...item,
          id: `${artwork.id}:${item.id}`,
          presetId: item.id,
          imageId: artwork.id,
          imageName: artwork.file.name,
          originalUrl: artwork.url,
        })));
      }
      if (generation === previewGeneration.current && !controller.signal.aborted) setPreviews(batchPreviews);
    } catch (cause) {
      if (!controller.signal.aborted && generation === previewGeneration.current) {
        setError(cause instanceof Error ? cause.message : "Preview failed");
      }
    } finally {
      if (requestId === previewRequestId.current) {
        previewController.current = null;
        setBatchProgress(null);
        setBusy(false);
      }
    }
  }

  async function download() {
    setError("");
    setBusy(true);
    downloadUrls.current.forEach((url) => URL.revokeObjectURL(url));
    downloadUrls.current.clear();
    setPreparedDownloads([]);
    try {
      const ready: PreparedDownload[] = [];
      const startedAt = Date.now();
      for (const [index, artwork] of artworks.entries()) {
        setBatchProgress({ kind: "ZIP", completed: index, total: artworks.length, imageName: artwork.file.name, phase: "Starting", fraction: index / artworks.length, startedAt });
        const pathname = await upload(artwork.file);
        setBatchProgress((current) => current ? { ...current, phase: "Upscaling and building ZIP", fraction: (index + 0.68) / artworks.length } : current);
        const response = await fetch("/api/zip", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(metadata(pathname)),
        });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(`${artwork.file.name}: ${result.error ?? "Download failed"}`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        downloadUrls.current.add(url);
        const baseName = artwork.file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-") || "albumwall";
        ready.push({ id: artwork.id, imageName: artwork.file.name, url, filename: `${index + 1}-${baseName}.zip` });
        setBatchProgress((current) => current ? { ...current, completed: index + 1, fraction: 0, phase: "Image complete" } : current);
      }
      setPreparedDownloads(ready);
    } catch (cause) {
      downloadUrls.current.forEach((url) => URL.revokeObjectURL(url));
      downloadUrls.current.clear();
      setError(cause instanceof Error ? cause.message : "Download failed");
    } finally {
      setBatchProgress(null);
      setBusy(false);
    }
  }

  async function requestFull(preview: Preview) {
    const { id, presetId, imageId } = preview;
    if (fullImages[id] || loadingFullId === id) return;
    if (fullController.current) cancelFullRequest();
    const generation = previewGeneration.current;
    const requestId = ++fullRequestId.current;
    const controller = new AbortController();
    fullController.current = controller;
    setViewerError("");
    setLoadingFullId(id);
    try {
      const artwork = artworks.find((item) => item.id === imageId);
      if (!artwork) throw new Error("The original image is no longer available");
      const pathname = await upload(artwork.file, controller.signal);
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
        !previews.some((item) => item.id === id)
      ) {
        URL.revokeObjectURL(url);
        return;
      }
      objectUrls.current.add(url);
      setFullImages((current) => ({ ...current, [id]: url }));
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

  function scrollToTool() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    appRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    window.setTimeout(() => appTitleRef.current?.focus({ preventScroll: true }), reducedMotion ? 0 : 600);
  }

  function scrollToIntro() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    heroRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    window.setTimeout(() => startRef.current?.focus({ preventScroll: true }), reducedMotion ? 0 : 600);
  }

  useEffect(() => {
    const hero = heroRef.current;
    const app = appRef.current;
    if (!hero || !app) return;

    let frame = 0;
    let pointerX = window.innerWidth / 2;
    let pointerY = window.innerHeight / 2;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const update = () => {
      frame = 0;
      for (const section of [hero, app]) {
        const bounds = section.getBoundingClientRect();
        section.style.setProperty("--spot-x", `${pointerX - bounds.left}px`);
        section.style.setProperty("--spot-y", `${pointerY - bounds.top}px`);
      }

      const parallaxX = reducedMotion.matches ? 0 : ((window.innerWidth / 2 - pointerX) / window.innerWidth) * 14;
      const parallaxY = reducedMotion.matches ? 0 : ((window.innerHeight / 2 - pointerY) / window.innerHeight) * 10;
      hero.style.setProperty("--wall-shift-x", `${parallaxX}px`);
      hero.style.setProperty("--wall-shift-y", `${parallaxY}px`);

      const progress = Math.min(1, window.scrollY / (window.innerHeight * 0.7));
      if (heroContentRef.current) {
        heroContentRef.current.style.opacity = String(1 - progress);
        heroContentRef.current.style.transform = reducedMotion.matches
          ? ""
          : `translateY(${-progress * 40}px) scale(${1 - progress * 0.04})`;
      }
      if (heroHintRef.current) heroHintRef.current.style.opacity = String(1 - progress);
      const shouldShow = app.getBoundingClientRect().top < window.innerHeight * 0.55;
      setShowActionBar((current) => current === shouldShow ? current : shouldShow);
    };

    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const onPointerMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      scheduleUpdate();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    reducedMotion.addEventListener("change", scheduleUpdate);
    update();

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      reducedMotion.removeEventListener("change", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!busy || !batchProgress) return;
    const timer = window.setInterval(() => setProgressClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [busy, batchProgress !== null]);

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
        if (event.shiftKey && (document.activeElement === first || focusOutside)) {
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
    artworkUrls.current.forEach((url) => URL.revokeObjectURL(url));
    artworkUrls.current.clear();
    downloadUrls.current.forEach((url) => URL.revokeObjectURL(url));
    downloadUrls.current.clear();
  }, []);

  return (
    <>
      <div className="site-shell" inert={active ? true : undefined} aria-hidden={active ? "true" : undefined}>
        <section className="hero" id="hero" ref={heroRef} aria-label="Albumwall introduction">
          <div className="hero-wall" aria-hidden="true">
            {WALL_TILES.map((tile) => (
              <div className="hero-tile" key={tile.index} style={{ background: tile.background, animationDelay: `${(tile.index % 12) * -0.55}s` }} />
            ))}
          </div>
          <div className="hero-scrim" aria-hidden="true" />
          <span className="brand brand-logo">
            <img src="/albumwall-logo.png" alt="Albumwall — Since 2026" width="302" height="251" />
          </span>
          <ThemeToggle theme={theme} onToggle={toggleTheme} hero />
          <div className="hero-content" ref={heroContentRef}>
            <h1>Your album art,<br />on every screen.</h1>
            <p>Make device wallpapers from an image you own or are licensed to use.</p>
            <button className="button hero-button" onClick={scrollToTool} ref={startRef}>
              Make wallpapers <span className="cue" aria-hidden="true">↓</span>
            </button>
          </div>
          <p className="hero-hint" ref={heroHintRef}>Move your cursor or drag to light up the wall</p>
        </section>

        <main className="app-section" id="tool" ref={appRef}>
          <div
            className={`app-art${artworks[0] ? " on" : ""}`}
            aria-hidden="true"
            style={artworks[0] ? { backgroundImage: `url("${artworks[0].url}")` } : undefined}
          />
          <div className="app-veil" aria-hidden="true" />
          <div className="tool-shell">
            <header className="tool-top">
              <div>
                <h2 className="tool-title" id="appTitle" ref={appTitleRef} tabIndex={-1}>Albumwall</h2>
                <p className="tagline">Make device wallpapers from an image you own or are licensed to use.</p>
              </div>
              <div className="tool-top-actions">
                <ThemeToggle theme={theme} onToggle={toggleTheme} />
                <button className="button intro-button" onClick={scrollToIntro} aria-label="Back to introduction">↑ Intro</button>
              </div>
            </header>

            <section className="step" aria-labelledby="step-artwork">
              <h2 className="step-title" id="step-artwork"><span className="step-number">1</span>Artwork</h2>
              <label
                className={`drop-zone${dragging ? " is-dragging" : ""}`}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event) => { event.preventDefault(); if (!dragging) setDragging(true); }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  chooseArtwork(event.dataTransfer.files);
                }}
              >
                  <span className="upload-symbol" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
                      <path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
                    </svg>
                  </span>
                  <strong>{artworks.length ? "Drop more images or click to add" : "Drop images here or click to choose"}</strong>
                  <small>PNG, JPEG, or WebP · up to {MAX_BATCH_IMAGES} images · max 10 MiB each</small>
                  <input
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    aria-label={`Artwork images (PNG, JPEG, or WebP; up to ${MAX_BATCH_IMAGES}, max 10 MiB each)`}
                    onChange={(event) => {
                      const files = Array.from(event.currentTarget.files ?? []);
                      event.currentTarget.value = "";
                      chooseArtwork(files);
                    }}
                  />
              </label>
              {artworks.length > 0 && (
                <div className="batch-file-list" aria-label="Selected images">
                  {artworks.map((artwork) => (
                    <div className="file-chip" key={artwork.id}>
                      <span className="file-mark" aria-hidden="true">▧</span>
                      <strong title={artwork.file.name}>{artwork.file.name}</strong>
                      <span className="file-size">{artwork.file.size < 1024 * 1024 ? `${Math.max(1, Math.round(artwork.file.size / 1024))} KiB` : `${(artwork.file.size / (1024 * 1024)).toFixed(1)} MiB`}</span>
                      <button className="button quiet-button" type="button" onClick={() => removeArtwork(artwork.id)} disabled={busy} aria-label={`Remove ${artwork.file.name}`}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
              <p className="privacy-copy">
                Privacy: images upload one at a time to a private Vercel Blob store. Each temporary copy is deleted after processing; abandoned uploads are swept daily. Images are not publicly accessible or attached to end-user accounts.
              </p>
              <div className="live-message" aria-live="polite">
                {error && <p className="message-error" role="alert">{error}</p>}
              </div>
            </section>

            <section className="step" aria-labelledby="step-platforms">
              <h2 className="step-title" id="step-platforms"><span className="step-number">2</span>Platforms</h2>
              <div className="platform-grid">
                {PLATFORMS.map((platform) => {
                  const count = PRESETS.filter((preset) => preset.platform === platform).length;
                  const checked = platforms.includes(platform);
                  const name = platformName(platform);
                  return (
                    <label className={`platform-card platform-card--${platform}${checked ? " is-selected" : ""}`} key={platform}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        aria-label={`Include ${name} wallpapers`}
                        onChange={() => {
                          setPlatforms((current) => current.includes(platform)
                            ? current.filter((item) => item !== platform)
                            : [...current, platform]);
                          invalidate();
                        }}
                      />
                      <span className="platform-glyph"><PlatformGlyph platform={platform} /></span>
                      <span className="platform-name">{name}</span>
                      <small>{count} sizes</small>
                      <span className="platform-check" aria-hidden="true">✓</span>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="step" aria-labelledby="step-rights">
              <h2 className="step-title" id="step-rights"><span className="step-number">3</span>Rights</h2>
              <label className="rights-card">
                <input
                  type="checkbox"
                  checked={rights}
                  disabled={busy}
                  onChange={(event) => setRights(event.target.checked)}
                />
                <span>I own this image or have permission/a license that permits its use, and I will provide attribution when required.</span>
              </label>
              <details className="options-panel">
                <summary>Options: aspect ratio, output format, and attribution</summary>
                <div className="options-content">
                  <label className="field">
                    <span>Wallpaper aspect ratio</span>
                    <select
                      value={aspectRatio}
                      disabled={busy}
                      onChange={(event) => {
                        setAspectRatio(event.target.value as AspectRatio);
                        invalidate();
                      }}
                    >
                      {ASPECT_RATIOS.map((ratio) => (
                        <option value={ratio} key={ratio}>{ratio === "device" ? "Device default" : ratio}</option>
                      ))}
                    </select>
                  </label>
                  <p className="ratio-note">The whole image is proportionally resized with no crop or added background. If its shape differs from the selected ratio, the exported dimensions stay within the selected size and retain the artwork’s original shape.</p>
                  <label className="field">
                    <span>Batch download image format</span>
                    <select
                      value={outputFormat}
                      disabled={busy}
                      onChange={(event) => {
                        setOutputFormat(event.target.value as OutputFormat);
                        invalidate();
                      }}
                    >
                      {OUTPUT_FORMATS.map((format) => (
                        <option value={format} key={format}>{format === "jpeg" ? "JPEG" : format.toUpperCase()}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Optional attribution / credit</span>
                    <input
                      type="text"
                      maxLength={2000}
                      value={credits}
                      disabled={busy}
                      onChange={(event) => setCredits(event.target.value)}
                      placeholder="Credit text (included as CREDITS.txt)"
                    />
                  </label>
                </div>
              </details>
            </section>

            {previews.length > 0 && (
              <section className="step preview-step" aria-labelledby="step-preview">
                <div className="preview-heading">
                  <div>
                    <h2 className="step-title" id="step-preview"><span className="step-number">4</span>Preview</h2>
                    <p className="privacy-copy" role="status">
                      Preview ready for {previews.length} wallpapers from {artworks.length} images. Open any image for a full-resolution view, or compare its uploaded original with the resized wallpaper.
                    </p>
                  </div>
                </div>
                <div className="preview-grid">
                  {previews.map((preview) => (
                      <figure className={`preview-card${preview.width > preview.height ? " is-wide" : ""}`} key={preview.id}>
                        <button
                          className="preview-open"
                          onClick={(event) => {
                            openerRef.current = event.currentTarget;
                            setActiveId(preview.id);
                            setMode("full");
                            setViewerError("");
                            void requestFull(preview);
                          }}
                          aria-haspopup="dialog"
                          aria-label={`Open ${preview.imageName}, ${preview.label} full-screen comparison preview`}
                        >
                          <img src={preview.data} alt={preview.label} />
                          <span className="inspect-badge">Inspect ↗</span>
                        </button>
                        <figcaption>{preview.imageName} · {preview.label} · up to {preview.width} × {preview.height} px</figcaption>
                      </figure>
                  ))}
                </div>
              </section>
            )}

            {preparedDownloads.length > 0 && (
              <section className="step batch-downloads" aria-labelledby="batch-download-title">
                <h2 className="step-title" id="batch-download-title">Your ZIP files are ready</h2>
                <p className="privacy-copy">Each ZIP contains the selected platform sizes for one image. Choose a file to download it.</p>
                <ul className="batch-download-list">
                  {preparedDownloads.map((item) => (
                    <li key={item.id}>
                      <span title={item.imageName}>{item.imageName}</span>
                      <a className="button quiet-button" href={item.url} download={item.filename}>Download ZIP</a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="tool-note">Choose images you own or are licensed to use. They are processed temporarily and are not made public.</p>
          </div>
        </main>

        <div className={`action-bar${showActionBar ? " is-visible" : ""}`}>
          <div className="action-bar-inner">
            <div className="action-status-block">
              <span className="action-reason" id="action-status" aria-live="polite">
                {batchProgress
                  ? `${batchProgress.kind}: image ${Math.min(batchProgress.completed + 1, batchProgress.total)} of ${batchProgress.total} · ${batchProgress.imageName} · ${batchProgress.phase}`
                  : actionReason}
              </span>
              {batchProgress && (
                <div className="batch-progress-row">
                  <div
                    className="batch-progress-track"
                    role="progressbar"
                    aria-label={`${batchProgress.kind} batch progress`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progressRatio * 100)}
                  >
                    <span className="batch-progress-fill" style={{ width: `${Math.round(progressRatio * 100)}%` }} />
                  </div>
                  <span className="batch-progress-percent">{Math.round(progressRatio * 100)}%</span>
                  <span className="batch-progress-eta">{remainingSeconds === null ? "Estimating time…" : `${formatDuration(remainingSeconds)} remaining`}</span>
                </div>
              )}
            </div>
            <button className="button preview-action" type="button" onClick={() => void preview()} disabled={!canGenerate} aria-describedby="action-status">
              {busy ? <><span className="spinner" aria-hidden="true" />Preparing…</> : `Preview ${artworks.length} image${artworks.length === 1 ? "" : "s"}`}
            </button>
            <button className="button primary-action" type="button" onClick={() => void download()} disabled={!canGenerate} aria-describedby="action-status">
              {artworks.length > 1 ? `Prepare ${artworks.length} ZIPs` : "Prepare ZIP"}
            </button>
          </div>
        </div>
      </div>

      {active && activePreset && (
        <div
          className="viewer"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${active.label} wallpaper preview`}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeViewer();
          }}
        >
          <header className="viewer-header">
            <div className="viewer-nav">
              <button className="button viewer-button" ref={closeRef} onClick={closeViewer} aria-label="Close preview">Close</button>
              <button className="button viewer-button" onClick={() => navigate(-1)} aria-label="Previous preset">← Previous</button>
              <button className="button viewer-button" onClick={() => navigate(1)} aria-label="Next preset">Next →</button>
            </div>
            <div className="viewer-title">
              <strong>{active.label}</strong>
                      <span>{active.width} × {active.height} px</span>
            </div>
          </header>

          <nav aria-label="Preview quality" className="viewer-controls">
            <button className="button viewer-button" aria-pressed={mode === "quick"} onClick={() => setMode("quick")}>Quick preview</button>
            <button className="button viewer-button" aria-pressed={mode === "full"} onClick={() => { setMode("full"); void requestFull(active); }}>Full resolution</button>
            <button className="button viewer-button" aria-pressed={mode === "compare"} onClick={() => { setMode("compare"); void requestFull(active); }}>Compare original with wallpaper</button>
          </nav>

          {viewerError && <p role="alert" className="viewer-error">{viewerError}</p>}
          <div className={`viewer-stage${mode === "compare" ? " is-compare" : " is-single"}`}>
            {mode === "quick" && (
              <figure className="viewer-panel">
                <figcaption>Quick preview · 15% scale</figcaption>
                <img src={active.data} alt={`${active.label}, quick 15% preview`} />
              </figure>
            )}
            {mode === "compare" && (
              <figure className="viewer-panel">
                <figcaption>Uploaded original · {active.imageName}</figcaption>
                <img src={active.originalUrl} alt={`${active.imageName}, original uploaded image before resizing`} />
              </figure>
            )}
            {(mode === "full" || mode === "compare") && (
              <figure className="viewer-panel">
                <figcaption>Resized wallpaper · {active.width} × {active.height} px</figcaption>
                {fullImages[active.id]
                  ? <img src={fullImages[active.id]} alt={`${active.imageName}, ${active.label}, full-resolution rendered PNG`} />
                  : <div className="viewer-loading" aria-live="polite">
                      {loadingFullId === active.id
                        ? <><span className="spinner" aria-hidden="true" />Rendering full-resolution wallpaper…</>
                        : <button className="button viewer-button" onClick={() => void requestFull(active)}>Render full-resolution preview</button>}
                    </div>}
              </figure>
            )}
          </div>

          <div role="group" aria-label="Choose preset" className="viewer-strip">
            {previews.map((preview) => (
              <button
                className="viewer-thumb"
                key={preview.id}
                onClick={() => selectPreset(preview.id)}
                aria-current={preview.id === active.id ? "true" : undefined}
                aria-label={`View ${preview.imageName}, ${preview.label}`}
              >
                <img src={preview.data} alt="" />
                <span>{preview.imageName} · {preview.platform}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
