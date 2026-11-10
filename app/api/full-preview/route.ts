import { handleFullPreview } from "../../../src/web/handlers";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = (req: Request) => handleFullPreview(req);
