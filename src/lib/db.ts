import postgres from "postgres";

import { requireEnv } from "@/lib/env";

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as typeof globalThis & { __sql?: Sql };

/**
 * These options are tuned for serverless, not for throughput — don't raise
 * them without rechecking that assumption. `max: 1` because a Vercel instance
 * serves one request at a time, so a larger pool just holds idle connections
 * open against the database's limit. `prepare: false` because transaction-mode
 * poolers (Supabase, PgBouncer) reject server-side prepared statements; it is
 * a no-op on a direct connection. `idle_timeout` is deliberately left at the
 * default of none, so a warm instance reuses its connection across invocations.
 *
 * The cache lives on `globalThis` so it survives both Next's dev-mode hot
 * reload and repeated invocations of a warm function.
 */
export function getSql(): Sql {
  if (!globalForDb.__sql) {
    globalForDb.__sql = postgres(requireEnv("DATABASE_URL"), {
      max: 1,
      prepare: false,
    });
  }
  return globalForDb.__sql;
}
