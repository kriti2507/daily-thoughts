import postgres from "postgres";

import { requireEnv } from "@/lib/env";

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as typeof globalThis & { __sql?: Sql };

export function getSql(): Sql {
  if (!globalForDb.__sql) {
    globalForDb.__sql = postgres(requireEnv("DATABASE_URL"), {
      max: 1,
      prepare: false,
    });
  }
  return globalForDb.__sql;
}
