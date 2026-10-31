import { useEffect, useRef, useState } from 'react';
import type { Still } from '../../utils/cdramaForge';
import { CandidateImage } from './SceneEvidence';
import styles from './SimilarStills.module.css';

type SimilarResult = {
  title: string;
  thumbnail: string;
  link: string;
  source: string;
  evidence: 'unverified';
};

type SearchStatus = 'idle' | 'loading' | 'error' | 'empty' | 'ready' | 'unsupported';

const IMAGE_PROXY_PATH = '/.netlify/functions/image-proxy';

function httpsUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

function proxyImageUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith(`${IMAGE_PROXY_PATH}?`) || value.includes('#')) return '';
  const query = value.slice(IMAGE_PROXY_PATH.length + 1);
  const params = new URLSearchParams(query);
  if ([...params.keys()].some(key => key !== 'url') || params.getAll('url').length !== 1) return '';
  return httpsUrl(params.get('url'));
}

function originalImageUrl(thumbnail: string): string {
  return httpsUrl(thumbnail) || proxyImageUrl(thumbnail);
}

function safeResultThumbnail(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith(`${IMAGE_PROXY_PATH}?`) || value.includes('#')) return '';
  return proxyImageUrl(value) ? value : '';
}

function safeSource(value: unknown): string {
  return httpsUrl(value);
}

function usableResults(value: unknown): SimilarResult[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: SimilarResult[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const item = candidate as Partial<SimilarResult>;
    const link = safeSource(item.link);
    const thumbnail = safeResultThumbnail(item.thumbnail);
    if (!link || !thumbnail || typeof item.title !== 'string' || typeof item.source !== 'string') continue;
    const key = proxyImageUrl(thumbnail);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({
      title: item.title.slice(0, 240),
      thumbnail,
      link,
      source: item.source.slice(0, 120),
      evidence: 'unverified',
    });
    if (output.length === 12) break;
  }
  return output;
}

export function SimilarStills({ still, onSelect }: {
  still: Still;
  onSelect: (still: Still) => void;
}) {
  const canSearch = still.kind === 'search' && Boolean(originalImageUrl(still.thumbnail));
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [message, setMessage] = useState('');
  const [results, setResults] = useState<SimilarResult[]>([]);
  const [resultsSeed, setResultsSeed] = useState('');
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef(0);

  useEffect(() => () => {
    requestId.current++;
    controller.current?.abort();
  }, []);

  function cancelSearch() {
    requestId.current++;
    controller.current?.abort();
    controller.current = null;
    if (status === 'loading') setStatus(results.length ? 'ready' : 'idle');
  }

  async function findSimilar() {
    setOpen(true);
    const image = canSearch ? originalImageUrl(still.thumbnail) : '';
    if (!image) {
      cancelSearch();
      setStatus('unsupported');
      setMessage(still.kind === 'upload'
        ? 'Related-still search only works with public search stills. Device uploads stay on this device and are not sent.'
        : 'This still does not have a supported public HTTPS image URL, so it was not sent.');
      return;
    }

    controller.current?.abort();
    const activeController = new AbortController();
    controller.current = activeController;
    const id = ++requestId.current;
    setStatus('loading');
    setMessage('');
    try {
      const params = new URLSearchParams({ mode: 'similar', image });
      const response = await fetch(`/.netlify/functions/cdrama-still-search?${params.toString()}`, {
        signal: AbortSignal.any([activeController.signal, AbortSignal.timeout(25000)]),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Related still search is unavailable. Try again.');
      if (id !== requestId.current) return;
      const found = usableResults(data?.results);
      setResults(found);
      setResultsSeed(still.title || 'Selected still');
      if (found.length) {
        setStatus('ready');
        setMessage(typeof data?.warning === 'string' ? data.warning : '');
      } else {
        setStatus('empty');
        setMessage(typeof data?.warning === 'string' ? data.warning : 'No related stills were returned. Your selected still and draft are unchanged.');
      }
    } catch (error) {
      if (id !== requestId.current) return;
      if (activeController.signal.aborted) return;
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Related still search failed. Try again.');
    } finally {
      if (id === requestId.current) controller.current = null;
    }
  }

  function toggleSection() {
    if (open) {
      setOpen(false);
      cancelSearch();
    } else {
      setOpen(true);
    }
  }

  return (
    <section className={styles.related} aria-label="Related stills">
      <div className={styles.heading}>
        <div>
          <strong>Related stills</strong>
          <span>Compare public image results without changing your current selection.</span>
        </div>
        <button type="button" className={styles.disclosure} aria-expanded={open} onClick={toggleSection}>
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      <button type="button" className={styles.findButton} onClick={() => void findSimilar()}>
        Find more like this
      </button>
      {canSearch && <p className={styles.disclosureCopy}>
        Uses the selected public still URL with Google Lens via SerpApi—not your caption or exported meme.
      </p>}
      {!canSearch && <p className={styles.availability}>
        {still.kind === 'upload'
          ? 'Related-still search supports public search stills only. Device uploads stay on this device and are never sent.'
          : 'This image has no supported public HTTPS still URL, so related-still search is unavailable.'}
      </p>}
      {open && <div className={styles.body}>
        <p className={styles.disclosureCopy}>
          This sends the selected public still URL to Google Lens via SerpApi. Results are unverified leads;
          inspect the source and image before using one. No caption, framing, or search wording is changed.
        </p>
        {status === 'unsupported' && <p className={styles.status} role="status">{message}</p>}
        {status === 'loading' && <div className={styles.loading} role="status" aria-live="polite">
          <span>Looking for visually related stills…</span><i /><i /><i />
        </div>}
        {status === 'error' && <div className={styles.feedback} role="alert">
          <p>{message}</p>
          <button type="button" onClick={() => void findSimilar()}>Retry related search</button>
        </div>}
        {status === 'empty' && <p className={styles.status} role="status">{message}</p>}
        {status === 'ready' && message && <p className={styles.status} role="status">{message}</p>}
        {results.length > 0 && <div className={styles.results} aria-label={`Similar stills based on ${resultsSeed}`}>
          <p className={styles.seed}>Results based on: <strong>{resultsSeed}</strong></p>
          <div className={styles.grid}>
            {results.map((result, index) => <article className={styles.card} key={`${result.link}-${index}`}>
              <CandidateImage
                src={result.thumbnail}
                title={result.title}
                source={result.source}
                scene={false}
                onChoose={() => onSelect({
                  kind: 'search',
                  title: result.title,
                  thumbnail: result.thumbnail,
                  link: result.link,
                  source: result.source,
                  query: still.query,
                })}
              />
              <a className={styles.sourceLink} href={result.link} target="_blank" rel="noopener noreferrer">
                Open source
              </a>
            </article>)}
          </div>
        </div>}
      </div>}
    </section>
  );
}
