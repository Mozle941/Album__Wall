import { handleUploadUrl } from "../../../src/web/handlers";
export const runtime = "nodejs";
export const POST = (req: Request) => handleUploadUrl(req);
