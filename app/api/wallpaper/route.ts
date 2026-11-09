import { handleWallpaper } from "../../../src/web/handlers";

export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = (req: Request) => handleWallpaper(req);
