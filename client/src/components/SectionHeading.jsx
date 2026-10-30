export default function SectionHeading({ index, eyebrow, title, note, id }) {
  return (
    <div className="section-heading">
      <div className="section-heading-title">
        {index && <span className="section-index">{index}</span>}
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2 id={id}>{title}</h2>
        </div>
      </div>
      {note && <p className="section-note">{note}</p>}
    </div>
  );
}
