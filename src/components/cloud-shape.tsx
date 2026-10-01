// The outline drawn behind a cloud's content. Styles live in globals.css
// (.cloud-shape); the parent needs the .cloud class.
export function CloudShape() {
  return (
    <div aria-hidden className="cloud-shape">
      <span className="cloud-body" />
      <span className="cloud-bump-1" />
      <span className="cloud-bump-2" />
      <span className="cloud-bump-3" />
    </div>
  );
}
