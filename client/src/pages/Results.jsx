import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { caseApi, getApiErrorCode, getApiErrorMessage } from '../api/caseApi.js';
import ErrorBanner from '../components/ErrorBanner.jsx';
import Icon from '../components/Icon.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

export default function Results() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setNotFound(false);
    setError('');
    caseApi.getResult(id, { signal: controller.signal })
      .then((data) => { if (active) setResult(data); })
      .catch((requestError) => {
        if (!active || requestError.name === 'CanceledError') return;
        if (getApiErrorCode(requestError) === 'CASE_NOT_COMPLETED' || requestError.response?.status === 403) {
          navigate(`/cases/${id}`, { replace: true, state: { notice: 'The reveal stays sealed until you submit your final accusation.' } });
          return;
        }
        if (getApiErrorCode(requestError) === 'CASE_NOT_FOUND' || requestError.response?.status === 400 || requestError.response?.status === 404) setNotFound(true);
        else setError(getApiErrorMessage(requestError));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [id, navigate]);

  if (loading) return <div className="page page-state"><LoadingSpinner label="Unsealing the result…" /></div>;
  if (notFound) return <ResultsNotFound />;
  if (error) return <div className="page page-state"><ErrorBanner title="The result is unavailable" onRetry={() => window.location.reload()}>{error}</ErrorBanner><Link className="button button-secondary" to="/">Return to the room</Link></div>;
  if (!result) return null;

  const correct = result.isCorrect;
  const score = result.scoreBreakdown;

  return (
    <div className="page results-page">
      <div className="breadcrumbs"><Link to="/">Case desk</Link><Icon name="chevron" size={13} /><span>Case closed</span></div>
      <section className={`verdict-panel${correct ? ' verdict-correct' : ' verdict-incorrect'}`}>
        <div className="verdict-icon" aria-hidden="true">{correct ? <Icon name="check" size={30} /> : <Icon name="target" size={30} />}</div>
        <span className="eyebrow">Investigation complete · {result.difficulty} case</span>
        <h1>{correct ? 'You read the room.' : 'The details led elsewhere.'}</h1>
        <p>{correct ? 'Your accusation matched the evidence.' : 'Your accusation missed the mark. Here is what the evidence showed.'}</p>
        <span className="verdict-word">{correct ? 'CASE SOLVED' : 'CASE UNSOLVED'}</span>
      </section>

      <section className="results-case-heading"><span className="eyebrow">Final report / {result.caseId.slice(-6).toUpperCase()}</span><h2>{result.title}</h2></section>

      <div className="reveal-grid">
        <article className="reveal-card player-card">
          <span className="eyebrow">Your accusation</span>
          <span className="reveal-suspect-id">{result.accusation.suspect.suspectId}</span>
          <h3>{result.accusation.suspect.name}</h3>
          <p>{result.accusation.suspect.role}</p>
        </article>
        <article className="reveal-card culprit-card">
          <span className="eyebrow">The culprit</span>
          <span className="reveal-suspect-id">{result.trueCulprit.suspectId}</span>
          <h3>{result.trueCulprit.name}</h3>
          <p>{result.trueCulprit.role}</p>
          <dl className="culprit-details"><div><dt>Motive</dt><dd>{result.trueCulprit.motive}</dd></div><div><dt>Alibi</dt><dd>{result.trueCulprit.alibi}</dd></div></dl>
        </article>
      </div>

      <section className="solution-section panel">
        <div className="solution-heading"><span className="section-index">01</span><div><span className="eyebrow">How the pieces fit</span><h2>The explanation</h2></div></div>
        <p className="solution-copy">{result.solution.explanation}</p>
        <div className="supporting-evidence">
          <span className="eyebrow">Supporting evidence</span>
          <div className="supporting-clue-list">
            {result.solution.supportingClues.map((clue) => (
              <article className="supporting-clue" key={clue.clueId}>
                <span className="clue-id">{clue.clueId}</span>
                <div><h3>{clue.title}</h3><span>{clue.location}</span><p>{clue.description}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="score-report panel" aria-labelledby="score-title">
        <div className="score-report-heading"><div><span className="eyebrow">The final tally</span><h2 id="score-title">Score breakdown</h2></div><div className="final-score"><strong>{result.finalScore}</strong><span>points</span></div></div>
        <dl className="score-lines">
          <div><dt>Base points <small>{correct ? 'correct accusation' : 'incorrect accusation'}</small></dt><dd>{score.basePoints}</dd></div>
          <div><dt>Discovered clue bonus <small>{score.clueBonus / 5} clues × 5 pts</small></dt><dd>+{score.clueBonus}</dd></div>
          <div><dt>Hint penalty <small>{score.hintPenalty / 10} hints × 10 pts</small></dt><dd>−{score.hintPenalty}</dd></div>
          <div className="score-total"><dt>Final score <small>minimum zero</small></dt><dd>{score.total}</dd></div>
        </dl>
      </section>

      <section className="results-actions"><p>The file is closed. There’s always another case.</p><Link className="button button-primary" to="/create">Open a new investigation <Icon name="arrow" size={17} /></Link></section>
    </div>
  );
}

function ResultsNotFound() {
  return (
    <section className="page page-state empty-state">
      <span className="empty-mark"><Icon name="lock" size={26} /></span><span className="eyebrow">Archive unavailable</span>
      <h1>This result isn’t in the archive.</h1><p>Check the case link or open a new investigation.</p>
      <Link className="button button-primary" to="/">Back to the case desk <Icon name="arrow" size={17} /></Link>
    </section>
  );
}
