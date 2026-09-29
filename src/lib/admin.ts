import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "admin";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * With ADMIN_SECRET unset, nothing is accepted — writing and deleting are simply off, rather
 * than an empty cookie matching an empty secret. Both sides are hashed first so
 * `timingSafeEqual` always compares equal-length buffers and the comparison
 * leaks neither the secret nor its length.
 */
export function isAdminSecret(candidate: string | undefined): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || candidate === undefined) {
    return false;
  }
  return timingSafeEqual(digest(candidate), digest(secret));
}

export async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return isAdminSecret(cookieStore.get(ADMIN_COOKIE)?.value);
}
