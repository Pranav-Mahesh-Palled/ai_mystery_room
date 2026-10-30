import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

const difficulties = [
  { name: 'Easy', files: '03', detail: 'A clear trail', points: 100 },
  { name: 'Medium', files: '04', detail: 'A few crossed wires', points: 150 },
  { name: 'Hard', files: '05', detail: 'Every detail matters', points: 200 },
];

export default function Home() {
  return (
    <div className="page home-page">
      <section className="hero-panel">
        <div className="hero-copy">
          <div className="eyebrow"><span className="live-dot" /> Private Investigation Bureau <span className="eyebrow-divider">/</span> Case desk 07</div>
          <h1>Every detail<br />has a <em>story.</em></h1>
          <p className="hero-lede">A painting is missing. A witness is lying. The answer is somewhere in the evidence. Build a mystery, follow the trail, and decide who did it.</p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/create">Start an investigation <Icon name="arrow" size={17} /></Link>
            <a className="quiet-link" href="#how-it-works">See how it works <Icon name="chevron" size={15} /></a>
          </div>
          <div className="hero-footnote"><span className="hero-footnote-rule" /> Three steps. One final accusation.</div>
        </div>
        <div className="hero-file" aria-label="Illustration of a confidential case file">
          <div className="file-shadow" />
          <div className="file-paper">
            <div className="file-topline"><span>Investigation record</span><span>No. 07—A</span></div>
            <div className="file-seal"><Icon name="target" size={64} /></div>
            <span className="file-classification">CASE FILE</span>
            <div className="file-line file-line-long" /><div className="file-line" />
            <div className="file-paper-foot"><span>OPEN / ACTIVE</span><span className="file-stamp">CONFIDENTIAL</span></div>
          </div>
          <span className="file-index" aria-hidden="true">07</span>
          <span className="hero-caption"><span className="caption-dot" /> Your next case is waiting.</span>
        </div>
        <div className="hero-coordinate" aria-hidden="true">ARCHIVE • 51°30′N</div>
      </section>

      <section id="how-it-works" className="how-section page-section">
        <div className="section-kicker">The method</div>
        <div className="how-heading-row">
          <h2>From first clue<br />to final call.</h2>
          <p>Each case is built around your premise. Take your time, compare what people say with what the evidence shows, then make one final accusation.</p>
        </div>
        <div className="steps-grid">
          <article className="step-card"><span className="step-number">01</span><Icon name="sparkle" size={19} /><h3>Set the scene</h3><p>Give us a premise and choose how tangled you want the case to be.</p></article>
          <article className="step-card"><span className="step-number">02</span><Icon name="magnify" size={19} /><h3>Follow the evidence</h3><p>Examine clues, weigh alibis, and request a hint if you need one.</p></article>
          <article className="step-card"><span className="step-number">03</span><Icon name="target" size={19} /><h3>Name your suspect</h3><p>Make your accusation when you’re ready. Then see how the evidence fits.</p></article>
        </div>
      </section>

      <section className="difficulty-section page-section">
        <div className="section-kicker">Choose your case load</div>
        <div className="difficulty-heading-row"><h2>Three levels of doubt.</h2><p>More suspects and evidence make for a longer investigation.</p></div>
        <div className="difficulty-grid">
          {difficulties.map((level) => (
            <article className="difficulty-card" key={level.name}>
              <div className="difficulty-card-top"><span>{level.name}</span><span className="difficulty-files">{level.files} FILES</span></div>
              <p>{level.detail}</p>
              <div className="difficulty-card-bottom"><span>Correct accusation</span><strong>{level.points} pts</strong></div>
              <div className="difficulty-counts">{Number(level.files)} suspects <span>·</span> {level.name === 'Easy' ? 5 : level.name === 'Medium' ? 7 : 9} clues <span>·</span> {level.name === 'Easy' ? 2 : 3} hints</div>
            </article>
          ))}
        </div>
      </section>

      <section className="scoring-strip" aria-labelledby="scoring-heading">
        <div><span className="eyebrow">The scoring ledger</span><h2 id="scoring-heading">Read carefully.<br />Keep your points.</h2></div>
        <div className="score-equation" aria-label="Base points plus five points per discovered clue, minus ten points per hint, with a minimum of zero">
          <div><strong>Base</strong><span>for a correct accusation</span></div><b>+</b>
          <div><strong>5</strong><span>per clue examined</span></div><b>−</b>
          <div><strong>10</strong><span>per hint requested</span></div><b>=</b>
          <div><strong>Score</strong><span>minimum zero</span></div>
        </div>
      </section>

      <section className="home-cta">
        <div><span className="eyebrow">The desk is open</span><h2>Ready to read between the lines?</h2></div>
        <Link className="button button-primary" to="/create">Create your mystery <Icon name="arrow" size={17} /></Link>
      </section>
    </div>
  );
}
