export function DemoBanner({ onClear }: { onClear: () => void }) {
  return (
    <div role="status" className="no-print border-b border-amber/40 bg-amber-tint">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm">
        <p className="min-w-0 flex-1">
          <strong className="font-semibold">Synthetic demo data.</strong> Every team, product, and release here is fictional. Eight
          conflicts are planted on purpose.
        </p>
        <button type="button" className="btn" onClick={onClear}>
          Clear and start empty
        </button>
      </div>
    </div>
  );
}
