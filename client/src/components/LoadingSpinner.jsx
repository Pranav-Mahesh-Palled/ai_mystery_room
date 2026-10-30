export default function LoadingSpinner({ label = 'Loading case file…', compact = false }) {
  return (
    <div className={`loading-state${compact ? ' loading-state-compact' : ''}`} role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
