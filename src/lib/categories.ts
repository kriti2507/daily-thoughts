import { getSql } from "@/lib/db";

// What every entry is classified into. Managed like check-in questions:
// reworded, reordered and retired, never deleted.
export interface Category {
  id: number;
  text: string;
  position: number;
  retiredAt: Date | null;
}

type CategoryRow = { id: string; text: string; position: number; retired_at: Date | null };

function toCategory(row: CategoryRow): Category {
  return {
    id: Number(row.id),
    text: row.text,
    position: row.position,
    retiredAt: row.retired_at,
  };
}

export async function listActiveCategories(): Promise<Category[]> {
  const sql = getSql();
  const rows = await sql<CategoryRow[]>`
    SELECT id, text, position, retired_at
    FROM categories
    WHERE retired_at IS NULL
    ORDER BY position, id
  `;
  return rows.map(toCategory);
}

// Active categories first, in order, then retired ones.
export async function listAllCategories(): Promise<Category[]> {
  const sql = getSql();
  const rows = await sql<CategoryRow[]>`
    SELECT id, text, position, retired_at
    FROM categories
    ORDER BY retired_at IS NOT NULL, position, id
  `;
  return rows.map(toCategory);
}

export async function addCategory(text: string): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO categories (text, position)
    SELECT ${text}, COALESCE(MAX(position), 0) + 1 FROM categories
  `;
}

// Bumping `updated_at` makes every classification against the old wording
// stale, so entries are reclassified against the new one.
export async function updateCategoryText(id: number, text: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE categories SET text = ${text}, updated_at = now()
    WHERE id = ${id} AND retired_at IS NULL AND text <> ${text}
  `;
}

export async function retireCategory(id: number): Promise<void> {
  const sql = getSql();
  await sql`UPDATE categories SET retired_at = now() WHERE id = ${id} AND retired_at IS NULL`;
}

// Swaps positions with the nearest active category above or below, in one
// statement so the swap is atomic. A no-op at either end of the list.
export async function moveCategory(id: number, direction: "up" | "down"): Promise<void> {
  const sql = getSql();
  const neighbour =
    direction === "up"
      ? sql`k.position < c.position ORDER BY k.position DESC`
      : sql`k.position > c.position ORDER BY k.position ASC`;
  await sql`
    WITH c AS (
      SELECT id, position FROM categories WHERE id = ${id} AND retired_at IS NULL
    ), n AS (
      SELECT k.id, k.position
      FROM categories k, c
      WHERE k.retired_at IS NULL AND ${neighbour}
      LIMIT 1
    )
    UPDATE categories k
    SET position = CASE WHEN k.id = c.id THEN n.position ELSE c.position END
    FROM c, n
    WHERE k.id IN (c.id, n.id)
  `;
}
