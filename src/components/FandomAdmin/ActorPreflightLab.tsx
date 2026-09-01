import { useEffect, useMemo, useState } from 'react';
import { dbSaveGrid, type GridRecord } from '../../utils/collectionDB';
import { getPublicSession, syncPublicGrid } from '../../utils/publicAccount';
import styles from './ActorPreflightLab.module.css';

type AnyRecord = Record<string, any>;
type Pairing = AnyRecord & { vibeKey: string; labels?: string[]; auditState?: string; verdict?: string; eligible?: boolean };
type Actor = AnyRecord & { actorId: string; canonicalName: string; romanizedName?: string; aliases?: string[]; pairings?: Pairing[] };
type BlindBoard = { mode: 'event'|'compiled'; label: string; board?: AnyRecord|null };
type BlindReview = AnyRecord & { status?: 'pending'|'revealed'|'unavailable'; choice?: 'event'|'compiled'|'neither'; agreement?: boolean; systemWinner?: string; presentationOrder?: string[]; boards?: BlindBoard[]; reasonCodes?: string[]; note?: string };
type BoardDiagnostic = { available?: boolean; requiredCount?: number; candidateCount?: number; usableCount?: number; distinctUsableCount?: number; largestFamilyCount?: number; largestDistinctFamilyCount?: number; reasonCodes?: string[]; reasonCode?: string|null; summary?: string };

type AuditContract = { status?: 'current'|'legacy'; isCurrent?: boolean; isLegacy?: boolean; legacyReasons?: string[]; currentVersions?: AnyRecord };
type Run = AnyRecord & { runId?: string; scope?: string; curationVersion?: number; identityProfileVersion?: number; aestheticClusterVersion?: number; promiseContractVersion?: number; queryRuns?: AnyRecord[]; rawResults?: AnyRecord[]; rejections?: AnyRecord[]; identityEvidence?: AnyRecord; detectedEvents?: AnyRecord[]; boardDiagnostics?: { event?: BoardDiagnostic; compiled?: BoardDiagnostic }; strongestEvent?: AnyRecord; strongestCompiled?: AnyRecord; winner?: AnyRecord; alternate?: AnyRecord; curationReceipt?: AnyRecord; blindReview?: BlindReview; auditContract?: AuditContract };

type RescueExport = {
  gridId: string;
  runId: string;
  receiptId: string;
  arrangedAt: string;
  exportedAt: string;
  actor: { id: string; name: string; nameEn: string; accentColor: string };
  vibe: { key: string; label: string; labelEn: string; emoji: string; subtitle: string; subtitleEn: string; searchSpell: string };
  candidates: Array<{ candidateId: string; query?: string; title?: string; source?: string; link?: string; thumbnail?: string }>;
};
const EMPTY_RECORDS: AnyRecord[] = [];

const VERDICTS = ['approved','approved_override','needs_query_work','needs_curation_work','insufficient_material','identity_risk','do_not_schedule'];
const VERDICT_LABELS: Record<string, string> = { approved: 'Approved', approved_override: 'Approved with override', needs_query_work: 'Needs query work', needs_curation_work: 'Needs curation work', insufficient_material: 'Insufficient material', identity_risk: 'Identity risk', do_not_schedule: 'Do not schedule' };
const DISAGREEMENT_REASONS: Array<[string,string]> = [
  ['better_individual_cards','Better individual cards'],
  ['stronger_overall_cohesion','Stronger overall cohesion'],
  ['event_repetition_intentional','Event repetition felt intentional'],
  ['event_repetition_redundant','Event repetition felt redundant'],
  ['compiled_board_varied','Compiled board felt varied'],
  ['compiled_board_random','Compiled board felt random'],
  ['wrong_vibe','Wrong vibe'],
  ['wrong_actor','Wrong actor'],
  ['bad_arrangement','Bad arrangement'],
  ['other_editorial_instinct','Other editorial instinct'],
];
const CHALLENGE_REASONS: Array<[string,string]> = [
  ['stronger_vibe_match','Stronger Vibe match'],
  ['better_silhouette','Better silhouette'],
  ['better_costume_continuity','Better costume continuity'],
  ['better_character_match','Better character match'],
  ['intentional_similarity','Intentional similarity'],
  ['better_composition','Better composition'],
  ['better_hero_image','Better hero image'],
  ['not_collage_duplicate_or_bts','Not actually a collage, duplicate, or BTS image'],
  ['other_editorial_instinct','Other editorial instinct'],
];
const api = async (body?: AnyRecord, query?: AnyRecord) => { const queryString = query ? `?${new URLSearchParams(Object.entries(query).filter(([,value]) => value !== undefined && value !== '') as [string,string][]).toString()}` : ''; const response = await fetch(`/.netlify/functions/actor-audits${queryString}`, { method: body ? 'POST' : 'GET', headers: body ? {'Content-Type':'application/json'} : undefined, body: body ? JSON.stringify(body) : undefined, credentials:'include' }); const result = await response.json().catch(() => null); if (!response.ok) throw new Error(result?.error || 'Actor audit desk unavailable.'); return result; };
const text = (value: unknown) => Array.isArray(value)
  ? value.map(item => typeof item === 'object' && item ? JSON.stringify(item) : String(item)).join(' · ')
  : typeof value === 'object' && value ? JSON.stringify(value, null, 2) : String(value ?? '—');
const date = (value: unknown) => value ? new Date(String(value)).toLocaleString() : 'Not run';

const proxiedImageUrl = (url: string) => url.startsWith('/.netlify/functions/image-proxy?')
  ? url
  : `/.netlify/functions/image-proxy?url=${encodeURIComponent(url)}`;
export const ActorPreflightLab: React.FC = () => {
  const [actors,setActors] = useState<Actor[]>([]); const [actorId,setActorId] = useState(''); const [vibeKey,setVibeKey] = useState('');
  const [run,setRun] = useState<Run|null>(null); const [currentRun,setCurrentRun] = useState<Run|null>(null); const [loading,setLoading] = useState(true); const [busy,setBusy] = useState(''); const [notice,setNotice] = useState(''); const [railOpen,setRailOpen] = useState(true);
  const [scope,setScope] = useState('full'); const [verdict,setVerdict] = useState(''); const [notes,setNotes] = useState(''); const [priorRuns,setPriorRuns] = useState<Run[]>([]);
  const [vibeConfirmed,setVibeConfirmed] = useState(false); const [publishableConfirmed,setPublishableConfirmed] = useState(false);
  const [disagreementReasons,setDisagreementReasons] = useState<string[]>([]); const [editorialNote,setEditorialNote] = useState('');
  useEffect(() => { let live=true; api().then(result => { if(live) { const next = result.actors ?? []; setActors(next); if(next[0]) { setActorId(next[0].actorId); setVibeKey(next[0].pairings?.[0]?.vibeKey ?? ''); } } }).catch(e=>live&&setNotice(e.message)).finally(()=>live&&setLoading(false)); return()=>{live=false}; },[]);
  const actor = useMemo(()=>actors.find(item=>item.actorId===actorId),[actors,actorId]); const pairing = actor?.pairings?.find(item=>item.vibeKey===vibeKey);
  useEffect(() => { setRun(null); setCurrentRun(null); setPriorRuns([]); setVerdict(''); setNotes(''); setVibeConfirmed(false); setPublishableConfirmed(false); setDisagreementReasons([]); setEditorialNote(''); if(!actorId||!vibeKey)return; let live=true; api(undefined,{actorId,vibeKey}).then(result=>{if(live){setRun(result.currentRun ?? null); setCurrentRun(result.currentRun ?? null); setPriorRuns(result.priorRuns ?? []); setVerdict(result.verdict ?? ''); setNotes(result.notes ?? ''); setVibeConfirmed(result.currentRun?.operatorVerdict?.vibeConfirmed === true); setPublishableConfirmed(result.currentRun?.operatorVerdict?.publishableConfirmed === true); setDisagreementReasons(result.currentRun?.blindReview?.reasonCodes ?? []); setEditorialNote(result.currentRun?.blindReview?.note ?? '');}}).catch(e=>live&&setNotice(e.message)); return()=>{live=false}; },[actorId,vibeKey]);
  function applyRefresh(result:AnyRecord) { if (result.actors) setActors(result.actors); else if (result.actor) setActors(current => current.map(item => item.actorId === result.actor.actorId ? result.actor : item)); }
  async function startAudit(nextScope:string) {
    setBusy(nextScope);
    setNotice('');
    try {
      const started=await api({action:'run',actorId,vibeKey,scope:nextScope});
      applyRefresh(started);

      // Re-read the saved run before announcing success. The audit can take long
      // enough for an intermediary response to lose the pending board payload,
      // while this detail endpoint is the authoritative stored snapshot.
      const refreshed=await api(undefined,{actorId,vibeKey});
      const startedRunId=started.currentRun?.runId;
      const result=!startedRunId||refreshed.currentRun?.runId===startedRunId ? refreshed : started;
      const nextRun=result.currentRun ?? null;
      if(!nextRun) throw new Error('The audit was saved, but its review did not load. Refresh this page to open the saved run.');
      if(nextRun.blindReview?.status==='pending') {
        const boards=nextRun.blindReview.boards;
        const hasTwoCompleteBoards=Array.isArray(boards)&&boards.length===2&&boards.every((item:BlindBoard)=>Array.isArray(item.board?.candidates)&&item.board.candidates.length>=9);
        if(!hasTwoCompleteBoards) throw new Error('The audit was saved, but the blinded boards did not load. Refresh this page to open the saved run.');
      }

      setRun(nextRun);
      setCurrentRun(nextRun);
      setPriorRuns(result.priorRuns ?? []);
      setVerdict('');
      setNotes('');
      setVibeConfirmed(false);
      setPublishableConfirmed(false);
      setDisagreementReasons([]);
      setEditorialNote('');
      setNotice(nextRun.blindReview?.status==='unavailable'
        ? `${nextScope === 'full' ? 'Full' : 'Representative'} audit completed, but it did not produce two complete boards. Review the retained evidence below.`
        : `${nextScope === 'full' ? 'Full' : 'Representative'} audit completed. Choose between the two boards below.`);
      requestAnimationFrame(()=>document.getElementById('actor-audit-evidence')?.scrollIntoView({behavior:'smooth',block:'start'}));
    } catch(e:any) {
      setNotice(e.message);
    } finally {
      setBusy('');
    }
  }
  async function saveBlindChoice(choice:'event'|'compiled'|'neither') { if(!currentRun?.runId||run?.runId!==currentRun.runId)return; setBusy('blind-choice'); setNotice(''); try { const result=await api({action:'blind_choice',actorId,vibeKey,runId:currentRun.runId,choice}); applyRefresh(result); setRun(result.currentRun ?? null); setCurrentRun(result.currentRun ?? null); setPriorRuns(result.priorRuns ?? []); setDisagreementReasons(result.currentRun?.blindReview?.reasonCodes ?? []); setEditorialNote(result.currentRun?.blindReview?.note ?? ''); setNotice('Independent choice recorded. The system result is now revealed.'); } catch(e:any){setNotice(e.message)} finally{setBusy('')} }
  async function saveDisagreement(event:React.FormEvent) { event.preventDefault(); if(!currentRun?.runId||run?.runId!==currentRun.runId)return; setBusy('reasons'); setNotice(''); try { const result=await api({action:'blind_reasons',actorId,vibeKey,runId:currentRun.runId,reasonCodes:disagreementReasons,note:editorialNote}); applyRefresh(result); setRun(result.currentRun ?? null); setCurrentRun(result.currentRun ?? null); setPriorRuns(result.priorRuns ?? []); setDisagreementReasons(result.currentRun?.blindReview?.reasonCodes ?? disagreementReasons); setEditorialNote(result.currentRun?.blindReview?.note ?? editorialNote); setNotice('Editorial calibration notes saved.'); } catch(e:any){setNotice(e.message)} finally{setBusy('')} }
  async function saveVerdict(event:React.FormEvent) { event.preventDefault(); if(!currentRun?.runId||run?.runId!==currentRun.runId||!verdict)return; setBusy('verdict'); setNotice(''); try { const result=await api({action:'verdict',actorId,vibeKey,runId:currentRun.runId,verdict,notes,vibeConfirmed:verdict==='approved'&&vibeConfirmed,publishableConfirmed:verdict==='approved'&&publishableConfirmed}); applyRefresh(result); setRun(result.currentRun ?? currentRun); setCurrentRun(result.currentRun ?? currentRun); setVerdict(result.verdict ?? verdict); setNotes(result.notes ?? notes); setNotice(verdict==='approved'?'Both human confirmations saved. This pairing is eligible for the Liu Xueyi graduation cohort.':'Verdict saved to the curation ledger.'); } catch(e:any){setNotice(e.message)} finally{setBusy('')} }
  async function saveCandidateFlag(candidateId:string,flagged:boolean,intent='pin',reasons:string[]=[] ) { if(!currentRun?.runId||run?.runId!==currentRun.runId)return; setBusy(`flag:${candidateId}`); setNotice(''); try { const result=await api({action:'flag_candidate',actorId,vibeKey,runId:currentRun.runId,candidateId,flagged,intent,reasons}); applyRefresh(result); const next=result.currentRun ?? currentRun; setRun(next); setCurrentRun(next); setPriorRuns(result.priorRuns ?? priorRuns); setNotice(flagged?'Image-level editorial intent saved. Safety gates still apply.':'Image annotation removed from the requested grid review.'); } catch(e:any){setNotice(e.message)} finally{setBusy('')} }
  async function saveRescueBoard(candidateIds:string[]) { if(!currentRun?.runId||run?.runId!==currentRun.runId)return; setBusy('rescue-board'); setNotice(''); try { const result=await api({action:'save_rescue_board',actorId,vibeKey,runId:currentRun.runId,candidateIds}); applyRefresh(result); const next=result.currentRun ?? currentRun; setRun(next); setCurrentRun(next); setPriorRuns(result.priorRuns ?? priorRuns); setNotice('Operator Rescue Board saved as a separate append-only receipt.'); } catch(e:any){setNotice(e.message)} finally{setBusy('')} }
  async function markRescueCalibration(receiptId:string) {
    if(!run?.runId)return;
    setBusy(`calibration:${receiptId}`); setNotice('');
    try {
      const selectedRunId=run.runId;
      const result=await api({action:'mark_rescue_calibration',actorId,vibeKey,runId:selectedRunId,receiptId});
      applyRefresh(result);
      const nextCurrent=result.currentRun ?? currentRun;
      const nextPrior=result.priorRuns ?? priorRuns;
      setCurrentRun(nextCurrent);
      setPriorRuns(nextPrior);
      setRun(selectedRunId===nextCurrent?.runId?nextCurrent:nextPrior.find((item:Run)=>item.runId===selectedRunId)??run);
      setNotice('Rescue board confirmed as calibration evidence. A fresh audit must reproduce its signals beyond these exact nine before approval.');
    } catch(e:any){setNotice(e.message)} finally{setBusy('')}
  }
  async function exportRescueBoard(receiptId:string) {
    if(!currentRun?.runId||run?.runId!==currentRun.runId)return;
    setBusy('export-rescue-board'); setNotice('');
    try {
      const result=await api({action:'export_rescue_board',actorId,vibeKey,runId:currentRun.runId,receiptId});
      const grid=collectionGridFromRescueExport(result.rescueExport);
      await dbSaveGrid(grid);
      const session=await getPublicSession();
      if(session) {
        try {
          await syncPublicGrid(session,grid.id);
        } catch(error:any) {
          setNotice(`Rescue grid saved to this device, but account sync failed: ${error?.message || 'try again from Collection.'}`);
          return;
        }
      }
      setNotice(session?'Rescue arrangement exported and synced to Collection.':'Rescue arrangement exported to this device’s Collection.');
    } catch(e:any){setNotice(e.message)} finally{setBusy('')}
  }
  const selectedIsCurrent = Boolean(run?.runId && currentRun?.runId === run.runId);
  const review = run?.blindReview;
  const disagreementNeedsReasons = Boolean(review?.choice && review.agreement !== true && !review.reasonCodes?.length);
  const requiresFreshAudit = Boolean(run?.auditContract?.isLegacy) || (selectedIsCurrent && pairing?.auditState === 'calibration_reaudit_required');
  const currentRunIsLegacy = Boolean(currentRun?.auditContract?.isLegacy);
  const verdictAvailable = selectedIsCurrent && !requiresFreshAudit && (review?.status === 'unavailable' || (review?.choice && !disagreementNeedsReasons));
  const verdictOptions = review?.status === 'unavailable' ? VERDICTS.filter(value=>!['approved','approved_override'].includes(value)) : VERDICTS;
  if(loading) return <div className={styles.empty}>Loading actor evidence desk…</div>;
  return <section className={styles.lab} aria-labelledby="actor-preflight-title">
    <header className={styles.masthead}><div><p className={styles.eyebrow}>Fandom Vibes / private calibration</p><h3 id="actor-preflight-title">Actor preflight lab</h3><p>Calibrate actor × Vibe Pack pairings against bounded evidence before they enter the Daily Drop rotation.</p></div><div className={styles.runbook}><span>Operator boundary</span><strong>One pairing at a time</strong><span>Every decision leaves a receipt.</span></div></header>
    {notice&&<div className={styles.error} role="status">{notice}</div>}
    <div className={`${styles.workspace} ${railOpen ? '' : styles.workspaceCollapsed}`}>
      <aside className={styles.rail} aria-label="Actor selector"><button className={styles.railToggle} type="button" aria-expanded={railOpen} aria-label={railOpen ? 'Collapse actor register' : 'Expand actor register'} onClick={()=>setRailOpen(open=>!open)}>{railOpen ? '‹' : '›'}</button><div className={styles.railHead}><strong>Actor register</strong><span>{actors.length} profiles · profile versions retained</span></div><div className={styles.actorList}>{actors.map(item=><button className={styles.actorButton} data-selected={item.actorId===actorId} key={item.actorId} onClick={()=>{setActorId(item.actorId);setVibeKey(item.pairings?.[0]?.vibeKey??'')}}><strong>{item.canonicalName}</strong><small>{item.romanizedName ?? item.actorId} · v{item.profileVersion ?? '—'}</small></button>)}</div></aside>
       <main className={styles.detail}>{!actor?<div className={styles.empty}>No actor profiles returned.</div>:<><section className={`${styles.panel} ${styles.detailPanel}`}><div className={styles.detailHead}><div><p className={styles.eyebrow}>Selected profile</p><h4>{actor.canonicalName}</h4><p>{actor.romanizedName} · aliases: {text(actor.aliases)}</p></div><span className={styles.muted}>Profile v{actor.profileVersion ?? '—'}</span></div><div className={styles.pairingStrip}>{(actor.pairings??[]).map(item=><button className={styles.pairing} data-selected={item.vibeKey===vibeKey} key={item.vibeKey} onClick={()=>setVibeKey(item.vibeKey)}><strong>{text(item.labels) || item.vibeKey}</strong><span className={styles.state} data-state={item.auditState}>{item.auditState==='needs_reapproval' ? 'Needs reapproval' : item.auditState==='calibration_reaudit_required' ? 'Calibration reaudit required' : item.verdict ?? item.auditState ?? 'unreviewed'}</span><small>{item.queryCount ?? 0} queries · {date(item.lastRunAt)}</small></button>)}</div><div className={styles.controls}><button className={`${styles.buttonPrimary} ${currentRunIsLegacy?styles.freshAuditButton:''}`} disabled={!vibeKey||!!busy} onClick={()=>void startAudit(scope)}>{busy ? 'Running evidence pass…' : currentRunIsLegacy ? 'Run fresh audit' : 'Run audit'}</button><select className={styles.select} value={scope} onChange={e=>setScope(e.target.value)} aria-label="Audit scope"><option value="representative">Representative scope</option><option value="full">Full scope</option></select><span className={styles.status}>{pairing?.auditState==='blind_review_pending'?'Calibration pending':pairing?.auditState==='calibration_reaudit_required'?'Calibration reaudit required':pairing?.auditState==='needs_reapproval'?'Fresh audit required':pairing?.eligible===false?'Not eligible for scheduling':'Eligible for review'}</span></div></section>
        <section className={styles.panel}>
          <div className={styles.grid}>
            <InfoCard title="Identity profile" data={actor} keys={['commonCollisions','representativeWorks','knownContamination','productStockMeanings','trustedSourcePatterns','problematicSourcePatterns']} />
            <RunEvidence
              run={run}
              currentRun={currentRun}
              priorRuns={priorRuns}
              busy={busy}
              disagreementReasons={disagreementReasons}
              editorialNote={editorialNote}
              onChoice={saveBlindChoice}
              onReasonChange={setDisagreementReasons}
              onNoteChange={setEditorialNote}
              onSaveReasons={saveDisagreement}
              onFlag={saveCandidateFlag}
              onSaveRescue={saveRescueBoard}
              onExportRescue={exportRescueBoard}
              onMarkCalibration={markRescueCalibration}
              onSelect={selected=>{setRun(selected);if(selected.runId===currentRun?.runId){setDisagreementReasons(selected.blindReview?.reasonCodes??[]);setEditorialNote(selected.blindReview?.note??'')}}}
            />
          </div>
          {verdictAvailable ? <form className={styles.verdict} onSubmit={saveVerdict}>
            <label className={styles.label}>Scheduling verdict<select className={styles.select} value={verdictOptions.includes(verdict)?verdict:''} onChange={e=>setVerdict(e.target.value)} required><option value="">Choose a verdict</option>{verdictOptions.map(value=><option key={value} value={value}>{VERDICT_LABELS[value]}</option>)}</select></label>
            {verdict === 'approved' && <fieldset className={styles.approvalChecks}><legend>Human approval — both are required</legend><label><input type="checkbox" checked={vibeConfirmed} onChange={event=>setVibeConfirmed(event.target.checked)} /> Yes, that’s the Vibe.</label><label><input type="checkbox" checked={publishableConfirmed} onChange={event=>setPublishableConfirmed(event.target.checked)} /> Yes, this is publishable.</label><p>A score or comparative win cannot check these boxes.</p></fieldset>}
            <label className={styles.label}>Operator notes<textarea className={`${styles.input} ${styles.textarea}`} value={notes} maxLength={2000} onChange={e=>setNotes(e.target.value)} placeholder="What should the next operator know?" /></label>
            <button className={styles.buttonPrimary} disabled={busy==='verdict'||!verdictOptions.includes(verdict)||(verdict==='approved'&&(!vibeConfirmed||!publishableConfirmed))}>Save scheduling verdict</button>
          </form> : selectedIsCurrent && requiresFreshAudit ? <p className={styles.historicalNotice}>{pairing?.auditState==='calibration_reaudit_required'?'A confirmed rescue calibration now exists. Run a fresh audit and reproduce a positive signal on evidence beyond the exact saved nine before approval.':'This retained run is invalid under the current profile contract. Run a fresh audit before recording a scheduling verdict.'}</p> : selectedIsCurrent && review?.status === 'pending' ? <p className={styles.historicalNotice}>Make the blind board choice before scheduling this pairing.</p> : selectedIsCurrent && disagreementNeedsReasons ? <p className={styles.historicalNotice}>Capture why you disagreed before scheduling this pairing.</p> : run && !selectedIsCurrent ? <p className={styles.historicalNotice}>This is a frozen historical review. Return to the current run to revise scheduling eligibility.</p> : null}
        </section></>}</main>
    </div>
  </section>;
};

function InfoCard({title,data,keys}:{title:string;data:AnyRecord;keys:string[]}) { return <article className={`${styles.card} ${styles.cardWide}`}><h5>{title}</h5><div className={styles.grid}>{keys.map(key=><div key={key}><p className={styles.muted}>{key.replace(/[A-Z]/g,m=>` ${m}`).toUpperCase()}</p><div className={styles.chips}>{(Array.isArray(data[key])?data[key]:[data[key]]).filter(Boolean).map((item:any,index:number)=><span className={styles.chip} key={index}>{text(item)}</span>)}</div></div>)}</div></article>; }
function RunEvidence({
  run,currentRun,priorRuns,busy,disagreementReasons,editorialNote,onChoice,onReasonChange,onNoteChange,onSaveReasons,onFlag,onSaveRescue,onExportRescue,onMarkCalibration,onSelect,
}:{
  run:Run|null;currentRun:Run|null;priorRuns:Run[];busy:string;disagreementReasons:string[];editorialNote:string;
  onChoice:(choice:'event'|'compiled'|'neither')=>void;onReasonChange:(reasons:string[])=>void;onNoteChange:(note:string)=>void;
  onSaveReasons:(event:React.FormEvent)=>void;onFlag:(candidateId:string,flagged:boolean,intent?:string,reasons?:string[])=>void;onSaveRescue:(candidateIds:string[])=>void;onExportRescue:(receiptId:string)=>void;onMarkCalibration:(receiptId:string)=>void;onSelect:(run:Run)=>void;
}) {
  const review = run?.blindReview;
  const isLegacy = Boolean(run?.auditContract?.isLegacy);
  const revealed = Boolean(review?.choice);
  const evidenceAvailable = isLegacy || revealed || review?.status === 'unavailable';
  const isCurrent = Boolean(run?.runId && run.runId === currentRun?.runId);
  const rawResults = Array.isArray(run?.rawResults) ? run.rawResults : [];
  const sections: Array<[string, unknown]>=[['Query ladder',run?.queryRuns],['Bounded raw results',run?.rawResults],['Rejection ledger',run?.rejections],['Identity evidence',run?.identityEvidence],['Detected event families',run?.detectedEvents],['Strongest Event board',run?.strongestEvent],['Strongest Compiled board',run?.strongestCompiled],['Winner',run?.winner],['Alternate',run?.alternate],['Operator-derived curation signals',run?.curationReceipt?.calibrationSignals],['Calibration transfer proof',run?.calibrationProof],['Curation receipt',run?.curationReceipt],['Blind calibration receipt',run?.blindReview],['Scheduling verdict',run?.operatorVerdict]];
  const boards = review?.boards ?? [];
  const disagreed = revealed && review?.agreement !== true;
  return <article id="actor-audit-evidence" className={`${styles.card} ${styles.cardWide} ${isLegacy?styles.legacyCard:''}`}>
    <h5>{isLegacy?'Legacy audit · retained history':'Audit evidence'} {run?.runId?`· ${run.runId}`:''}</h5>
    {run ? <>
      {isLegacy&&<section className={styles.legacyAudit} role="status"><div className={styles.legacyAuditHeader}><span className={styles.legacyBadge}>Legacy audit</span><strong>Retained history — invalid under the current profile contract</strong></div><p>This board is preserved as historical evidence only. It cannot establish Daily Drop eligibility. Run a fresh audit to evaluate the current identity, cluster, promise, and curation versions.</p>{run.auditContract?.legacyReasons?.length?<small>Contract changes: {run.auditContract.legacyReasons.map(reason=>reason.replaceAll('_',' ')).join(' · ')}</small>:null}</section>}
      <p className={styles.muted}>{run.scope} scope · started {date(run.startedAt)} · completed {date(run.completedAt)} · identity v{run.identityProfileVersion ?? '—'} · cluster v{run.aestheticClusterVersion ?? '—'} · promise v{run.promiseContractVersion ?? '—'} · curation v{run.curationVersion ?? run.curationReceipt?.curationVersion ?? run.curationReceipt?.version ?? '—'}</p>
      {review?.status === 'unavailable' ? <section className={styles.boardUnavailable}><strong>Blind comparison unavailable</strong><p>This run did not produce two complete nine-card boards. It cannot be approved; use the retained evidence to choose a rejection or query-work verdict.</p><BoardQualificationSummary run={run} /><PartialBoards run={run} /></section> : <section className={`${styles.boardReview} ${isLegacy?styles.legacyBoardReview:''}`} aria-label={isLegacy?'Historical visual board comparison':'Visual board comparison'}>
        <div className={styles.boardReviewHeader}>
          <div><h6>{revealed ? 'Independent choice recorded' : 'Blind board review'}</h6><p>{revealed ? `You chose ${review?.choice === 'neither' ? 'Neither' : review?.choice}. This result is frozen for this audit run.` : 'Both boards are equal-sized. Their left/right order is fixed for this run.'}</p></div>
          {revealed && <div className={styles.revealBadges}><span className={styles.winnerBadge}>System winner: {review?.systemWinner}</span><span className={review?.agreement ? styles.agreeBadge : styles.disagreeBadge}>{review?.agreement ? 'You agreed' : 'You disagreed'}</span></div>}
        </div>
        <div className={styles.boardComparison}>{boards.map(item=><BoardPreview key={item.mode} label={item.label} board={revealed ? run[item.mode === 'event' ? 'strongestEvent' : 'strongestCompiled'] : item.board} isWinner={revealed && review?.systemWinner===item.mode} revealed={revealed} />)}</div>
        {!revealed && isCurrent && !isLegacy && <div className={styles.blindChoice}>
          <p>Which board is the more compelling way to see this star in this Vibe Pack?</p>
          <div className={styles.choiceButtons}><button type="button" className={styles.buttonPrimary} disabled={busy==='blind-choice'} onClick={()=>onChoice('event')}>Choose Event</button><button type="button" className={styles.buttonPrimary} disabled={busy==='blind-choice'} onClick={()=>onChoice('compiled')}>Choose Compiled</button><button type="button" className={styles.button} disabled={busy==='blind-choice'} onClick={()=>onChoice('neither')}>Choose Neither</button></div>
          <small>Your first choice is permanent. Scores and the system winner are withheld until you choose.</small>
        </div>}
        {!revealed && (!isCurrent||isLegacy) && <p className={styles.historicalNotice}>{isLegacy?'This Legacy audit remains blinded history. Run a fresh audit for a current board choice.':'This historical run was never independently judged and remains blinded.'}</p>}
        {revealed && <><RevealSummary run={run} /><RunnerUpBoards run={run} /></>}
        {disagreed && isCurrent && !isLegacy && !run.operatorVerdict && <form className={styles.disagreement} onSubmit={onSaveReasons}>
          <div><strong>Why did you disagree?</strong><p>Choose every editorial instinct that mattered. “Neither” is a real result and still needs a reason.</p></div>
          <div className={styles.reasonGrid}>{DISAGREEMENT_REASONS.map(([value,label])=><label className={styles.reason} key={value}><input type="checkbox" checked={disagreementReasons.includes(value)} onChange={event=>onReasonChange(event.target.checked?[...disagreementReasons,value]:disagreementReasons.filter(item=>item!==value))}/><span>{label}</span></label>)}</div>
          {disagreementReasons.includes('other_editorial_instinct') && <label className={styles.label}>Other editorial instinct<textarea className={`${styles.input} ${styles.textarea}`} value={editorialNote} maxLength={1000} onChange={event=>onNoteChange(event.target.value)} required placeholder="Name the instinct the checklist missed." /></label>}
          <button className={styles.buttonPrimary} disabled={busy==='reasons'||!disagreementReasons.length||(disagreementReasons.includes('other_editorial_instinct')&&!editorialNote.trim())}>Save calibration reasons</button>
        </form>}
        {disagreed && isCurrent && run.operatorVerdict && <p className={styles.historicalNotice}>The scheduling receipt is finalized, so its calibration reasons stay frozen. Image-level pins and exclusions below remain editable as separate review receipts.</p>}
      </section>}
      {evidenceAvailable && <><div className={styles.evidenceSummary}><strong>{run.displayCount ?? 0}</strong><span>clean display images</span><strong>{run.queryCount ?? run.queryRuns?.length ?? 0}</strong><span>queries audited</span><strong>{rawResults.length}</strong><span>retained results</span></div><RequestedGridReview run={run} isCurrent={isCurrent} busy={busy} onSave={onSaveRescue} onExport={onExportRescue} onMarkCalibration={onMarkCalibration}/><div className={styles.evidence}>{sections.map(([label,value])=><details key={label}><summary>{label} <span className={styles.muted}>{Array.isArray(value)?`${value.length} records`:''}</span></summary>{label === 'Bounded raw results' && rawResults.length > 0 ? <RawResultGrid run={run} isCurrent={isCurrent} busy={busy} onFlag={onFlag}/> : <pre>{text(value)}</pre>}</details>)}</div></>}
    </> : <p className={styles.empty}>Run an audit to open a blinded Event versus Compiled comparison.</p>}
    {currentRun&&<label className={styles.label}>Audit run<select className={styles.select} value={run?.runId ?? ''} onChange={e=>{const selected=[currentRun,...priorRuns].find(item=>item.runId===e.target.value);if(selected)onSelect(selected)}}><option value={currentRun.runId}>{currentRun.auditContract?.isLegacy?'Legacy history':'Current'} · {currentRun.runId} · {date(currentRun.completedAt)}</option>{priorRuns.map(item=><option key={item.runId} value={item.runId}>{item.auditContract?.isLegacy?'Legacy history':'Retained'} · {item.runId} · {date(item.completedAt)}</option>)}</select></label>}
  </article>;
}

function RawResultGrid({run,isCurrent,busy,onFlag}:{run:Run;isCurrent:boolean;busy:string;onFlag:(candidateId:string,flagged:boolean,intent?:string,reasons?:string[])=>void}) {
  const rawResults = Array.isArray(run.rawResults) ? run.rawResults : [];
  const [challengeByCandidate,setChallengeByCandidate]=useState<Record<string,string>>({});
  const selectedIds = new Set([
    ...(run.strongestEvent?.candidates ?? []),
    ...(run.strongestCompiled?.candidates ?? []),
  ].map((item:any)=>item.candidateId).filter(Boolean));
  const flags = run.editorialFeedback?.flags ?? [];
  return <div className={styles.resultGrid}>{rawResults.map((item:any,index:number)=>{
    const rejection=(run.rejections??[]).find((entry:any)=>entry.kind==='image'&&(entry.candidateId===item.candidateId||(!entry.candidateId&&entry.thumbnail===item.thumbnail&&entry.title===item.title)));
    const legacyDuplicateGuess=rejection?.reason==='legacy_duplicate_unverified';
    const flag=flags.find((entry:any)=>entry.candidateId===item.candidateId);
    const state=rejection&&!legacyDuplicateGuess?'rejected':selectedIds.has(item.candidateId)?'selected':'not_selected';
    const stateLabel=legacyDuplicateGuess?'Retained · old duplicate guess discarded':state==='rejected'?`Rejected · ${String(rejection?.reason??'curation gate').replaceAll('_',' ')}`:state==='selected'?'Selected for a candidate board':'Retained · not selected';
    return <article className={styles.result} data-state={state} data-flagged={Boolean(flag)} key={item.candidateId||`${item.link||item.thumbnail||item.title||'result'}-${index}`}>
      <button type="button" className={styles.resultVisual} disabled={!isCurrent||busy===`flag:${item.candidateId}`||!item.candidateId} onClick={()=>onFlag(item.candidateId,flag?.intent!=='pin','pin')} aria-label={`${flag?.intent==='pin'?'Remove pin from':'Pin'} ${item.title||'this image'} for board`}>{item.thumbnail?<img src={item.thumbnail} alt="" loading="lazy"/>:<span className={styles.resultPlaceholder}>No thumbnail</span>}<span>{flag?.intent==='pin'?'Pinned for rescue review':'Pin this image'}</span></button>
      <a className={styles.resultSourceLink} href={item.link||item.thumbnail||'#'} target="_blank" rel="noreferrer">{item.title||'Untitled result'} · {item.source||'Unknown source'} · Open source ↗</a>
      <span className={styles.resultState} data-state={state}>{stateLabel}</span>
      {rejection?.dropDetail&&<small className={styles.resultReason}>{rejection.dropDetail}</small>}
      {flag&&<small className={flag.disposition==='blocked'?styles.flagBlocked:styles.flagHonored}>{flag.disposition==='excluded'?'Excluded from rescue board':flag.disposition==='blocked'?`${flag.intent==='challenge'?'Challenge saved':'Preference saved'} · blocked by ${String(flag.blockedReason).replaceAll('_',' ')}; find a usable equivalent`:`${String(flag.intent||'pin').replaceAll('_',' ')} saved · eligible for provisional review`}<br/>{flag.reasons?.length?`${flag.reasons.map((reason:string)=>reason.replaceAll('_',' ')).join(' · ')} · `:''}{date(flag.createdAt)} · {flag.createdBy}</small>}
      <div className={styles.intentButtons} aria-label="Image-level editorial flags">
        {([['pin','Pin for board'],['hero','Hero candidate'],['supporting','Good supporting card'],['exclude','Exclude']] as Array<[string,string]>).map(([intent,label])=><button type="button" key={intent} className={flag?.intent===intent?styles.flagButtonActive:styles.flagButton} disabled={!isCurrent||busy===`flag:${item.candidateId}`||!item.candidateId} onClick={()=>onFlag(item.candidateId,flag?.intent!==intent,intent)}>{label}</button>)}
      </div>
      {rejection&&!legacyDuplicateGuess&&<details className={styles.challengeControls}><summary>Optional: dispute the system’s rejection label</summary><select className={styles.challengeSelect} value={challengeByCandidate[item.candidateId]??flag?.reasons?.[0]??''} onChange={event=>setChallengeByCandidate(current=>({...current,[item.candidateId]:event.target.value}))} aria-label="Why is the rejection classification wrong?"><option value="">What did the rejection get wrong?</option>{CHALLENGE_REASONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><button type="button" className={flag?.intent==='challenge'?styles.flagButtonActive:styles.flagButton} disabled={!isCurrent||busy===`flag:${item.candidateId}`||!item.candidateId||!(challengeByCandidate[item.candidateId]??flag?.reasons?.[0])} onClick={()=>{const reason=challengeByCandidate[item.candidateId]??flag?.reasons?.[0];onFlag(item.candidateId,flag?.intent!=='challenge','challenge',reason?[reason]:[])}}>{flag?.intent==='challenge'?'Remove classification dispute':'Save classification dispute'}</button></details>}
    </article>;
  })}</div>;
}

function RequestedGridReview({run,isCurrent,busy,onSave,onExport,onMarkCalibration}:{run:Run;isCurrent:boolean;busy:string;onSave:(candidateIds:string[])=>void;onExport:(receiptId:string)=>void;onMarkCalibration:(receiptId:string)=>void}) {
  const feedback=run.editorialFeedback;
  const flags=feedback?.flags??EMPTY_RECORDS;
  const review=feedback?.requestedReview;
  const saved=feedback?.operatorRescueBoard;
  const savedReceipts=useMemo<AnyRecord[]>(()=>{
    const receipts=Array.isArray(feedback?.operatorRescueBoards)?feedback.operatorRescueBoards:[];
    return saved&&!receipts.some((receipt:any)=>receipt.receiptId===saved.receiptId)?[saved,...receipts]:receipts;
  },[feedback?.operatorRescueBoards,saved]);
  const savedMatchesCurrentFeedback=Boolean(saved?.feedbackHash&&feedback?.feedbackHash&&saved.feedbackHash===feedback.feedbackHash);
  const rawResults=(run.rawResults??EMPTY_RECORDS) as AnyRecord[];
  const excludedIds=useMemo(()=>new Set(flags.filter((item:any)=>item.disposition==='excluded').map((item:any)=>item.candidateId)),[flags]);
  const unavailableIds=useMemo(()=>{
    const unavailable=new Set<string>();
    for(const item of rawResults)if(!item.thumbnail)unavailable.add(item.candidateId);
    for(const item of run.curationReceipt?.rawCandidates??[])if(item.dropReason==='image_load_failed')unavailable.add(item.candidateId);
    for(const item of run.rejections??[])if(item.kind==='image'&&item.reason==='image_load_failed')unavailable.add(item.candidateId);
    return unavailable;
  },[rawResults,run.curationReceipt?.rawCandidates,run.rejections]);
  const candidatePool=useMemo<AnyRecord[]>(()=>{
    const analyzedById=new Map<string,AnyRecord>((run.curationReceipt?.rawCandidates??EMPTY_RECORDS).map((item:AnyRecord)=>[item.candidateId,item]));
    return rawResults
      .filter(item=>item.candidateId&&item.thumbnail&&!excludedIds.has(item.candidateId)&&!unavailableIds.has(item.candidateId))
      .map(item=>{const analyzed=analyzedById.get(item.candidateId);return {...item,...(analyzed??{}),link:analyzed?.link||item.link,thumbnail:item.thumbnail};});
  },[rawResults,run.curationReceipt?.rawCandidates,excludedIds,unavailableIds]);
  const poolIds=useMemo(()=>new Set(candidatePool.map(item=>item.candidateId)),[candidatePool]);
  const reviewCandidates=review?.board?.candidates;
  const initialCandidates=useMemo<AnyRecord[]>(()=>((review
    ? reviewCandidates
    : [])??[]).filter((item:any)=>poolIds.has(item.candidateId)).slice(0,9) as AnyRecord[],[
    review,
    reviewCandidates,
    poolIds,
  ]);
  const [candidates,setCandidates]=useState<AnyRecord[]>(initialCandidates);
  const draftContextKey=`${run.runId??''}:${feedback?.feedbackHash??''}`;
  const [draftContext,setDraftContext]=useState(draftContextKey);
  const [viewedReceiptId,setViewedReceiptId]=useState<string|null>(null);
  const viewedReceipt=savedReceipts.find(receipt=>receipt.receiptId===viewedReceiptId)||null;
  useEffect(()=>{
    if(draftContext===draftContextKey)return;
    setCandidates(initialCandidates);
    setDraftContext(draftContextKey);
  },[draftContext,draftContextKey,initialCandidates]);
  useEffect(()=>{
    setViewedReceiptId(saved?.receiptId??null);
  },[saved?.receiptId]);
  const blockedCount=unavailableIds.size;
  const excludedCount=excludedIds.size;
  const move=(index:number,direction:-1|1)=>setCandidates(current=>{const target=index+direction;if(target<0||target>=current.length)return current;const next=[...current];[next[index],next[target]]=[next[target],next[index]];return next;});
  const setHero=(index:number)=>setCandidates(current=>{if(current.length<5||index===4)return current;const next=[...current];[next[index],next[4]]=[next[4],next[index]];return next;});
  const toggleCandidate=(item:AnyRecord)=>setCandidates(current=>current.some(candidate=>candidate.candidateId===item.candidateId)?current.filter(candidate=>candidate.candidateId!==item.candidateId):current.length<9?[...current,item]:current);
  return <section className={styles.requestedReview}>
    <div className={styles.requestedReviewHeader}><div><h6>Operator rescue board</h6><p>This is your override. Choose any nine retained, displayable images and arrange them yourself. Composite, duplicate, anti-anchor, and Vibe labels remain visible as algorithm evidence, but they do not veto the rescue. Only unavailable images and your exclusions stay out. The original audit and Daily Drop eligibility never change.</p></div><span>{candidates.length}/9 chosen · {candidatePool.length} available · {blockedCount} unavailable · {excludedCount} excluded</span></div>
    {saved&&!savedMatchesCurrentFeedback&&<p className={styles.historicalNotice}>{review?'Your previous saved arrangement is retained as history. This board was rebuilt from the current image choices.':'Your previous saved arrangement is retained as history. Pin an image to start a new editable rescue board.'}</p>}
    {savedReceipts.length>0&&<section className={styles.rescueHistory} aria-label="Saved rescue board history">
      <div><h6>Saved rescue records</h6><p>Each record is immutable and records-only by default. Explicitly confirm a board as calibration evidence to teach future audits; the historical audit and receipt never change.</p></div>
      <ol className={styles.rescueHistoryList}>{savedReceipts.map((receipt:any,index:number)=>{
        const matchesCurrentFeedback=receipt.feedbackHash===feedback?.feedbackHash;
        return <li className={receipt.receiptId===viewedReceiptId?styles.rescueHistoryItemSelected:styles.rescueHistoryItem} key={receipt.receiptId}>
          <button type="button" className={styles.rescueHistorySelect} onClick={()=>setViewedReceiptId(receipt.receiptId)} aria-pressed={receipt.receiptId===viewedReceiptId}>
            <strong>{index===0?'Latest saved board':'Saved board'}</strong>
            <span>{date(receipt.savedAt)} · 9 cards · {String(receipt.receiptId).slice(0,8)}</span>
            <small>{receipt.savedBy||'Operator'} · hero position 5 · {receipt.calibrationEvidence?'calibration confirmed':matchesCurrentFeedback?'current feedback':'earlier feedback · view only'}</small>
          </button>
          <div className={styles.rescueRecordActions}><button type="button" className={styles.buttonSecondary} disabled={!isCurrent||Boolean(busy)||!matchesCurrentFeedback} onClick={()=>onExport(receipt.receiptId)}>Export this board</button><button type="button" className={styles.buttonSecondary} disabled={Boolean(busy)||Boolean(run.auditContract?.isLegacy)||Boolean(receipt.calibrationEvidence)} onClick={()=>onMarkCalibration(receipt.receiptId)}>{receipt.calibrationEvidence?'Calibration evidence confirmed':run.auditContract?.isLegacy?'Legacy evidence · records only':busy===`calibration:${receipt.receiptId}`?'Confirming calibration…':'Use as calibration evidence'}</button></div>
        </li>;
      })}</ol>
      {viewedReceipt&&<div className={styles.rescueHistoryPreview}><div className={styles.rescuePickerHeader}><strong>Viewing saved arrangement</strong><span>{date(viewedReceipt.savedAt)} · read-only record</span></div><p>This board is not the editable draft. Use it as a starting point to create a new append-only receipt. Calibration, when explicitly confirmed, affects only future audits.</p><div className={styles.rescueGrid}>{(viewedReceipt.board?.candidates??[]).map((item:any,index:number)=><article className={styles.rescueTile} data-hero={index===4} key={`${viewedReceipt.receiptId}-${item.candidateId||index}`}><a href={item.link||item.thumbnail||'#'} target="_blank" rel="noreferrer">{item.thumbnail?<img src={item.thumbnail} alt={item.title||`Saved rescue card ${index+1}`}/>:<span className={styles.resultPlaceholder}>No thumbnail</span>}<span>{index===4?'Hero · ':''}{item.title||`Card ${index+1}`}</span></a></article>)}</div><div className={styles.rescueActions}><button type="button" className={styles.buttonSecondary} disabled={!isCurrent||Boolean(busy)} onClick={()=>{setCandidates((viewedReceipt.board?.candidates??[]).filter((item:any)=>poolIds.has(item.candidateId)).slice(0,9));setViewedReceiptId(null);}}>Use as starting point</button><button type="button" className={styles.buttonSecondary} disabled={!isCurrent||Boolean(busy)||viewedReceipt.feedbackHash!==feedback?.feedbackHash} onClick={()=>onExport(viewedReceipt.receiptId)}>Export this board to Collection</button><button type="button" className={styles.buttonSecondary} disabled={Boolean(busy)||Boolean(run.auditContract?.isLegacy)||Boolean(viewedReceipt.calibrationEvidence)} onClick={()=>onMarkCalibration(viewedReceipt.receiptId)}>{viewedReceipt.calibrationEvidence?'Calibration evidence confirmed':run.auditContract?.isLegacy?'Legacy evidence · records only':'Use as calibration evidence'}</button></div>{viewedReceipt.calibrationEvidence&&<p className={styles.requestedSummary}>Confirmed {date(viewedReceipt.calibrationEvidence.confirmedAt)}. Future runs may use its query, source, visual-cluster, hero, ranking, and anti-anchor signals. Approval stays blocked until a fresh run transfers a positive signal beyond these exact nine.</p>}</div>}
    </section>}
    <div className={styles.rescuePickerHeader}><strong>Choose your nine</strong><span>Click an image to {candidates.length===9?'remove it before choosing another':'add or remove it'}.</span></div>
    <div className={styles.rescuePicker}>{candidatePool.map(item=>{const selectedIndex=candidates.findIndex(candidate=>candidate.candidateId===item.candidateId);const selected=selectedIndex>=0;return <button type="button" className={selected?styles.rescuePickSelected:styles.rescuePick} aria-pressed={selected} disabled={!selected&&candidates.length>=9} onClick={()=>toggleCandidate(item)} key={item.candidateId}><img src={item.thumbnail} alt={item.title||'Retained rescue candidate'}/><span>{selected?`Chosen ${selectedIndex+1}`:'Add'}</span></button>;})}</div>
    {candidates.length>0?<div className={styles.rescueGrid}>{candidates.map((item,index)=><article className={styles.rescueTile} data-hero={index===4} key={item.candidateId}><a href={item.link||item.thumbnail||'#'} target="_blank" rel="noreferrer">{item.thumbnail?<img src={item.thumbnail} alt={item.title||`Rescue card ${index+1}`}/>:<span className={styles.resultPlaceholder}>No thumbnail</span>}<span>{index===4?'Hero · ':''}{item.title||`Card ${index+1}`}</span></a><div><button type="button" disabled={index===0} onClick={()=>move(index,-1)} aria-label={`Move card ${index+1} earlier`}>←</button><button type="button" disabled={candidates.length<5||index===4} onClick={()=>setHero(index)} aria-label={`Make card ${index+1} the hero`}>Hero</button><button type="button" disabled={index===candidates.length-1} onClick={()=>move(index,1)} aria-label={`Move card ${index+1} later`}>→</button></div></article>)}</div>:<p className={styles.boardEmpty}>Choose the first image for this rescue board.</p>}
    <div className={styles.rescueActions}><button type="button" className={styles.buttonPrimary} disabled={!isCurrent||busy==='rescue-board'||candidates.length!==9} onClick={()=>onSave(candidates.map(item=>item.candidateId))}>{busy==='rescue-board'?'Saving rescue board…':candidates.length===9?'Save my nine':'Choose nine to save'}</button><button type="button" className={styles.buttonSecondary} disabled={!candidates.length} onClick={()=>setCandidates([])}>Clear board</button>{savedMatchesCurrentFeedback&&saved&&<><button type="button" className={styles.buttonSecondary} disabled={!isCurrent||Boolean(busy)} onClick={()=>onExport(saved.receiptId)}>{busy==='export-rescue-board'?'Exporting to Collection…':'Export saved board to Collection'}</button><span>Last saved {date(saved.savedAt)} by {saved.savedBy}</span></>}</div>
    {review?.board&&<p className={styles.requestedSummary}>The suggested starting arrangement is editable. Your saved nine are the operator override.</p>}
    {blockedCount>0&&<div className={styles.blockedFlags}>{[...unavailableIds].map(candidateId=>{const item=rawResults.find(candidate=>candidate.candidateId===candidateId);return <span key={candidateId}><strong>{item?.title||candidateId}</strong> is unavailable because the audit could not load a usable image from its retained URL.</span>;})}</div>}
  </section>;
}

function PartialBoards({run}:{run:Run}) {
  const boards = [
    run.strongestEvent ? { label: 'Event candidate', board: run.strongestEvent } : null,
    run.strongestCompiled ? { label: 'Compiled candidate', board: run.strongestCompiled } : null,
  ].filter(Boolean) as Array<{label:string;board:AnyRecord}>;
  if (!boards.length) return <p className={styles.boardEmpty}>No candidate board reached nine images.</p>;
  return <div className={styles.partialBoards}><h6>Available candidate board{boards.length > 1 ? 's' : ''}</h6><p>These images survived curation, but the missing counterpart means this run is not eligible for blind calibration.</p><div className={styles.boardComparison}>{boards.map(item=><BoardPreview key={item.label} label={item.label} board={item.board} isWinner={false} revealed={false} />)}</div></div>;
}

function BoardQualificationSummary({run}:{run:Run}) {
  const diagnostics = run.boardDiagnostics || {};
  const modes: Array<['event'|'compiled', string]> = [['event', 'Event'], ['compiled', 'Compiled']];
  return <div className={styles.boardQualification} aria-label="Board qualification diagnostics">{modes.map(([mode, label]) => {
    const diagnostic = diagnostics[mode];
    const available = diagnostic?.available ?? Boolean(run[mode === 'event' ? 'strongestEvent' : 'strongestCompiled']);
    return <div className={styles.boardQualificationRow} key={mode}><strong>{available ? `${label} board available` : `${label} board missing`}</strong><span>{available ? `${diagnostic?.candidateCount ?? 9} usable frames qualified.` : diagnostic?.summary || `No complete ${label} board qualified.`}</span></div>;
  })}</div>;
}

function RevealSummary({run}:{run:Run}) {
  const winnerMode = run.blindReview?.systemWinner;
  const decisive = run.curationReceipt;
  return <div className={styles.revealSummary}>
    <div><span className={styles.muted}>Decisive evidence</span><strong>{decisive?.rationale || 'The frozen score components determined the system winner.'}</strong><p>{text(decisive?.signals)}</p></div>
    <div><span className={styles.muted}>Experiment snapshot</span><strong>{run.blindReview?.experiment?.eventBoard?.boardId} · {run.blindReview?.experiment?.compiledBoard?.boardId}</strong><p>Curation v{run.blindReview?.experiment?.curationVersion ?? '—'} · frozen winner {winnerMode}</p></div>
  </div>;
}

function RunnerUpBoards({run}:{run:Run}) {
  const boards = [
    ...(Array.isArray(run.eventAlternatives) ? run.eventAlternatives.map((board:AnyRecord,index:number)=>({label:`Event runner-up ${index + 1}`,board})) : []),
    ...(Array.isArray(run.compiledAlternatives) ? run.compiledAlternatives.map((board:AnyRecord,index:number)=>({label:`Compiled runner-up ${index + 1}`,board})) : []),
  ];
  if (!boards.length) return null;
  return <section className={styles.runnerUps}><div><h6>Runner-up boards</h6><p>Revealed only after the independent choice. Use these to diagnose selection failures, not to rewrite the frozen calibration.</p></div><div className={styles.boardComparison}>{boards.map(item=><BoardPreview key={item.label} label={item.label} board={item.board} isWinner={false} revealed />)}</div></section>;
}

function BoardPreview({label,board,isWinner,revealed}:{label:string;board?:AnyRecord|null;isWinner:boolean;revealed:boolean}) {
  const candidates = Array.isArray(board?.candidates) ? board.candidates : [];
  return <article className={`${styles.board} ${isWinner ? styles.boardWinner : ''}`}><div className={styles.boardHeader}><div><strong>{label}</strong>{isWinner && <span className={styles.boardTag}>System winner</span>}</div><small>{revealed && typeof board?.score === 'number' ? `score ${board.score.toFixed(2)}` : candidates.length >= 9 ? '9-card board' : 'No complete board'}</small></div>{candidates.length > 0 ? <div className={styles.boardGrid}>{candidates.map((item:any,index:number)=><a className={styles.boardTile} href={item.link || item.thumbnail || '#'} target="_blank" rel="noreferrer" key={`${item.link || item.thumbnail || item.title || 'board-image'}-${index}`}>{item.thumbnail ? <img src={item.thumbnail} alt={item.title || `${label} image ${index + 1}`} loading="lazy" /> : <span className={styles.resultPlaceholder}>No thumbnail</span>}<span>{item.title || `Frame ${index + 1}`}</span></a>)}</div> : <p className={styles.boardEmpty}>No complete 9-image board survived this audit.</p>}{revealed && board?.promise && <p className={styles.promiseReceipt}>{board.promise.coreCount ?? 0}/9 core anchors · hero {board.promise.heroFulfillment === 1 ? 'fulfilled' : 'failed'} · single-frame {Math.round(Number(board.promise.singleFrameRatio ?? 0) * 100)}%</p>}{revealed && board?.scoreBreakdown && <div className={styles.scoreBreakdown}>{Object.entries(board.scoreBreakdown).map(([key,value]:[string,any])=><div key={key}><span>{key.replace(/[A-Z]/g,letter=>` ${letter}`).toLowerCase()}</span><strong>{Number(value.contribution ?? 0).toFixed(3)}</strong><small>{Number(value.value ?? 0).toFixed(2)} × {Number(value.weight ?? 0).toFixed(2)}</small></div>)}</div>}</article>;
}

function collectionGridFromRescueExport(rescue: RescueExport): GridRecord {
  if (rescue.candidates.length !== 9 || rescue.candidates.some(candidate => !candidate.candidateId || !candidate.thumbnail)) {
    throw new Error('The saved rescue arrangement is missing complete image provenance.');
  }
  return {
    kind: 'grid',
    schemaVersion: 1,
    rendererVersion: 'vibe-atlas-v1',
    id: rescue.gridId,
    actorId: rescue.actor.id,
    actor: rescue.actor.name,
    actorEn: rescue.actor.nameEn,
    actorAccentColor: rescue.actor.accentColor,
    vibe: rescue.vibe.label,
    vibeEn: rescue.vibe.labelEn,
    vibeEmoji: rescue.vibe.emoji,
    vibeSubtitle: rescue.vibe.subtitle,
    vibeSubtitleEn: rescue.vibe.subtitleEn,
    searchSpell: rescue.vibe.searchSpell,
    generationPrompt: `Operator Rescue Board ${rescue.receiptId} · exact saved arrangement from audit ${rescue.runId}.`,
    edition: {
      provider: 'actor-preflight-rescue',
      misprint: false,
      legendary: false,
    },
    capturedDate: rescue.arrangedAt.slice(0, 10),
    generatedAt: rescue.arrangedAt,
    savedAt: rescue.exportedAt,
    sourceRoute: '/admin#actor-preflight',
    intent: 'standard',
    editorial: {
      mode: 'compiled',
      compositionSize: 9,
      arrangement: 'creator-arranged',
    },
    images: rescue.candidates.map((candidate, gridPosition) => ({
      resultId: candidate.candidateId,
      imageUrl: proxiedImageUrl(candidate.thumbnail || ''),
      sourceUrl: candidate.link || candidate.thumbnail || '#',
      title: candidate.title || `${rescue.actor.name} · ${rescue.vibe.label}`,
      ...(candidate.source ? { publisher: candidate.source } : {}),
      ...(candidate.query ? { batchKey: candidate.query } : {}),
      gridPosition,
    })),
  };
}
