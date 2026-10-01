// The thought-bubble outline drawn behind a cloud's content. Styles live in
// globals.css (.cloud-shape); the parent needs the .cloud class.
export function CloudShape() {
  return (
    <div aria-hidden className="cloud-shape">
      <span className="cloud-body" />
      <span className="cloud-top-1" />
      <span className="cloud-top-2" />
      <span className="cloud-top-3" />
      <span className="cloud-bottom-1" />
      <span className="cloud-bottom-2" />
      <span className="cloud-bottom-3" />
      <span className="cloud-left" />
      <span className="cloud-right" />
      <span className="cloud-tail-1" />
      <span className="cloud-tail-2" />
    </div>
  );
}
