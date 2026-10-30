import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ErrorBanner from '../components/ErrorBanner.jsx';
import Icon from '../components/Icon.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import { caseApi, getApiErrorMessage } from '../api/caseApi.js';

const levels = [
  { name: 'Easy', suspects: 3, clues: 5, hints: 2, points: 100, note: 'A first case' },
  { name: 'Medium', suspects: 4, clues: 7, hints: 3, points: 150, note: 'More to untangle' },
  { name: 'Hard', suspects: 5, clues: 9, hints: 3, points: 200, note: 'No detail is small' },
];

const premises = [
  'A rare violin disappears during a midnight concert at the old conservatory.',
  'The lighthouse keeper’s logbook vanishes just before a storm reaches the harbor.',
  'A priceless garden rose is cut on the eve of the town’s annual flower show.',
];

const waitingMessages = [
  'Setting the scene…',
  'Giving every suspect a story…',
  'Checking the evidence trail…',
];

export default function CreateMystery() {
  const navigate = useNavigate();
  const [premise, setPremise] = useState('');
  const [difficulty, setDifficulty] = useState('Easy');
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);
  const trimmedLength = premise.trim().length;
  const premiseError = touched && (trimmedLength < 10 || trimmedLength > 300)
    ? 'Write a premise between 10 and 300 characters.'
    : '';

  useEffect(() => {
    if (!submitting) return undefined;
    const timer = window.setInterval(() => setMessageIndex((index) => (index + 1) % waitingMessages.length), 1700);
    return () => window.clearInterval(timer);
  }, [submitting]);

  async function handleGenerate(event) {
    event?.preventDefault();
    setTouched(true);
    setError('');
    const cleanPremise = premise.trim();
    if (cleanPremise.length < 10 || cleanPremise.length > 300) return;

    setSubmitting(true);
    setMessageIndex(0);
    try {
      const created = await caseApi.createMystery({ premise: cleanPremise, difficulty });
      if (!created.caseId) throw new Error('The case server returned an incomplete response.');
      navigate(`/cases/${created.caseId}`);
    } catch (requestError) {
      setError(requestError.message === 'The case server returned an incomplete response.' ? requestError.message : getApiErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page create-page">
      <div className="page-heading">
        <div className="breadcrumbs"><span>Case desk</span><Icon name="chevron" size={13} /><span>New investigation</span></div>
        <span className="eyebrow">Open a new file</span>
        <h1>What happened?</h1>
        <p>Start with one intriguing detail. The room will build a case around it—suspects, evidence, and a trail worth following.</p>
      </div>

      <div className="create-layout">
        <form className="create-form panel" onSubmit={handleGenerate} noValidate>
          <div className="form-section-heading"><span className="section-index">01</span><div><span className="eyebrow">The starting point</span><h2>Your premise</h2></div></div>
          <label className="field-label" htmlFor="premise">Describe the incident</label>
          <textarea
            id="premise"
            name="premise"
            rows="5"
            maxLength="300"
            value={premise}
            onChange={(event) => { setPremise(event.target.value); setError(''); }}
            onBlur={() => setTouched(true)}
            placeholder="A valuable painting vanishes during a private exhibition…"
            aria-describedby="premise-help premise-counter premise-error"
            aria-invalid={Boolean(premiseError)}
            disabled={submitting}
          />
          <div className="field-meta">
            <span id="premise-help">Use 10–300 characters. Let the clues fill in the details.</span>
            <span id="premise-counter" className={trimmedLength > 300 ? 'counter-over' : ''}>{trimmedLength} / 300</span>
          </div>
          <p id="premise-error" className="field-error" aria-live="polite">{premiseError}</p>

          <div className="sample-prompts">
            <span className="eyebrow">Need a first line?</span>
            <div className="sample-prompt-list">
              {premises.map((sample) => <button type="button" key={sample} onClick={() => { setPremise(sample); setTouched(false); setError(''); }} disabled={submitting}>{sample}</button>)}
            </div>
          </div>

          <div className="form-divider" />
          <div className="form-section-heading"><span className="section-index">02</span><div><span className="eyebrow">Set the difficulty</span><h2>How deep is the trail?</h2></div></div>
          <fieldset className="difficulty-options">
            <legend className="sr-only">Choose mystery difficulty</legend>
            {levels.map((level) => (
              <label className={`difficulty-option${difficulty === level.name ? ' is-selected' : ''}`} key={level.name}>
                <input type="radio" name="difficulty" value={level.name} checked={difficulty === level.name} onChange={() => setDifficulty(level.name)} disabled={submitting} />
                <span className="difficulty-option-head"><strong>{level.name}</strong><span>{level.note}</span></span>
                <span className="difficulty-option-detail">{level.suspects} suspects <b>·</b> {level.clues} clues <b>·</b> {level.hints} hints</span>
                <span className="difficulty-option-points">{level.points} pts <small>base</small></span>
              </label>
            ))}
          </fieldset>

          {error && <ErrorBanner title="The mystery could not be generated">{error}</ErrorBanner>}
          <button className="button button-primary button-wide generate-button" type="submit" disabled={submitting || trimmedLength < 10 || trimmedLength > 300}>
            {submitting ? <LoadingSpinner compact label={waitingMessages[messageIndex]} /> : <>Generate mystery <Icon name="arrow" size={17} /></>}
          </button>
          <p className="form-footnote"><Icon name="lock" size={14} /> Your investigation is saved by case ID. No account needed.</p>
        </form>

        <aside className="create-aside">
          <div className="aside-file-card">
            <div className="aside-file-top"><span>FIELD GUIDE</span><span>01 / 03</span></div>
            <div className="aside-illustration"><div className="aside-ring ring-one" /><div className="aside-ring ring-two" /><Icon name="target" size={38} /></div>
            <span className="eyebrow">A fair investigation</span>
            <h2>Follow what can be proven.</h2>
            <p>Every mystery has one culprit and at least two clues that support the explanation. Motive alone is never the whole story.</p>
            <div className="aside-file-bottom"><span>Evidence matters</span><span>◆</span><span>Alibis matter</span></div>
          </div>
          <div className="aside-note"><span className="note-mark">“</span><p>Examine clues before you accuse. The decision is final.</p></div>
        </aside>
      </div>
    </div>
  );
}
