# Albumwall
Create device wallpapers for Android, iOS, macOS, Windows and Linux from an image you own or are licensed to use.

Albumwall does not connect to Spotify or fetch artwork from an external catalog.

## Use
    npm install
    npm run dev          # website on http://localhost:3000
    npm run cli -- --image ./cover.jpg --platform ios,android

Accepted input is a single-frame PNG, JPEG, or WebP image, up to 10 MiB and 40 million decoded pixels. The website sends it to the Node.js server only for transient generation; it is not saved to disk or an account. The CLI requires a local image file. Users are responsible for having the rights needed to use their image and for providing any required attribution. Optional website attribution text is included in the downloaded ZIP as `CREDITS.txt`.

## API rate limits and production deployment
The Node.js app protects `POST /api/preview` (10 requests/minute) and `POST /api/zip` (3 requests/minute) with shared Upstash Redis sliding-window limits. Set these environment variables on every production instance:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `ALBUMWALL_RATE_LIMIT_HASH_SECRET` — a strong, randomly generated secret of at least 32 characters used to HMAC client IPs before they become Redis keys. Generate one with `openssl rand -hex 32` and store it in your deployment's secret manager; do not commit it.

Production must run on a Node.js host with the root Next.js `proxy.ts` enabled. Configure the reverse proxy/load balancer to enforce a request-body limit of at least 11 MiB (to allow multipart overhead) and close to the application's 10 MiB file limit, and to overwrite/sanitize `x-real-ip` and/or `x-forwarded-for`. If required configuration, trusted client IP, or Redis is unavailable, requests fail closed with HTTP 503. Do not expose the app directly behind a proxy that passes through arbitrary client-supplied forwarding headers. Verify live proxy/body-size/Redis behavior on the chosen host before claiming production readiness. For local API development, configure the same environment variables in `.env.local`.

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
