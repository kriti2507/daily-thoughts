import { readFile } from "node:fs/promises";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.");
  process.exit(1);
}

const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
const sql = postgres(url, { max: 1, prepare: false });

try {
  await sql.unsafe(schema).simple();
  console.log("schema applied");
} catch (error) {
  console.error("failed to apply schema:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
