import postgres from "postgres";

import { optionalNumberEnv, requireEnv } from "@/lib/env";

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as typeof globalThis & { __sql?: Sql };

/**
 * `max` is the most queries one request can have in flight: postgres.js queues
 * the rest, so a page's `Promise.all` only runs in parallel up to this many.
 * The home page loads 5 at once, hence the default; with 1 they'd run back to
 * back, one round trip each. Lower it with DATABASE_POOL_MAX if the database's
 * connection limit is tight. `prepare: false` because transaction-mode
 * poolers (Supabase, PgBouncer) reject server-side prepared statements; it is
 * a no-op on a direct connection. `idle_timeout` is deliberately left at the
 * default of none, so a warm instance reuses its connections across invocations.
 *
 * The cache lives on `globalThis` so it survives both Next's dev-mode hot
 * reload and repeated invocations of a warm function.
 */
export function getSql(): Sql {
  if (!globalForDb.__sql) {
    globalForDb.__sql = postgres(requireEnv("DATABASE_URL"), {
      max: optionalNumberEnv("DATABASE_POOL_MAX", 5),
      prepare: false,
    });
  }
  return globalForDb.__sql;
}
