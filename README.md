# Albumwall
Create device wallpapers for Android, iOS, macOS, Windows and Linux from an image you own or are licensed to use.

**Live preview:** [albumwall-lemon.vercel.app](https://albumwall-lemon.vercel.app)

Albumwall does not connect to Spotify or fetch artwork from an external catalog.

## Use
    npm install
    npm run dev          # website on http://localhost:3000
    npm run cli -- --image ./cover.jpg --platform ios,android

The website accepts batches of up to 3 single-frame PNG, JPEG, or WebP images, with a 10 MiB upload limit per image and 40 million decoded pixels per image. It previews each image against the selected platform sizes and prepares one ZIP per image; download links let you save each ZIP separately. Batch images are uploaded and processed sequentially, not combined into a single multi-image archive. The CLI accepts one local image file per invocation. Each wallpaper directly resizes its supplied image to fill the requested dimensions, upscaling smaller images as needed; when the selected aspect ratio differs, edges are cropped to fill the frame. No blur or solid-color background is added. Website uploads go directly from the browser to a private Vercel Blob store using short-lived, single-path upload URLs. Preview and ZIP processing is transient in memory; processed temporary blobs are deleted immediately after each operation. If a browser disconnects before processing, a daily cleanup job deletes temporary objects older than one hour (so abandoned uploads can remain for up to roughly a day). Temporary copies reside in the project's private Blob store until deletion; they are not published or attached to end-user accounts. Users are responsible for having the rights needed to use their images and for providing any required attribution. Optional website attribution text is included in each downloaded ZIP as `CREDITS.txt`.

## API rate limits and production deployment
The Node.js app protects `POST /api/upload-url` (10 requests/minute), `POST /api/preview` (10 requests/minute), `POST /api/full-preview` (3 requests/minute), and `POST /api/zip` (3 requests/minute) with shared Upstash Redis sliding-window limits. `POST /api/preview` returns fast 15%-scale thumbnails. The on-demand `POST /api/full-preview` accepts the same rights/platform/aspect-ratio/path metadata plus a `presetId`, renders only that selected preset at its requested dimensions, and streams its PNG response; each processing request deletes its private temporary upload. Provide either the standard Upstash variables or Vercel Marketplace's aliases on every production instance:
- `UPSTASH_REDIS_REST_URL` or `KV_REST_API_URL`
- `UPSTASH_REDIS_REST_TOKEN` or `KV_REST_API_TOKEN`
- `ALBUMWALL_RATE_LIMIT_HASH_SECRET` — a strong, randomly generated secret of at least 32 characters used to HMAC client IPs before they become Redis keys. Generate one with `openssl rand -hex 32` and store it in your deployment's secret manager; do not commit it.

For Vercel, connect a **private** Blob store to the project and enable Vercel OIDC for it. The Blob SDK expects `BLOB_STORE_ID` and `VERCEL_OIDC_TOKEN` to be provided by the Vercel runtime; do not add secret values to the repository. Set `CRON_SECRET` in Vercel so the daily `/api/cron/cleanup-temp` route accepts only authenticated cron calls. The route is scoped strictly to `albumwall-temp/`, paginates results, and conditionally deletes stale items by ETag. A Vercel Hobby cron runs once daily; completed processing uploads are deleted immediately, while abandoned uploads are swept by the daily job.

The rate limiter fails closed with HTTP 503 if required configuration, trusted client IP, or Redis is unavailable. Do not expose the app directly behind a proxy that passes through arbitrary client-supplied forwarding headers. For local API development, configure the rate-limit variables in `.env.local`; private Blob operations additionally require a configured Blob store and SDK credentials.

## Known limits
- Large wallpapers upscale smaller source images; source quality determines output quality.
- Animated and multipage images are not supported.

## Disclaimer
Albumwall does not verify ownership, license scope, or legal permission. Users are responsible for using images they own or are authorized to use, and for including any required attribution.

## Development
    npm test
    npm run typecheck
    npm run build

## License
MIT
