import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { caseApi, getApiErrorCode, getApiErrorMessage } from '../api/caseApi.js';
import ClueCard from '../components/ClueCard.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import HintPanel from '../components/HintPanel.jsx';
import Icon from '../components/Icon.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import SectionHeading from '../components/SectionHeading.jsx';
import SuspectCard from '../components/SuspectCard.jsx';

const basePoints = { Easy: 100, Medium: 150, Hard: 200 };

export default function InvestigationRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [pendingClues, setPendingClues] = useState(() => new Set());
  const [hintPending, setHintPending] = useState(false);
  const pendingCluesRef = useRef(new Set());
  const hintPendingRef = useRef(false);
  const hintRequestKeyRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setNotFound(false);
    setLoadError('');
    caseApi.getCase(id, { signal: controller.signal })
      .then((result) => {
        if (!active) return;
        if (result.status === 'completed') {
          navigate(`/cases/${id}/result`, { replace: true });
          return;
        }
        setCaseData(result);
      })
      .catch((error) => {
        if (!active || error.name === 'CanceledError') return;
        if (getApiErrorCode(error) === 'CASE_NOT_FOUND' || error.response?.status === 400 || error.response?.status === 404) setNotFound(true);
        else setLoadError(getApiErrorMessage(error));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [id, navigate]);

  const cluesFound = useMemo(() => caseData?.clues.filter((clue) => clue.discovered).length ?? 0, [caseData]);
  const hintsUsed = useMemo(() => caseData?.hints.filter((hint) => hint.unlocked).length ?? 0, [caseData]);
  const progress = caseData?.clues.length ? Math.round((cluesFound / caseData.clues.length) * 100) : 0;
  const scorePreview = caseData ? Math.max(0, (basePoints[caseData.difficulty] ?? 0) + cluesFound * 5 - hintsUsed * 10) : 0;

  async function discoverClue(clueId) {
    if (pendingCluesRef.current.has(clueId)) return;
    pendingCluesRef.current.add(clueId);
    setMutationError('');
    setPendingClues((previous) => new Set(previous).add(clueId));
    try {
      const result = await caseApi.discoverClue(id, clueId);
      setCaseData((current) => ({
        ...current,
        clues: current.clues.map((clue) => clue.clueId === result.clue.clueId ? result.clue : clue),
      }));
    } catch (error) {
      if (getApiErrorCode(error) === 'CASE_COMPLETED') {
        navigate(`/cases/${id}/result`, { replace: true });
        return;
      }
      setMutationError(getApiErrorMessage(error));
    } finally {
      pendingCluesRef.current.delete(clueId);
      setPendingClues((previous) => {
        const next = new Set(previous);
        next.delete(clueId);
        return next;
      });
    }
  }

  async function requestHint() {
    if (hintPendingRef.current) return;
    hintRequestKeyRef.current ??= crypto.randomUUID();
    hintPendingRef.current = true;
    setHintPending(true);
    setMutationError('');
    try {
      const result = await caseApi.requestHint(id, hintRequestKeyRef.current);
      hintRequestKeyRef.current = null;
      setCaseData((current) => ({
        ...current,
        hints: current.hints.map((hint) => hint.hintId === result.hint.hintId ? result.hint : hint),
      }));
    } catch (error) {
      if (getApiErrorCode(error) === 'CASE_COMPLETED') {
        navigate(`/cases/${id}/result`, { replace: true });
        return;
      }
      setMutationError(getApiErrorMessage(error));
    } finally {
      hintPendingRef.current = false;
      setHintPending(false);
    }
  }

  if (loading) return <div className="page page-state"><LoadingSpinner label="Retrieving the case file…" /></div>;
  if (notFound) return <CaseNotFound />;
  if (loadError) return <div className="page page-state"><ErrorBanner title="We couldn’t open this case" onRetry={() => window.location.reload()}>{loadError}</ErrorBanner><Link className="button button-secondary" to="/">Return to the room</Link></div>;
  if (!caseData) return null;

  return (
    <div className="page investigation-page">
      {location.state?.notice && <div className="notice-banner" role="status">{location.state.notice}</div>}
      <div className="case-topline"><div className="breadcrumbs"><Link to="/">Case desk</Link><Icon name="chevron" size={13} /><span>Investigation</span></div><span className="case-status"><span className="live-dot" /> Active investigation</span></div>

      <section className="case-briefing panel">
        <div className="briefing-meta"><span className="eyebrow">Case file / {id.slice(-6).toUpperCase()}</span><span className={`difficulty-badge difficulty-${caseData.difficulty.toLowerCase()}`}>{caseData.difficulty} case</span></div>
        <h1>{caseData.title}</h1>
        <p className="briefing-story">{caseData.story}</p>
        <div className="briefing-instruction"><Icon name="magnify" size={17} /><p>Read each account. Examine the evidence. When you’re ready, make one final accusation.</p></div>
      </section>

      <section className="progress-panel panel" aria-label="Investigation progress">
        <div className="progress-stat"><span className="eyebrow">Evidence examined</span><strong>{cluesFound}<small> / {caseData.clues.length}</small></strong><span className="progress-detail">clues</span></div>
        <div className="progress-track-wrap"><div className="progress-track" role="progressbar" aria-label="Clue examination progress" aria-valuemin="0" aria-valuemax={caseData.clues.length} aria-valuenow={cluesFound}><span style={{ width: `${progress}%` }} /></div><span className="progress-caption">{progress}% of the evidence reviewed</span></div>
        <div className="progress-stat progress-stat-right"><span className="eyebrow">Hints used</span><strong>{hintsUsed}<small> / {caseData.hints.length}</small></strong><span className="progress-detail">−10 points each</span></div>
        <div className="score-preview"><span className="eyebrow">Potential score</span><strong>{scorePreview}<small> pts</small></strong><span>If your accusation is correct</span></div>
      </section>

      {mutationError && <ErrorBanner title="The investigation wasn’t updated">{mutationError}</ErrorBanner>}

      <section className="case-section">
        <SectionHeading index="01" eyebrow="People of interest" title="The suspects" note={`${caseData.suspects.length} people connected to the case`} />
        <div className="suspect-grid">
          {caseData.suspects.map((suspect) => <SuspectCard key={suspect.suspectId} suspect={suspect} />)}
        </div>
      </section>

      <section className="case-section evidence-section">
        <SectionHeading index="02" eyebrow="The evidence room" title="Clues & objects" note="Descriptions appear only after you examine an item." />
        <div className="evidence-layout">
          <div className="clue-grid">
            {caseData.clues.map((clue) => <ClueCard key={clue.clueId} clue={clue} pending={pendingClues.has(clue.clueId)} onDiscover={discoverClue} />)}
          </div>
          <HintPanel hints={caseData.hints} pending={hintPending} onRequest={requestHint} />
        </div>
      </section>

      <section className="accusation-bar">
        <div><span className="eyebrow">When the evidence is enough</span><h2>Make your call.</h2><p>Your accusation ends the investigation.</p></div>
        <Link className="button button-primary" to={`/cases/${id}/accuse`}>Review suspects & accuse <Icon name="arrow" size={17} /></Link>
      </section>
    </div>
  );
}

function CaseNotFound() {
  return (
    <section className="page page-state empty-state">
      <span className="empty-mark"><Icon name="magnify" size={28} /></span>
      <span className="eyebrow">File not found</span>
      <h1>This case isn’t in the archive.</h1>
      <p>The link may be incomplete, or the case may no longer be available.</p>
      <Link className="button button-primary" to="/">Back to the case desk <Icon name="arrow" size={17} /></Link>
    </section>
  );
}
