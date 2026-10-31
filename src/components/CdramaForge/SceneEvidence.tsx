import { useState } from 'react';
import styles from './CdramaForge.module.css';

export type SceneClue = {
  summary: string; episodeStart?: number; episodeEnd?: number;
  chineseTitle: string; chineseCharacter: string; sourceUrls: string[];
};
export type SceneResult = {
  match?: 'episode-aligned' | 'nearby-episode' | 'broader-lead';
  searchQuery?: string; subtitleStatus?: 'unchecked';
};
const sourceUrl = (value: string) => {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; }
  catch { return ''; }
};

export function SceneEvidence({ clues, queries }: { clues: SceneClue[]; queries: string[] }) {
  return <details className={styles.recapResearch} open>
    <summary>Scene clues &amp; search trail</summary>
    <p>Research suggestions, not verified dialogue or exact frames. Your caption stays unchanged.</p>
    {!clues.length && <p>No supported scene identification yet. These searches use your description without guessing names or episodes.</p>}
    {clues.map((clue, index) => <article key={index}>
      <strong>Possible scene {index + 1}{clue.episodeStart ? ` · Episode ${clue.episodeStart}${clue.episodeEnd !== clue.episodeStart ? `–${clue.episodeEnd}` : ''}` : ''}</strong>
      <p>{clue.summary}</p>
      {(clue.chineseTitle || clue.chineseCharacter) && <span lang="zh">{[clue.chineseTitle, clue.chineseCharacter].filter(Boolean).join(' · ')}</span>}
      {clue.sourceUrls.filter(url => sourceUrl(url)).map((url, i) => <a key={url} href={sourceUrl(url)} target="_blank" rel="noopener noreferrer">Scene source {i + 1} ↗</a>)}
    </article>)}
    <details><summary>Searches used</summary><ul>{queries.map(query => <li key={query}>{query}</li>)}</ul></details>
  </details>;
}

export function SceneMatch({ result }: { result: SceneResult }) {
  const label = result.match === 'episode-aligned' ? 'Episode-aligned lead'
    : result.match === 'nearby-episode' ? 'Different episode lead' : 'Broader search lead';
  return <><strong>{label} · frame unverified</strong>
    <span>Subtitles not checked. Inspect the image before using it.</span>
    {result.searchQuery && <details><summary>Why this appeared</summary><span>{result.searchQuery}</span></details>}
  </>;
}

/** Measures the delivered file, not provider-reported original dimensions. */
export function CandidateImage({ src, title, onChoose, source, scene }: {
  src: string; title: string; onChoose: () => void; source: string; scene: boolean;
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  return <>
    <button type="button" onClick={onChoose} disabled={failed} aria-label={`Use this still · ${source} · ${title}`}>
      <img loading="lazy" src={src} alt={title || 'Search still'}
        onLoad={event => { const image = event.currentTarget; setSize({ width: image.naturalWidth, height: image.naturalHeight }); }}
        onError={() => setFailed(true)} />
      <small>{source || 'Source unknown'}</small>
      <span className={styles.chooseStill}>{failed ? 'Image unavailable' : 'Use this still'}</span>
    </button>
    {scene && <div className={styles.resultMeta}>
      {failed ? <span>Image could not load. The source link is still available below.</span>
        : size ? <span>{size.width} × {size.height}{size.width < 1080 || size.height < 720 ? ' · Small source; enlargement may look soft.' : ''}</span>
          : <span>Image size not checked yet.</span>}
    </div>}
  </>;
}
