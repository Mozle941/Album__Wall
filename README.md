# Albumwall

Turn Spotify album art into wallpapers for Android, iOS, macOS, Windows and Linux.

## Use

    npm install
    npm run dev          # website on http://localhost:3000
    npm run cli -- "https://open.spotify.com/album/<id>" --platform ios,android

No Spotify account or API key needed. Album art comes from Spotify's public oEmbed endpoint.

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
