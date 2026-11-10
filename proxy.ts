import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "./src/web/rate-limit";

export async function proxy(request: NextRequest) {
  const result = await checkRateLimit(request);
  if (result.status !== 200) return result;
  return NextResponse.next({
    headers: Object.fromEntries(result.headers.entries()),
  });
}

export const config = {
  matcher: ["/api/preview", "/api/zip"],
};
