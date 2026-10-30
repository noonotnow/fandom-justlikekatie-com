import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useSession } from '../../hooks/useSession';
import { requestMagicLink } from '../../utils/publicAccount';
import { PUBLIC_ORIGIN, PUBLIC_ROUTE_PATHS } from '../../../shared/public-routes.js';
import {
  DRAFT_KEY, emptyDraft, frameFor, loadCardImage, readLocalImage, renderCdramaCard,
  restoreDraft, suggestedCopy, type ForgeDraft, type Joke, type PostCopy, type Still,
} from '../../utils/cdramaForge';
import styles from './CdramaForge.module.css';
import { CandidateImage, SceneEvidence, SceneMatch, type SceneClue, type SceneResult } from './SceneEvidence';

type Research = { title: string; link: string; snippet: string; episodeStart?: number; episodeEnd?: number };
type Result = SceneResult & {
  title: string; thumbnail: string; link: string; source: string;
  evidence?: 'unverified'; episodeStart?: number; episodeEnd?: number; research?: Research[]; warning?: string;
};
const safeSource = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.href : '';
  } catch { return ''; }
};

export function CdramaForge() {
  const [draft, setDraft] = useState<ForgeDraft>(() => {
    try { return restoreDraft(window.localStorage); }
    catch { return emptyDraft(); }
  });
  const [saveStatus, setSaveStatus] = useState('Local draft ready');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [email, setEmail] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [recapResearch, setRecapResearch] = useState<Research[]>([]);
  const [query, setQuery] = useState(() => draft.moment || '');
  const [searchMode, setSearchMode] = useState<'scenes' | 'stills' | 'recaps'>('scenes');
  const [dramaTitle, setDramaTitle] = useState('');
  const [sceneClues, setSceneClues] = useState<SceneClue[]>([]);
  const [sceneQueries, setSceneQueries] = useState<string[]>([]);
  const [hasSceneSearch, setHasSceneSearch] = useState(false);
  const [alternatives, setAlternatives] = useState<Joke[]>([]);
  const [manualCaption, setManualCaption] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const requestId = useRef(0);
  const searchId = useRef(0);
  const searchController = useRef<AbortController | null>(null);
  const imageId = useRef(0);
  const skipEmptySave = useRef(false);
  const { isSignedIn, loading: sessionLoading, recheck } = useSession();
  const idea = draft.ideas[draft.selected] as Joke | undefined;
  const postCopy = idea ? draft.copy ?? suggestedCopy(idea) : null;

  useEffect(() => {
    document.title = 'C-drama MemeForge | Fandom Vibes';
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?? document.head.appendChild(document.createElement('link'));
    canonical.rel = 'canonical';
    canonical.href = `${PUBLIC_ORIGIN}${PUBLIC_ROUTE_PATHS.cdramaMemeForge}`;
    document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(link => link.remove());
    return () => { requestId.current++; searchId.current++; imageId.current++; searchController.current?.abort(); };
  }, []);

  useEffect(() => {
    if (skipEmptySave.current) { skipEmptySave.current = false; return; }
    try {
      if (!draft.moment && !draft.context && draft.ideas.length === 0 && !draft.still && !draft.copy) {
        localStorage.removeItem(DRAFT_KEY);
        setSaveStatus('No local draft');
        return;
      }
      const value = JSON.stringify(draft);
      if (value.length > 2_500_000) throw new Error('Draft too large');
      localStorage.setItem(DRAFT_KEY, value);
      setSaveStatus('Saved on this device');
    } catch {
      // Never leave an older saved draft pretending to represent newer changes.
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* browser blocks writes */ }
      setSaveStatus('Could not save locally. Keep this tab open; try a smaller image.');
    }
  }, [draft]);

  useEffect(() => {
    const thisImage = ++imageId.current;
    const target = canvas.current;
    if (!target || !idea || !draft.still) return;
    const ctx = target.getContext('2d');
    if (!ctx) { setNotice('This browser cannot render the card.'); return; }
    loadCardImage(draft.still.thumbnail)
      .then(async image => {
        await document.fonts.ready;
        if (thisImage !== imageId.current) return;
        renderCdramaCard(ctx, image, idea, draft.format, draft);
      })
      .catch(error => { if (thisImage === imageId.current) setNotice(error.message); });
  }, [idea, draft.still, draft.format, draft.framing, draft.focusY]);

  function changeInput(next: Partial<ForgeDraft>) {
    requestId.current++;
    if (busy === 'ideas' || busy === 'download') setBusy('');
    setDraft(current => ({ ...current, ...next }));
    setAlternatives([]);
    setNotice('');
  }

  async function generate() {
    if (busy || !draft.moment.trim()) { setNotice('Enter a situation, trope, or viewer frustration first.'); return; }
    const id = ++requestId.current;
    setBusy('ideas'); setNotice('');
    try {
      const response = await fetch('/.netlify/functions/cdrama-memeforge', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moment: draft.moment.trim(), context: draft.context.trim(), lane: draft.lane }),
        signal: AbortSignal.timeout(45000),
      });
      const data = await response.json().catch(() => null);
      if (response.status === 401) recheck();
      if (!response.ok) throw new Error(data?.error || 'Could not generate ideas. Try again.');
      if (!Array.isArray(data?.ideas) || data.ideas.length !== 3
        || !data.ideas.every((item: Joke) => item
          && ['setup', 'punchline', 'visualDirection', 'searchQuery'].every(key => typeof item[key as keyof Joke] === 'string')
          && (item.setup.trim() || item.punchline.trim()))) {
        throw new Error('The idea response was incomplete. Retry.');
      }
      if (id !== requestId.current) return;
      if (draft.ideas.length) {
        setAlternatives(data.ideas);
        setNotice('New wording is ready below. Your current joke and image are unchanged until you choose one.');
      } else {
        setDraft(current => ({ ...current, ideas: data.ideas, selected: 0, copy: null }));
        setQuery(current => current || (searchMode === 'scenes' ? draft.moment : data.ideas[0].searchQuery));
      }
    } catch (error) {
      if (id === requestId.current) setNotice(error instanceof Error ? error.message : 'Idea request failed.');
    } finally { if (id === requestId.current) setBusy(''); }
  }

  function selectIdea(index: number) {
    requestId.current++;
    if (busy === 'ideas' || busy === 'download') setBusy('');
    setDraft(current => ({ ...current, selected: index, copy: null }));
    setNotice('');
  }

  function addManualExample(which: 'fire' | 'drama') {
    requestId.current++;
    setBusy('');
    const example: Joke = which === 'fire'
      ? { setup: 'the fire starter when they discover there’s a fire', punchline: '', visualDirection: 'A guilty, suddenly innocent reaction', searchQuery: 'guilty dramatic reaction still' }
      : { setup: 'me after personally starting the drama', punchline: 'wait why is everyone upset', visualDirection: 'A surprised instigator playing innocent', searchQuery: 'surprised innocent reaction still' };
    setDraft(current => ({ ...current, ideas: [example], selected: 0, copy: null }));
    if (searchMode !== 'scenes') setQuery(example.searchQuery);
    setNotice('Calibration example added as editable caption text. It was not generated.');
  }

  function addManualCaption() {
    const text = manualCaption.trim();
    if (!text) { setNotice('Write a caption first.'); return; }
    const joke: Joke = {
      setup: text, punchline: '', visualDirection: 'Choose a reaction that carries the same feeling',
      searchQuery: 'C-drama reaction still',
    };
    requestId.current++;
    setBusy('');
    setDraft(current => ({ ...current, ideas: [joke], selected: 0, copy: null }));
    setAlternatives([]);
    setManualCaption('');
    setNotice('Your caption is ready to edit. It was written locally, not generated.');
  }

  function editIdea(key: keyof Joke, value: string) {
    requestId.current++;
    if (busy === 'ideas' || busy === 'download') setBusy('');
    setDraft(current => ({
      ...current,
      ideas: current.ideas.map((item, index) => index === current.selected ? { ...item, [key]: value } : item),
    }));
    if (key === 'searchQuery' && searchMode !== 'scenes') setQuery(value);
  }

  function resetSearch() {
    searchId.current++;
    searchController.current?.abort();
    if (busy === 'search' || busy === 'upload') setBusy('');
    setResults([]); setRecapResearch([]); setSceneClues([]); setSceneQueries([]); setHasSceneSearch(false);
    setNotice('');
  }

  function chooseSearchMode(mode: typeof searchMode) {
    resetSearch();
    setSearchMode(mode);
    setQuery(mode === 'scenes' ? draft.moment || '' : idea?.searchQuery || '');
  }

  async function search() {
    const q = query.trim();
    if (!q) { setNotice('Describe the scene or reaction you want to find.'); return; }
    const id = ++searchId.current;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setResults([]);
    setRecapResearch([]);
    setSceneClues([]); setSceneQueries([]); setHasSceneSearch(false);
    setBusy('search'); setNotice('');
    try {
      const params = new URLSearchParams({ q });
      if (searchMode !== 'stills') {
        params.set('mode', searchMode);
        if (dramaTitle.trim()) params.set('dramaTitle', dramaTitle.trim());
      }
      const response = await fetch(`/.netlify/functions/cdrama-still-search?${params.toString()}`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(searchMode === 'scenes' ? 50000 : 25000)]),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Still search unavailable. Upload an image instead.');
      if (id !== searchId.current) return;
      const usable = (data?.results ?? []).filter((item: Result) => safeSource(item.link) && item.thumbnail).slice(0, 12);
      setResults(usable);
      const research = Array.isArray(data?.research)
        ? data.research.filter((item: Research) => item && typeof item.title === 'string'
          && typeof item.link === 'string' && typeof item.snippet === 'string').slice(0, 8)
        : [];
      if (searchMode !== 'stills') setRecapResearch(research);
      if (searchMode === 'scenes') {
        setSceneClues(Array.isArray(data?.clues) ? data.clues.filter((item: SceneClue) => item
          && typeof item.summary === 'string' && Array.isArray(item.sourceUrls)).slice(0, 3) : []);
        setSceneQueries(Array.isArray(data?.queries) ? data.queries.filter((item: unknown) => typeof item === 'string').slice(0, 3) : []);
        setHasSceneSearch(true);
      }
      if (data?.warning) setNotice(String(data.warning));
      else if (!usable.length) setNotice(searchMode !== 'stills'
        ? research.length ? 'No still images came back. Review the recap source leads below.' : 'No usable recap results. Try another phrase or upload your own still.'
        : 'No usable stills found. Try another phrase or upload your own.');
    } catch (error) {
      if (id === searchId.current) setNotice(error instanceof Error ? error.message : 'Search failed.');
    } finally { if (id === searchId.current) setBusy(''); }
  }

  function selectStill(still: Still | null) {
    requestId.current++;
    imageId.current++;
    setBusy('');
    setDraft(current => ({ ...current, still }));
    setNotice('');
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const id = ++searchId.current;
    setBusy('upload'); setNotice('');
    try {
      const thumbnail = await readLocalImage(file);
      if (id !== searchId.current) return;
      selectStill({ kind: 'upload', title: file.name.slice(0, 120), thumbnail, link: '', source: 'Your device', query: '' });
    } catch (error) { if (id === searchId.current) setNotice(error instanceof Error ? error.message : 'Upload failed.'); }
    finally { event.target.value = ''; if (id === searchId.current) setBusy(''); }
  }

  function updateCopy(key: keyof PostCopy, value: string) {
    if (!postCopy) return;
    setDraft(current => ({ ...current, copy: { ...(current.copy ?? suggestedCopy(current.ideas[current.selected])), [key]: value } }));
  }

  async function copyText(value: string, label: string) {
    try {
      if (!value.trim()) throw new Error('Add copy first.');
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied to clipboard. Paste it when posting manually.`);
    } catch { setNotice(`${label} could not be copied. Select and copy the text manually.`); }
  }

  async function download() {
    if (!idea || !draft.still || busy) return;
    const id = requestId.current;
    const current = { ...idea }, still = draft.still, format = draft.format;
    setBusy('download'); setNotice('');
    try {
      const image = await loadCardImage(still.thumbnail);
      await document.fonts.ready;
      if (id !== requestId.current) return;
      const previewContext = canvas.current?.getContext('2d');
      if (previewContext) renderCdramaCard(previewContext, image, current, format, draft);
      const output = document.createElement('canvas');
      const ctx = output.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable.');
      renderCdramaCard(ctx, image, current, format, draft);
      const blob = await new Promise<Blob>((resolve, reject) => output.toBlob(b => b ? resolve(b) : reject(new Error('PNG could not be created.')), 'image/png'));
      if (id !== requestId.current) return;
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = `cdrama-memeforge-${format}.png`;
        document.body.append(anchor); anchor.click(); anchor.remove();
        setNotice(`${format === 'tiktok' ? '1080×1920' : '1080×1350'} PNG download started. Post it manually; nothing was published.`);
      } finally { window.setTimeout(() => URL.revokeObjectURL(url), 30_000); }
    } catch (error) { if (id === requestId.current) setNotice(error instanceof Error ? error.message : 'Download failed.'); }
    finally { if (id === requestId.current) setBusy(''); }
  }

  function clear() {
    requestId.current++; searchId.current++; imageId.current++;
    searchController.current?.abort();
    setBusy('');
    skipEmptySave.current = true;
    setResults([]); setRecapResearch([]); setSceneClues([]); setSceneQueries([]); setHasSceneSearch(false);
    setAlternatives([]); setQuery(''); setSearchMode('scenes'); setDramaTitle(''); setManualCaption(''); setDraft(emptyDraft());
    try { localStorage.removeItem(DRAFT_KEY); setSaveStatus('Draft cleared from this device'); }
    catch { setSaveStatus('Clear could not remove local storage; check browser settings.'); }
    setNotice('Working draft cleared. No Collection or cloud data was changed.');
  }

  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <a href="/">← Fandom Vibes</a>
        <span>C-DRAMA / MEMEFORGE</span>
        <a href="/memeforge/middle-earth">Middle-earth studio ↗</a>
      </header>
      <div className={styles.intro}>
        <p className={styles.kicker}>THE SOCIAL STUDIO / 01</p>
        <h1>Find the bit.<br /><em>Make the reaction.</em></h1>
        <p>Tell us what made you laugh—in your own words. Keep the specific joke, find a reaction, and make something you can actually send.</p>
      </div>
      <div className={styles.layout}>
        <section className={styles.editor} aria-label="Joke workshop">
          <div className={styles.sectionTitle}><span>01 / THE MOMENT</span><strong>Start with what happened.</strong></div>
          <label htmlFor="forge-moment">Situation, trope, dynamic, or viewer frustration</label>
          <textarea id="forge-moment" maxLength={500} rows={3} value={draft.moment} onChange={e => changeInput({ moment: e.target.value })} placeholder="The villain gets caught and somehow turns it into her big dramatic defense speech. THAT energy." />
          <p className={styles.help}>Describe the scene, phrase, or behavior you mean. No prompt-writing required. Editing this brief keeps your current joke and image.</p>
          <details className={styles.details}>
            <summary>Optional creative direction</summary>
            <label htmlFor="forge-context">Drama or character context (optional)</label>
            <input id="forge-context" maxLength={160} value={draft.context} onChange={e => changeInput({ context: e.target.value })} placeholder="A specific drama, character, or relationship" />
            <label htmlFor="forge-lane">Comedy lane</label>
            <select id="forge-lane" value={draft.lane} onChange={e => changeInput({ lane: e.target.value as ForgeDraft['lane'] })}>
              <option value="fandom">Stay with my idea</option>
              <option value="self-own">Viewer self-own</option>
              <option value="trope-logic">C-drama trope logic</option>
              <option value="everyday-stakes">Everyday life, C-drama stakes</option>
            </select>
          </details>
          {sessionLoading ? <p>Checking sign-in…</p> : !isSignedIn ? (
            <form className={styles.signin} onSubmit={async e => {
              e.preventDefault(); setBusy('signin');
              try { setNotice(await requestMagicLink(email)); }
              catch (error) { setNotice(error instanceof Error ? error.message : 'Sign-in link unavailable.'); }
              finally { setBusy(''); }
            }}>
              <p>Sign in to generate. Your local draft stays on this device while you open your email.</p>
              <label htmlFor="forge-email">Email for sign-in link</label>
              <div className={styles.row}><input id="forge-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} /><button disabled={!!busy}>Send sign-in link</button></div>
              <small>After verifying, come back to this studio. <button type="button" onClick={recheck}>I’ve signed in · check again</button></small>
            </form>
          ) : <button className={styles.primary} type="button" onClick={() => void generate()} disabled={!!busy || !draft.moment.trim()}>{busy === 'ideas' ? 'Working on your joke…' : draft.ideas.length ? 'Suggest new wording' : 'Find three joke angles'} →</button>}
          <div className={styles.examples}>
            <p>Or start with an editable calibration example. These are not generated results.</p>
            <label htmlFor="forge-manual-caption">Write a caption yourself</label>
            <div className={styles.row}>
              <input id="forge-manual-caption" maxLength={125} value={manualCaption} onChange={e => setManualCaption(e.target.value)} placeholder="Your own one-line joke" />
              <button type="button" disabled={!!busy} onClick={addManualCaption}>Add caption</button>
            </div>
            <button type="button" disabled={!!busy} onClick={() => addManualExample('fire')}>Try: the fire starter when they discover there’s a fire</button>
            <button type="button" disabled={!!busy} onClick={() => addManualExample('drama')}>Try: me after personally starting the drama / wait why is everyone upset</button>
          </div>
          {alternatives.length > 0 && <section aria-label="New wording options">
            <p>Your current meme stays as it is. Choose a version only if you want to replace its wording.</p>
            <div className={styles.ideas}>{alternatives.map((item, index) => <button type="button" disabled={!!busy} key={index} onClick={() => {
              requestId.current++;
              setDraft(current => ({ ...current, copy: null, ideas: current.ideas.map((existing, i) => i === current.selected ? item : existing) }));
              setAlternatives([]); setNotice('Wording replaced. Your selected image is unchanged.');
            }}><small>USE WORDING 0{index + 1}</small><strong>{item.setup}</strong><span>{item.punchline}</span></button>)}</div>
            <button type="button" onClick={() => setAlternatives([])}>Keep current wording</button>
          </section>}
          {draft.ideas.length > 0 && <>
            <div className={styles.sectionTitle}><span>02 / THE TURN</span><strong>Pick your punchline.</strong></div>
            <div className={styles.ideas}>
              {draft.ideas.map((item, index) => <button type="button" key={index} className={index === draft.selected ? styles.activeIdea : ''} aria-pressed={index === draft.selected} onClick={() => selectIdea(index)}>
                <small>ANGLE 0{index + 1}</small><strong>{item.setup}</strong><span>{item.punchline}</span>
              </button>)}
            </div>
            <div className={styles.pair}>
              <label htmlFor="forge-setup">Setup</label>
              <textarea id="forge-setup" maxLength={125} rows={2} value={idea?.setup ?? ''} onChange={e => editIdea('setup', e.target.value)} />
              <label htmlFor="forge-punchline">Punchline</label>
              <textarea id="forge-punchline" maxLength={125} rows={2} value={idea?.punchline ?? ''} onChange={e => editIdea('punchline', e.target.value)} />
              <label htmlFor="forge-visual">Reaction image direction</label>
              <textarea id="forge-visual" maxLength={220} rows={2} value={idea?.visualDirection ?? ''} onChange={e => editIdea('visualDirection', e.target.value)} />
            </div>
          </>}
            <div className={styles.sectionTitle}><span>03 / THE REACTION</span><strong>Find the performance.</strong></div>
            <p className={styles.help}>{idea?.visualDirection} Search with the drama, character, scene, or phrase you remember. Searching, uploading, and changing images never rewrite your joke. Check the source and sharing rights before posting.</p>
            <div className={styles.searchModes} role="group" aria-label="Still search mode">
              <button type="button" aria-pressed={searchMode === 'scenes'} onClick={() => chooseSearchMode('scenes')}>Find the scene</button>
              <button type="button" aria-pressed={searchMode === 'stills'} onClick={() => chooseSearchMode('stills')}>Find reaction stills</button>
              <button type="button" aria-pressed={searchMode === 'recaps'} onClick={() => chooseSearchMode('recaps')}>Look through recaps</button>
            </div>
            {searchMode !== 'stills' && <div className={styles.recapFields}>
              <p>{searchMode === 'scenes' ? 'Describe the acting you remember. We look for scene and episode clues, then search in English and Chinese where supported. No keywords or episode number required.' : 'Search recap sources for a moment you remember.'} Your current image and text stay untouched until you choose a still.</p>
              <label htmlFor="forge-drama-title">Drama title (optional)</label>
              <input id="forge-drama-title" maxLength={120} value={dramaTitle} onChange={e => { resetSearch(); setDramaTitle(e.target.value); }} placeholder="Add a title to focus the search" />
              {searchMode === 'scenes' && <button type="button" disabled={!draft.moment.trim()} onClick={() => { resetSearch(); setQuery([draft.moment, draft.context].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 500)); }}>Use my moment description</button>}
            </div>}
            <div className={styles.row}>
              <input aria-label={searchMode === 'scenes' ? 'Describe the performance to find' : searchMode === 'recaps' ? 'Search recap moments or characters' : 'Search clean C-drama stills'} maxLength={searchMode === 'scenes' ? 500 : 160} value={query} onChange={e => {
                resetSearch(); setQuery(e.target.value);
              }} placeholder={searchMode === 'scenes' ? 'Who is doing what? Tell us what you remember.' : searchMode === 'recaps' ? 'Character, phrase, or remembered moment' : 'Drama or character + expression + still'} />
              <button type="button" onClick={() => void search()} disabled={!!busy}>{busy === 'search' ? 'Searching…' : searchMode === 'scenes' ? 'Find performance stills' : searchMode === 'recaps' ? 'Search recaps' : 'Search stills'}</button>
            </div>
            {searchMode === 'scenes' && <p className={styles.help}>Scene research sends this description to the AI search service. It does not send or rewrite your caption. This can take up to 50 seconds.</p>}
            {searchMode === 'scenes' && hasSceneSearch && <SceneEvidence clues={sceneClues} queries={sceneQueries} />}
            <div className={styles.results}>
              {busy === 'search' && <div className={styles.searchSkeleton} role="status"><span>Looking for usable stills and source leads…</span><i /><i /><i /></div>}
              {results.map((result, index) => <div className={styles.resultCard} key={`${result.link}-${index}`}>
                <CandidateImage src={result.thumbnail} title={result.title} source={result.source} scene={searchMode === 'scenes'} onChoose={() => selectStill({
                  kind: 'search', title: result.title, thumbnail: result.thumbnail, link: result.link,
                  source: result.source, query: result.searchQuery || query,
                })} />
                {searchMode !== 'stills' && <div className={styles.resultMeta}>
                  {searchMode === 'scenes' ? <SceneMatch result={result} /> : <strong>Unverified lead</strong>}
                  {Number.isInteger(result.episodeStart) && <span>Episodes {result.episodeStart}{Number.isInteger(result.episodeEnd) && result.episodeEnd !== result.episodeStart ? `–${result.episodeEnd}` : ''}</span>}
                  {result.warning && <span>{result.warning}</span>}
                  {safeSource(result.link) && <a href={safeSource(result.link)} target="_blank" rel="noopener noreferrer">Open source ↗</a>}
                  {(result.research ?? []).slice(0, 3).map((item, researchIndex) => <span className={styles.research} key={`${item.link}-${researchIndex}`}>
                    {safeSource(item.link) ? <a href={safeSource(item.link)} target="_blank" rel="noopener noreferrer">{item.title || 'Research source'} ↗</a> : <strong>{item.title || 'Research source'}</strong>}
                    <span>{item.snippet}</span>
                    {(Number.isInteger(item.episodeStart) || Number.isInteger(item.episodeEnd)) && <small>Episode range {item.episodeStart ?? '?'}–{item.episodeEnd ?? '?'}</small>}
                  </span>)}
                </div>}
              </div>)}
            </div>
            {searchMode !== 'stills' && recapResearch.length > 0 && <section className={styles.recapResearch} aria-label="Recap source leads">
              <strong>Recap source leads · unverified{searchMode === 'scenes' ? ' · AI research summaries, not source quotes' : ''}</strong>
              {recapResearch.map((item, index) => <article key={`${item.link}-${index}`}>
                <div>{safeSource(item.link) ? <a href={safeSource(item.link)} target="_blank" rel="noopener noreferrer">{item.title || 'Research source'} ↗</a> : <strong>{item.title || 'Research source'}</strong>}</div>
                <p>{item.snippet}</p>
                {(Number.isInteger(item.episodeStart) || Number.isInteger(item.episodeEnd)) && <small>Episode range {item.episodeStart ?? '?'}–{item.episodeEnd ?? '?'}</small>}
              </article>)}
            </section>}
            <label className={styles.upload}>Or upload your own JPEG, PNG, or WebP <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => void upload(e)} disabled={!!busy} /></label>
            {draft.still && <>
              <p className={styles.source}>Selected: {draft.still.title || 'Untitled image'} · {draft.still.kind === 'upload' ? 'local upload' : <a href={safeSource(draft.still.link)} target="_blank" rel="noopener noreferrer">{draft.still.source || 'View original source'} ↗</a>} <button type="button" onClick={() => selectStill(null)}>Remove image</button></p>
               <label htmlFor="forge-framing">Image framing</label>
              <select id="forge-framing" value={draft.framing} disabled={!!busy} onChange={e => {
                requestId.current++;
                setDraft(current => ({ ...current, framing: e.target.value as ForgeDraft['framing'] }));
              }}>
                 <option value="cover">Full-bleed · crop edges</option>
                 <option value="contain">Keep the whole still</option>
              </select>
              {draft.framing === 'cover' && <>
                 <label htmlFor="forge-focus-x">Horizontal crop position</label>
                 <input id="forge-focus-x" type="range" min="0" max="100" value={draft.focusX} disabled={!!busy} onChange={e => {
                   requestId.current++;
                   setDraft(current => ({ ...current, focusX: Number(e.target.value) }));
                 }} />
                <label htmlFor="forge-focus">Vertical crop position</label>
                <input id="forge-focus" type="range" min="0" max="100" value={draft.focusY} disabled={!!busy} onChange={e => {
                  requestId.current++;
                  setDraft(current => ({ ...current, focusY: Number(e.target.value) }));
                }} />
              </>}
               <label htmlFor="forge-placement">Text placement</label>
               <select id="forge-placement" value={draft.textPlacement} disabled={!!busy} onChange={e => {
                 requestId.current++;
                 setDraft(current => ({ ...current, textPlacement: e.target.value as ForgeDraft['textPlacement'] }));
               }}>
                 <option value="top-bottom">Top and bottom</option>
                 <option value="single-top">Single line · top</option>
                 <option value="single-bottom">Single line · bottom</option>
                 <option value="subtitle">Subtitle · lower third</option>
               </select>
            </>}
        </section>
        <aside className={styles.output} aria-label="Post preview and handoff">
          <div className={styles.sectionTitle}><span>THE OUTPUT</span><strong>Your joke. Your meme.</strong></div>
          <div className={styles.formats} role="group" aria-label="Output size">
            <button type="button" disabled={!!busy} aria-pressed={draft.format === 'tiktok'} onClick={() => { requestId.current++; setDraft(current => ({ ...current, format: 'tiktok' })); }}>TikTok · 9:16</button>
            <button type="button" disabled={!!busy} aria-pressed={draft.format === 'instagram'} onClick={() => { requestId.current++; setDraft(current => ({ ...current, format: 'instagram' })); }}>Instagram · 4:5</button>
          </div>
          <div className={styles.preview}>
            {idea && draft.still ? <canvas ref={canvas} width={frameFor(draft.format).width} height={frameFor(draft.format).height} aria-label={`${draft.format} meme preview: ${idea.setup} ${idea.punchline}`} /> :
              <div className={styles.placeholder}><span>PREVIEW / WAITING</span><strong>{idea ? 'Choose a still to see your reaction.' : 'A good reaction starts with a sharp turn.'}</strong><p>Uploads and draft edits stay in this browser. Generating ideas sends your moment and optional context to the AI service.</p></div>}
          </div>
          <p className={styles.help}>Text sits directly over the still with a dark outline for contrast. Move it away from faces and check platform overlays before posting.</p>
          {postCopy && <>
            <div className={styles.sectionTitle}><span>POST COPY</span><strong>Edit before you post.</strong></div>
            <label htmlFor="forge-hook">TikTok hook</label>
            <input id="forge-hook" maxLength={125} value={postCopy.hook} onChange={e => updateCopy('hook', e.target.value)} />
            <label htmlFor="forge-tiktok">TikTok caption</label>
            <textarea id="forge-tiktok" rows={3} maxLength={2200} value={postCopy.tiktok} onChange={e => updateCopy('tiktok', e.target.value)} />
            <label htmlFor="forge-instagram">Instagram caption</label>
            <textarea id="forge-instagram" rows={3} maxLength={2200} value={postCopy.instagram} onChange={e => updateCopy('instagram', e.target.value)} />
            <label htmlFor="forge-hashtags">Optional hashtags</label>
            <input id="forge-hashtags" maxLength={250} value={postCopy.hashtags} onChange={e => updateCopy('hashtags', e.target.value)} />
            <div className={styles.actions}>
              <button type="button" disabled={!draft.still || !!busy || !(idea?.setup.trim() || idea?.punchline.trim())} onClick={() => void download()}>{busy === 'download' ? 'Preparing PNG…' : `Download ${draft.format === 'tiktok' ? '1080×1920' : '1080×1350'} PNG`}</button>
              <button type="button" onClick={() => void copyText(`${postCopy.hook}\n\n${postCopy.tiktok}${postCopy.hashtags.trim() ? `\n\n${postCopy.hashtags}` : ''}`, 'TikTok copy')}>Copy TikTok post</button>
              <button type="button" onClick={() => void copyText(`${postCopy.instagram}${postCopy.hashtags.trim() ? `\n\n${postCopy.hashtags}` : ''}`, 'Instagram copy')}>Copy Instagram post</button>
            </div>
          </>}
          <div className={styles.draftStatus}><span role="status">{saveStatus}</span><button type="button" onClick={clear}>Clear local draft</button></div>
          <p className={styles.manual}>Manual-posting handoff only. This is a still PNG, not a video. No account is connected, post is scheduled, or publication is confirmed. Your draft is local to this browser, not a Collection save.</p>
          {notice && <p className={styles.notice} role="status">{notice}</p>}
        </aside>
      </div>
    </main>
  );
}
