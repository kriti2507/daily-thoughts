import { NextResponse } from "next/server";

import { ADMIN_COOKIE, isAdminSecret } from "@/lib/admin";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Visiting /admin?key=<ADMIN_SECRET> once marks this browser as the owner. The
 * redirect strips the key from the address bar so it doesn't linger in the
 * page's URL. Rotating ADMIN_SECRET invalidates every existing cookie.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? undefined;
  if (!isAdminSecret(key)) {
    return new Response("unauthorized", { status: 401 });
  }

  const response = NextResponse.redirect(new URL("/", url), 303);
  response.cookies.set(ADMIN_COOKIE, key!, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "strict",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return response;
}
