import sharp from "sharp";

for (const size of [192, 512]) {
  const inner = Math.round(size * 0.5);
  const square = await sharp({
    create: { width: inner, height: inner, channels: 3, background: "#1db954" },
  })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: "#121212" } })
    .composite([{ input: square, gravity: "centre" }])
    .png()
    .toFile(`public/icon-${size}.png`);
}
console.log("icons written");
