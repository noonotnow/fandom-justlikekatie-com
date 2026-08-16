import { useEffect, useMemo, useState } from 'react';
import { dbGetAllCards, dbGetAllGrids, dbSaveGrid, type GridRecord } from '../../utils/collectionDB';
import { migrateLegacyGridHistory } from '../../utils/collectionHistory';
import { starDataFromCollectionGrid } from '../../utils/collectionHistoryModel';
import { saveShareCard, buildExportPayload, classifyEditionTier } from '../../utils/exportCanvas';
import { gridExportEventFromRecord, logGridExport } from '../../utils/gridExportLog';
import {
  applyLens,
  buildPool,
  gridRecordFromProposal,
  lensOptions,
  proposeGrid,
  rationaleBrief,
  rebuildRationale,
  type BuilderCard,
  type CollectionLens,
  type GridProposal,
} from '../../utils/gridBuilder';
import styles from './GridBuilder.module.css';

interface Props {
  onCreateFromGrid: (grid: GridRecord) => Promise<unknown>;
  onPacketCreated: () => void;
}

/**
 * Collection Grid Builder — the studio. Saved collection → lens →
 * proposed 3×3 → slot swaps → export → Idea Packet with the curation
 * rationale attached as a creative brief for CREATE.
 */
export const GridBuilder: React.FC<Props> = ({ onCreateFromGrid, onPacketCreated }) => {
  const [pool, setPool] = useState<BuilderCard[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [lens, setLens] = useState<CollectionLens>({});
  const [proposal, setProposal] = useState<GridProposal | null>(null);
  const [swapSlot, setSwapSlot] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await migrateLegacyGridHistory();
        const [cards, grids] = await Promise.all([dbGetAllCards(), dbGetAllGrids()]);
        if (!cancelled) setPool(buildPool(cards, grids));
      } catch (caught) {
        if (!cancelled) setLoadError(caught instanceof Error ? caught.message : 'Saved collection could not be loaded.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const options = useMemo(() => (pool ? lensOptions(pool) : null), [pool]);
  const lensedCount = useMemo(() => (pool ? applyLens(pool, lens).length : 0), [pool, lens]);

  function toggle(key: keyof CollectionLens, value: string) {
    setLens(current => ({ ...current, [key]: current[key] === value ? undefined : value }));
    setProposal(null);
    setSwapSlot(null);
  }

  function propose() {
    if (!pool) return;
    const next = proposeGrid(pool, lens);
    setProposal(next);
    setSwapSlot(null);
    setNotice(next.slots.length < 9
      ? `Only ${next.slots.length} cards match this lens — save more material or widen the lens.`
      : '');
  }

  function swapInto(slotIndex: number, replacement: BuilderCard) {
    setProposal(current => {
      if (!current) return current;
      const outgoing = current.slots[slotIndex];
      const slots = [...current.slots];
      slots[slotIndex] = replacement;
      const alternates = [outgoing, ...current.alternates.filter(card => card.key !== replacement.key)];
      const manualSwaps = [...new Set([...current.rationale.manualSwaps, replacement.familyLabel])];
      // Rationale must describe the grid as it now stands, not the original proposal.
      return { slots, alternates, rationale: rebuildRationale(slots, lens, manualSwaps) };
    });
    setSwapSlot(null);
  }

  async function exportGrid() {
    if (!proposal || proposal.slots.length !== 9 || busy) return;
    setBusy('export');
    setNotice('正在生成分享卡……');
    try {
      const grid = gridRecordFromProposal(proposal.slots, proposal.rationale);
      const starData = starDataFromCollectionGrid(grid);
      const message = await saveShareCard(starData, 'full');
      try {
        await dbSaveGrid(grid);
        const tier = classifyEditionTier(buildExportPayload(starData).chosen);
        logGridExport(gridExportEventFromRecord(grid, 'full', tier));
      } catch (bookkeepingErr) {
        console.warn('Post-export bookkeeping failed (export succeeded):', bookkeepingErr);
      }
      setNotice(message);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : '分享卡生成失败，再试一次？');
    } finally {
      setBusy('');
    }
  }

  async function startPacket() {
    if (!proposal || proposal.slots.length !== 9 || busy) return;
    setBusy('packet');
    setNotice('');
    try {
      const grid = gridRecordFromProposal(proposal.slots, proposal.rationale);
      await dbSaveGrid(grid);
      await onCreateFromGrid(grid);
      setNotice('Idea Packet started with the curation brief attached.');
      onPacketCreated();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Idea Packet could not be started.');
    } finally {
      setBusy('');
    }
  }

  if (loadError) return <div className={styles.notice} role="alert">{loadError}</div>;
  if (!pool || !options) {
    return <div className={styles.loading} aria-label="Loading saved collection"><span /><span /><span /></div>;
  }
  if (pool.length === 0) {
    return (
      <div className={styles.empty}>
        <strong>The shelf is empty.</strong>
        <span>Save cards or export grids first — the Grid Builder assembles new 3×3s from saved material.</span>
      </div>
    );
  }

  return (
    <section className={styles.builder}>
      <header className={styles.header}>
        <div>
          <h3>Collection Grid Builder</h3>
          <p>Pick a lens, propose a 3×3, swap what feels off, export. The “why” travels to CREATE.</p>
        </div>
        <span>{lensedCount} of {pool.length} cards in lens</span>
      </header>

      {notice && <div className={styles.notice} role="status">{notice}</div>}

      <div className={styles.lenses}>
        <LensRow label="Star" options={options.actors} active={lens.actor} onToggle={value => toggle('actor', value)} />
        <LensRow label="Vibe" options={options.vibes} active={lens.vibe} onToggle={value => toggle('vibe', value)} />
        {options.families.length > 0 && (
          <LensRow label="Visual family" options={options.families} active={lens.familyId} onToggle={value => toggle('familyId', value)} />
        )}
      </div>

      <button type="button" className={styles.propose} onClick={propose} disabled={lensedCount === 0}>
        {proposal ? 'Re-propose 3×3' : 'Propose 3×3'}
      </button>

      {proposal && (
        <div className={styles.workspace}>
          <div>
            <div className={styles.grid} role="group" aria-label="Proposed 3×3 grid">
              {proposal.slots.map((card, index) => (
                <button
                  key={card.key}
                  type="button"
                  className={styles.slot}
                  aria-pressed={swapSlot === index}
                  title={proposal.rationale.slotReasons[index]}
                  onClick={() => setSwapSlot(current => (current === index ? null : index))}
                >
                  <img src={card.imageUrl} alt={card.title} loading="lazy" />
                  <span>{proposal.rationale.slotReasons[index]}</span>
                </button>
              ))}
            </div>
            {swapSlot !== null && (
              <div className={styles.alternates}>
                <strong>Swap slot {swapSlot + 1} with:</strong>
                {proposal.alternates.length === 0 ? (
                  <span className={styles.noAlternates}>No other cards match this lens.</span>
                ) : (
                  <div className={styles.alternateStrip}>
                    {proposal.alternates.slice(0, 12).map(card => (
                      <button key={card.key} type="button" onClick={() => swapInto(swapSlot, card)} title={card.familyLabel}>
                        <img src={card.imageUrl} alt={card.title} loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className={styles.rationale} aria-label="Curation rationale">
            <h4>Creative brief</h4>
            <pre>{rationaleBrief(proposal.rationale)}</pre>
            <div className={styles.actions}>
              <button type="button" onClick={exportGrid} disabled={Boolean(busy) || proposal.slots.length !== 9}>
                {busy === 'export' ? 'Exporting…' : '📤 Export share card'}
              </button>
              <button type="button" onClick={startPacket} disabled={Boolean(busy) || proposal.slots.length !== 9}>
                {busy === 'packet' ? 'Starting…' : 'Start Idea Packet'}
              </button>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
};

function LensRow({ label, options, active, onToggle }: {
  label: string;
  options: Array<{ value: string; label: string; count: number }>;
  active?: string;
  onToggle: (value: string) => void;
}) {
  return (
    <div className={styles.lensRow}>
      <span className={styles.lensLabel}>{label}</span>
      <div className={styles.chips}>
        {options.slice(0, 12).map(option => (
          <button
            key={option.value}
            type="button"
            className={styles.chip}
            aria-pressed={active === option.value}
            onClick={() => onToggle(option.value)}
          >
            {option.label} <em>{option.count}</em>
          </button>
        ))}
      </div>
    </div>
  );
}
