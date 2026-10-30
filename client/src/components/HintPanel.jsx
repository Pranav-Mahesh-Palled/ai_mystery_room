import Icon from './Icon.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';

export default function HintPanel({ hints, pending, onRequest }) {
  const unlockedHints = hints.filter((hint) => hint.unlocked);
  const remaining = hints.length - unlockedHints.length;

  return (
    <section className="hint-panel" aria-labelledby="hint-title">
      <div className="hint-panel-heading">
        <span className="eyebrow">A quiet nudge</span>
        <span className="hint-count">{remaining} remaining</span>
      </div>
      <h2 id="hint-title">Need another angle?</h2>
      <p className="muted-copy">Each hint costs 10 points. Take one only when the evidence has you stuck.</p>
      {unlockedHints.length > 0 && (
        <ol className="hint-list">
          {unlockedHints.map((hint, index) => (
            <li key={hint.hintId}><span className="hint-number">0{index + 1}</span><p>{hint.text}</p></li>
          ))}
        </ol>
      )}
      <button className="button button-outline hint-button" type="button" onClick={onRequest} disabled={pending || remaining === 0}>
        {pending ? <LoadingSpinner compact label="Finding a hint…" /> : <><Icon name="sparkle" size={16} /> {remaining ? 'Request a hint · −10 pts' : 'No hints remaining'}</>}
      </button>
    </section>
  );
}
