# Albumwall

Turn Spotify album art into wallpapers for Android, iOS, macOS, Windows and Linux.

## Use

    npm install
    npm run dev          # website on http://localhost:3000
    npm run cli -- "https://open.spotify.com/album/<id>" --platform ios,android

No Spotify account or API key needed. Album art comes from Spotify's public oEmbed endpoint.

## API rate limits and production deployment

The Node.js app protects `/api/info` (20 requests/minute), `/api/wallpaper` (30/minute), and `/api/zip` (3/minute) with shared Upstash Redis sliding-window limits. Set these environment variables on every production instance:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `ALBUMWALL_RATE_LIMIT_HASH_SECRET` — a strong, randomly generated secret of at least 32 characters used to HMAC client IPs before they become Redis keys. Generate one with `openssl rand -hex 32` and store it in your deployment's secret manager; do not commit it.

Production must run on a Node.js host with the root Next.js `proxy.ts` enabled. The deployment's trusted reverse proxy/load balancer must **overwrite or sanitize** `x-real-ip` and/or `x-forwarded-for` before forwarding requests. The app uses these platform-provided headers to identify clients; if neither is present, or required configuration or Redis is unavailable, requests fail closed with HTTP 503. Do not expose the app directly behind a proxy that passes through arbitrary client-supplied forwarding headers. These controls are implemented in code; configure the secrets and trusted proxy, and verify the live Redis connection and behavior on the chosen host before claiming production readiness.

For local API development, set the same variables in `.env.local`; without them, API requests also fail closed with HTTP 503.

## Known limits

- Art is 640px at best (300px if Spotify's unofficial size URL stops working), so large wallpapers show it centered over a blurred background, not stretched.
- Relies on undocumented/unguaranteed behaviour of Spotify's oEmbed and image CDN. It may break.

## Disclaimer

Not affiliated with or endorsed by Spotify. Album art belongs to its rights holders. For personal use.

## Development

    npm test
    npm run typecheck
    npm run build

## License

MIT
