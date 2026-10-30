import Icon from './Icon.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';

export default function ClueCard({ clue, pending, onDiscover }) {
  return (
    <article className={`clue-card${clue.discovered ? ' is-discovered' : ''}`}>
      <div className="clue-card-top">
        <span className="clue-id">{clue.clueId}</span>
        <span className={`status-label${clue.discovered ? ' status-found' : ''}`}>
          {clue.discovered ? <><Icon name="check" size={14} /> Examined</> : <><Icon name="lock" size={14} /> Unexamined</>}
        </span>
      </div>
      <h3>{clue.title}</h3>
      <p className="clue-location"><Icon name="pin" size={15} /> {clue.location}</p>
      {clue.discovered ? (
        <div className="clue-description">{clue.description}</div>
      ) : (
        <div className="clue-locked-copy">The details are sealed until you examine this evidence.</div>
      )}
      {!clue.discovered && (
        <button className="button button-secondary clue-action" type="button" onClick={() => onDiscover(clue.clueId)} disabled={pending}>
          {pending ? <LoadingSpinner compact label="Examining…" /> : <><Icon name="magnify" size={16} /> Examine evidence</>}
        </button>
      )}
    </article>
  );
}
