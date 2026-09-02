import { useEffect, useMemo, useState } from 'react';
import styles from './ReleaseDesk.module.css';

type AnyRecord = Record<string, any>;

const EMPTY_RECORDS: AnyRecord[] = [];

const api = async () => {
  const response = await fetch('/.netlify/functions/actor-audits', {
    credentials: 'include',
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || 'Release Desk unavailable.');
  return result;
};

export const ReleaseDesk: React.FC = () => {
  const [inventory, setInventory] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let live = true;
    api()
      .then(result => {
        if (live) setInventory(result.releaseInventory ?? null);
      })
      .catch(error => {
        if (live) setNotice(error instanceof Error ? error.message : 'Release inventory could not be loaded.');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <section className={styles.releaseDesk} aria-labelledby="release-desk-title">
      <header className={styles.deskHeader}>
        <div>
          <p className={styles.eyebrow}>Fandom Vibes / private operations</p>
          <h3 id="release-desk-title">Release Desk</h3>
          <p>See what can ship, what needs work, and what ships next without reopening the evidence decision.</p>
        </div>
        <div className={styles.deskBoundary}>
          <span>Operator boundary</span>
          <strong>Readiness, not curation</strong>
          <small>Approved boards and receipts remain owned by Actor Preflight.</small>
        </div>
      </header>

      <nav className={styles.views} aria-label="Release Desk view" role="tablist">
        <button type="button" role="tab" aria-selected="true">Inventory<small>Current candidates</small></button>
      </nav>

      {notice && <div className={styles.error} role="status">{notice}</div>}
      {loading
        ? <div className={styles.empty} aria-label="Loading release inventory">Loading release inventory…</div>
        : inventory
          ? <ReleaseInventory inventory={inventory} />
          : <div className={styles.empty}>No release inventory was returned.</div>}
    </section>
  );
};

function nextShanghaiNoonLabel(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  let target = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  if (Number(parts.hour) >= 12) target += 24 * 60 * 60 * 1000;
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(target));
  return `${dateLabel} · 12:00 PM Asia/Shanghai`;
}

function ReleaseInventory({ inventory }: { inventory: AnyRecord }) {
  const cutoffLabel = useMemo(() => nextShanghaiNoonLabel(), []);
  const actorPacks = (inventory.actorPacks ?? EMPTY_RECORDS) as AnyRecord[];
  const readyCount = Number(inventory.releaseReadyPairingCount ?? 0);
  const recentWindowDays = Number(inventory.recentDailyDropWindowDays ?? 30);
  const unusedCount = Number(inventory.unusedWithinRecentWindowPairingCount ?? 0);
  const depthLabel = readyCount === 0
    ? 'No current release-ready pairing'
    : readyCount === 1
      ? 'One current pairing — concentrated inventory'
      : 'Multiple current pairing options';

  return (
    <section className={styles.inventory} aria-labelledby="release-inventory-title">
      <div className={styles.inventoryHeader}>
        <div>
          <p className={styles.eyebrow}>Tomorrow’s Daily Drop</p>
          <h4 id="release-inventory-title">Inventory</h4>
          <p>{depthLabel}. Counts come from the same current, fail-closed eligibility receipts used by the scheduler.</p>
          <p className={styles.privateInventoryNote}>Private editorial context · recent use does not change scheduler selection or public payloads.</p>
        </div>
        <div className={styles.cutoff}>
          <span>Next operator cutoff</span>
          <strong>{cutoffLabel}</strong>
          <small>Public scheduling behavior is unchanged.</small>
        </div>
      </div>

      <div className={styles.inventoryMetrics}>
        <div><strong>{readyCount}</strong><span>release-ready actor × Vibe pairings</span></div>
        <div data-kind={unusedCount === readyCount ? 'fresh' : 'recent'}><strong>{unusedCount}</strong><span>unused in the last {recentWindowDays} days</span></div>
        <div data-kind="fresh"><strong>{inventory.freshCuratorPairingCount ?? 0}</strong><span>fresh-curator pairings</span></div>
        <div data-kind="rescue"><strong>{inventory.rescueBackupPairingCount ?? 0}</strong><span>pairings with rescue backup</span></div>
        <div data-kind="rescue"><strong>{inventory.rescueBackupBoardCount ?? 0}</strong><span>explicit publishable rescue boards</span></div>
      </div>

      <div className={styles.inventoryPacks}>
        {actorPacks.map(pack => (
          <article className={styles.inventoryPack} data-empty={!pack.releaseReadyPairingCount} key={pack.actorId}>
            <header>
              <div><strong>{pack.actorName}</strong><span>{pack.actorShortNameEn}</span></div>
              <b>{pack.releaseReadyPairingCount ?? 0} ready</b>
            </header>
            <p>{pack.freshCuratorPairingCount ?? 0} fresh curator · {pack.rescueBackupPairingCount ?? 0} rescue-backed pairing{pack.rescueBackupPairingCount === 1 ? '' : 's'} · {pack.rescueBackupBoardCount ?? 0} backup board{pack.rescueBackupBoardCount === 1 ? '' : 's'}</p>
            {pack.pairings?.length
              ? <>
                <div className={pack.recentlyUsed ? styles.actorRepeatWarning : styles.actorLastDrop} role={pack.recentlyUsed ? 'status' : undefined}>
                  <strong>{pack.recentlyUsed ? 'Actor repeat watch' : 'Last actor Daily Drop'}</strong>
                  <span>{pack.lastDailyDropDate ? `Last Daily Drop · ${formatEditionDate(pack.lastDailyDropDate)}${pack.recentlyUsed && pack.recentDailyDropCount > 1 ? ` · ${pack.recentDailyDropCount} recent appearances` : ''}` : 'No recorded Daily Drop'}</span>
                </div>
                <ul>
                  {pack.pairings.map((pair: AnyRecord) => (
                    <li key={pair.vibeKey}>
                      <span>{pair.vibeLabel}</span>
                      <div>
                        {pair.freshCurator && <em data-kind="fresh">Fresh curator</em>}
                        {pair.rescueBackupBoardCount > 0 && <em data-kind="rescue">{pair.rescueBackupBoardCount} rescue backup{pair.rescueBackupBoardCount === 1 ? '' : 's'}</em>}
                        {pair.recentlyUsed
                          ? <em data-kind="recent">Pair repeat · {formatEditionDate(pair.lastDailyDropDate)}{pair.recentDailyDropCount > 1 ? ` · ${pair.recentDailyDropCount} appearances` : ''}</em>
                          : <em data-kind="unused">Unused · last {recentWindowDays} days</em>}
                      </div>
                      {pair.recentlyUsed && <small className={styles.recentUseDates}>Pair appeared {pair.recentDailyDropDates.map(formatEditionDate).join(' · ')}</small>}
                    </li>
                  ))}
                </ul>
              </>
              : <small>No current release-ready pairings in this actor pack.</small>}
          </article>
        ))}
      </div>
    </section>
  );
}

function formatEditionDate(value: unknown) {
  if (!value) return 'Unknown date';
  const parsed = new Date(`${String(value)}T12:00:00+08:00`);
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(parsed);
}