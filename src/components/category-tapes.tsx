// The categories an entry fits, as little strips of tape. Nothing when it
// fits none or hasn't been classified yet.
export function CategoryTapes({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return null;
  }
  return (
    <ul aria-label="Categories" className="mt-2 flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <li key={tag} className="category-tape">
          {tag}
        </li>
      ))}
    </ul>
  );
}
