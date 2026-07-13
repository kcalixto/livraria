// spinner centralizado — substitui o antigo texto "Carregando…"
export function Loading() {
  return (
    <div className="loader" role="status">
      <span className="loader__spinner" aria-hidden="true" />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
