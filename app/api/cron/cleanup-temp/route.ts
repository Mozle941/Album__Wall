import { handleTempCleanup } from "../../../../src/web/handlers";
export const runtime = "nodejs";
export const GET = (req: Request) => handleTempCleanup(req);
