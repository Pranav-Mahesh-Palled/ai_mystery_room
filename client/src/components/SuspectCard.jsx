export default function SuspectCard({ suspect, selectable = false, selected = false, onSelect }) {
  const Card = selectable ? 'button' : 'article';
  const cardProps = selectable
    ? { type: 'button', role: 'radio', 'aria-checked': selected, onClick: onSelect }
    : {};

  return (
    <Card className={`suspect-card${selectable ? ' suspect-card-selectable' : ''}${selected ? ' is-selected' : ''}`} {...cardProps}>
      <div className="suspect-card-top">
        <span className="suspect-stamp">{suspect.suspectId}</span>
        {selectable && <span className={`selection-mark${selected ? ' is-checked' : ''}`} aria-hidden="true">{selected ? '✓' : ''}</span>}
      </div>
      <h3>{suspect.name}</h3>
      <p className="suspect-role">{suspect.role}</p>
      <dl className="suspect-facts">
        {suspect.personality && <div><dt>Known for</dt><dd>{suspect.personality}</dd></div>}
        <div><dt>Motive</dt><dd>{suspect.motive}</dd></div>
        <div><dt>Alibi</dt><dd>{suspect.alibi}</dd></div>
      </dl>
    </Card>
  );
}
