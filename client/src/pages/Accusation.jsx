import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { caseApi, getApiErrorCode, getApiErrorMessage } from '../api/caseApi.js';
import ErrorBanner from '../components/ErrorBanner.jsx';
import Icon from '../components/Icon.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import SuspectCard from '../components/SuspectCard.jsx';

export default function Accusation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    caseApi.getCase(id, { signal: controller.signal })
      .then((result) => {
        if (!active) return;
        if (result.status === 'completed') { navigate(`/cases/${id}/result`, { replace: true }); return; }
        setCaseData(result);
      })
      .catch((requestError) => {
        if (!active || requestError.name === 'CanceledError') return;
        if (getApiErrorCode(requestError) === 'CASE_NOT_FOUND' || requestError.response?.status === 400 || requestError.response?.status === 404) setNotFound(true);
        else setLoadError(getApiErrorMessage(requestError));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [id, navigate]);

  async function submitAccusation(event) {
    event.preventDefault();
    if (!selected || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await caseApi.accuse(id, selected);
      if (result.status === 'completed') navigate(`/cases/${id}/result`);
      else setError('The case server did not confirm completion. Your accusation has not been submitted.');
    } catch (requestError) {
      if (getApiErrorCode(requestError) === 'CASE_COMPLETED') {
        navigate(`/cases/${id}/result`, { replace: true });
        return;
      }
      try {
        const currentCase = await caseApi.getCase(id);
        if (currentCase.status === 'completed') {
          navigate(`/cases/${id}/result`, { replace: true });
          return;
        }
        setCaseData(currentCase);
        setError(`${getApiErrorMessage(requestError)} The case is still active, so you can safely try again.`);
      } catch {
        setError('The server did not confirm whether the accusation was recorded. Check your connection and reopen this case before trying again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="page page-state"><LoadingSpinner label="Reviewing the case file…" /></div>;
  if (notFound) return <CaseNotFound />;
  if (loadError) return <div className="page page-state"><ErrorBanner title="We couldn’t open this case" onRetry={() => window.location.reload()}>{loadError}</ErrorBanner><Link className="button button-secondary" to="/">Return to the room</Link></div>;
  if (!caseData) return null;
  if (caseData.status === 'completed') return <Navigate to={`/cases/${id}/result`} replace />;

  return (
    <div className="page accusation-page">
      <div className="breadcrumbs"><Link to={`/cases/${id}`}><Icon name="back" size={15} /> Back to investigation</Link><Icon name="chevron" size={13} /><span>Final accusation</span></div>
      <div className="page-heading accusation-heading">
        <span className="eyebrow">Case file / {id.slice(-6).toUpperCase()}</span>
        <h1>Who did it?</h1>
        <p>You’ve reviewed the evidence. Choose the person whose story doesn’t hold together.</p>
      </div>

      <div className="final-warning"><Icon name="warning" size={20} /><div><strong>This is your final call.</strong><p>Submitting ends the investigation. You won’t be able to examine more clues or request hints.</p></div></div>
      <form onSubmit={submitAccusation}>
        <fieldset className="accusation-fieldset">
          <legend className="sr-only">Choose the suspect you accuse</legend>
          <div className="accusation-title-row"><div><span className="eyebrow">{caseData.title}</span><h2>Select one suspect</h2></div><span className="selection-hint">{selected ? 'One suspect selected' : 'Choose one to continue'}</span></div>
          <div className="suspect-grid accusation-suspect-grid" role="radiogroup" aria-label="Suspects">
            {caseData.suspects.map((suspect) => <SuspectCard key={suspect.suspectId} suspect={suspect} selectable selected={selected === suspect.suspectId} onSelect={() => setSelected(suspect.suspectId)} />)}
          </div>
        </fieldset>
        {error && <ErrorBanner title="Accusation not submitted">{error}</ErrorBanner>}
        <div className="accusation-actions">
          <Link className="button button-quiet" to={`/cases/${id}`}><Icon name="back" size={16} /> Keep investigating</Link>
          <button className="button button-primary" type="submit" disabled={!selected || submitting}>
            {submitting ? <LoadingSpinner compact label="Submitting…" /> : <>Submit final accusation <Icon name="arrow" size={17} /></>}
          </button>
        </div>
      </form>
    </div>
  );
}

function CaseNotFound() {
  return (
    <section className="page page-state empty-state">
      <span className="empty-mark"><Icon name="magnify" size={28} /></span><span className="eyebrow">File not found</span>
      <h1>This case isn’t in the archive.</h1><p>Check the case link or return to the case desk.</p>
      <Link className="button button-primary" to="/">Back to the case desk <Icon name="arrow" size={17} /></Link>
    </section>
  );
}
