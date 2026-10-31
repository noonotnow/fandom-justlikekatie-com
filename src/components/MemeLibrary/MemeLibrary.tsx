import { useEffect, useState } from 'react';
import { Collection } from '../Collection/Collection';
import { getPublicSession } from '../../utils/publicAccount';
import styles from './MemeLibrary.module.css';

type MemeLens = 'c-drama' | 'middle-earth';

function readLens(): MemeLens {
  return new URLSearchParams(window.location.search).get('lens') === 'c-drama'
    ? 'c-drama'
    : 'middle-earth';
}

export function MemeLibrary() {
  const [lens, setLens] = useState<MemeLens>(readLens);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    const syncLens = () => setLens(readLens());
    window.addEventListener('popstate', syncLens);
    return () => window.removeEventListener('popstate', syncLens);
  }, []);

  useEffect(() => {
    let active = true;
    setSessionResolved(false);
    setSessionError(false);
    getPublicSession()
      .then(session => {
        if (!active) return;
        setIsAdmin(session?.isAdmin === true);
        setSessionResolved(true);
      })
      .catch(() => {
        if (!active) return;
        setIsAdmin(false);
        setSessionError(true);
        setSessionResolved(true);
      });
    return () => { active = false; };
  }, [retryToken]);

  function selectLens(next: MemeLens) {
    setLens(next);
    const params = new URLSearchParams(window.location.search);
    params.set('lens', next);
    window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`);
  }

  return (
    <main className={styles.library}>
      <header className={styles.header}>
        <a className={styles.backLink} href="/">Fandom / MemeForge</a>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>MEMEFORGE / SAVED WORKS</p>
          <h1>The meme library</h1>
          <p className={styles.intro}>Finished images, preserved as they are. Switch studios without mixing their shelves.</p>
        </div>
        <nav className={styles.lenses} aria-label="Choose a MemeForge library">
          <button type="button" aria-pressed={lens === 'c-drama'} onClick={() => selectLens('c-drama')}>
            <span>01</span> C-drama
          </button>
          <button type="button" aria-pressed={lens === 'middle-earth'} onClick={() => selectLens('middle-earth')}>
            <span>02</span> Middle-earth
          </button>
        </nav>
      </header>
      {sessionError && (
        <div className={styles.sessionNotice} role="status">
          <span>Could not confirm operator access. Your local library remains available.</span>
          <button type="button" onClick={() => setRetryToken(value => value + 1)}>Check again</button>
        </div>
      )}
      {!sessionResolved && (
        <div className={styles.loading} role="status" aria-label="Checking session">
          <span /><span /><span />
        </div>
      )}
        <Collection
          key={lens}
          scope={lens}
          isMemeCollection
          initialType="results"
          hasCollectorAccess={lens === 'middle-earth' && isAdmin}
        />
    </main>
  );
}

export default MemeLibrary;
