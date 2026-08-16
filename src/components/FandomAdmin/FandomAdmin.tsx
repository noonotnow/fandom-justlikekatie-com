import { useEffect, useRef, useState } from 'react';
import { Plan } from '../Plan/Plan';
import { GridBuilder } from '../GridBuilder/GridBuilder';
import {
  downloadPacketHandoff,
  includedPacketOutputs,
  mutateIdeaPacket,
  IdeaPacketError,
  type CreateReceipt,
  type IdeaPacket,
} from '../../utils/ideaPackets';
import { renderPacketOutputs } from '../../utils/createHandoff';
import { completeIdeaPacketHandoff } from '../../utils/createHandoffClient';
import { setPlanOperatorToken } from '../../utils/planPosts';
import { dbGetAllCards, dbGetAllGrids, type CardRecord, type GridRecord } from '../../utils/collectionDB';
import { migrateLegacyGridHistory } from '../../utils/collectionHistory';
import { RACCOON_COURT_RECORD } from '../../data/raccoonCourtRecord';
import styles from './FandomAdmin.module.css';
import { addCustomRuling, advanceRulingIndex, fetchCustomRulings, getAllRulings, migrateLegacyRulings, removeCustomRuling } from '../../utils/courtRulings';

interface Props {
  packets: IdeaPacket[];
  loading: boolean;
  error: string;
  unauthorized: boolean;
  onRefresh: () => Promise<void>;
  onPacketChange: (packet: IdeaPacket) => void;
  onCreateFromGrid: (grid: GridRecord) => Promise<IdeaPacket>;
  onAddSavedCard: (packet: IdeaPacket, card: CardRecord) => Promise<IdeaPacket>;
  onAddSavedGrid: (packet: IdeaPacket, grid: GridRecord) => Promise<IdeaPacket>;
  /** Called when any admin API request returns 401, so the session can be re-checked. */
  onSessionExpired?: () => void;
}

export const FandomAdmin: React.FC<Props> = props => {
  const [view, setView] = useState<'packets' | 'library' | 'builder' | 'plan' | 'court'>('packets');

  return (
    <section className={styles.admin}>
      {/* THESIS: Fandom Admin is a collection workbench, not a second PLAN.
          OWN-WORLD: incumbent charcoal/Canvas surfaces, gold state and action accents, compact native controls.
          STORY: collect visual signals, shape packet context, compile media, then create one canonical Draft.
          FIRST VIEWPORT: packet list and active workspace share one scan line; primary work stays visible without a modal.
          FORM: established Operate surface extended as a master-detail workbench. */}
      <header className={styles.header}>
        <div>
          <h2>Fandom Admin</h2>
          <p>Collect signals → shape systems → move mountains.</p>
        </div>
        <div className={styles.tabs} role="tablist" aria-label="Fandom Admin view">
          <button type="button" role="tab" aria-selected={view === 'packets'} onClick={() => setView('packets')}>
            Idea Packets
          </button>
          <button type="button" role="tab" aria-selected={view === 'library'} onClick={() => setView('library')}>
            Packet staging
          </button>
          <button type="button" role="tab" aria-selected={view === 'builder'} onClick={() => setView('builder')}>
            Grid Builder
          </button>
          <button type="button" role="tab" aria-selected={view === 'plan'} onClick={() => setView('plan')}>
            PLAN schedule
          </button>
          <button type="button" role="tab" aria-selected={view === 'court'} onClick={() => setView('court')}>
            Court rulings
          </button>
        </div>
      </header>

      {view === 'plan' ? <Plan /> : view === 'court' ? (
        <CourtRulingsEditor />
      ) : props.unauthorized ? (
        <AdminAccess onUnlock={async token => {
          setPlanOperatorToken(token);
          await props.onRefresh();
        }} />
      ) : view === 'builder' ? (
        <GridBuilder
          allRecords={true}
          isAdmin={true}
          onCreateFromGrid={props.onCreateFromGrid}
          onPacketCreated={() => setView('packets')}
        />
      ) : (
        <PacketWorkspace
          {...props}
          showLibrary={view === 'library'}
          onLibraryPacketCreated={() => setView('packets')}
          onSessionExpired={props.onSessionExpired}
        />
      )}
    </section>
  );
};

function PacketWorkspace({
  packets,
  loading,
  error,
  onRefresh,
  onPacketChange,
  onCreateFromGrid,
  onAddSavedCard,
  onAddSavedGrid,
  onSessionExpired,
  showLibrary,
  onLibraryPacketCreated,
}: Omit<Props, 'unauthorized'> & {
  showLibrary: boolean;
  onLibraryPacketCreated: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [createReceipt, setCreateReceipt] = useState<CreateReceipt | null>(null);
  const selected = packets.find(packet => packet.id === selectedId) ?? packets[0] ?? null;

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  useEffect(() => {
    setCreateReceipt(selected?.handoff?.receipt ?? null);
  }, [selected?.id, selected?.handoff?.receipt]);

  async function mutate(action: Record<string, unknown>, success?: string) {
    if (!selected || busy) return;
    setBusy(true);
    setNotice('');
    try {
      onPacketChange(await mutateIdeaPacket(selected, action));
      if (success) setNotice(success);
    } catch (caught) {
      if (caught instanceof IdeaPacketError && caught.status === 401) onSessionExpired?.();
      setNotice(caught instanceof Error ? caught.message : 'That packet edit could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function sendToCreate() {
    if (!selected || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const receipt = await completeIdeaPacketHandoff(selected, renderPacketOutputs);
      setCreateReceipt(receipt);
      setNotice(
        receipt.disposition === 'replayed'
          ? 'CREATE confirmed the existing Draft. No duplicate was created.'
          : 'Idea Packet sent to CREATE as one canonical Draft.',
      );
      await onRefresh();
    } catch (caught) {
      if (caught instanceof IdeaPacketError && caught.status === 401) onSessionExpired?.();
      setNotice(caught instanceof Error ? caught.message : 'The Idea Packet could not be sent to CREATE.');
    } finally {
      setBusy(false);
    }
  }

  if (showLibrary) {
    return (
      <SavedCollection
        packets={packets}
        onCreateFromGrid={async grid => {
          await onCreateFromGrid(grid);
          onLibraryPacketCreated();
        }}
        onAddSavedCard={onAddSavedCard}
        onAddSavedGrid={onAddSavedGrid}
      />
    );
  }

  function SavedCollection({
    packets,
    onCreateFromGrid,
    onAddSavedCard,
    onAddSavedGrid,
  }: {
    packets: IdeaPacket[];
    onCreateFromGrid: (grid: GridRecord) => Promise<void>;
    onAddSavedCard: (packet: IdeaPacket, card: CardRecord) => Promise<IdeaPacket>;
    onAddSavedGrid: (packet: IdeaPacket, grid: GridRecord) => Promise<IdeaPacket>;
  }) {
    const [grids, setGrids] = useState<GridRecord[]>([]);
    const [cards, setCards] = useState<CardRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [notice, setNotice] = useState('');
    const [busyKey, setBusyKey] = useState('');
    const [packetSelections, setPacketSelections] = useState<Record<string, string>>({});
    const collecting = packets.filter(packet => packet.state === 'collecting');

    useEffect(() => {
      let cancelled = false;
      async function load() {
        setLoading(true);
        try {
          await migrateLegacyGridHistory();
          const [savedGrids, savedCards] = await Promise.all([dbGetAllGrids(), dbGetAllCards()]);
          if (cancelled) return;
          setGrids(savedGrids.sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
          setCards(savedCards.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || '')));
        } catch (caught) {
          if (!cancelled) setNotice(caught instanceof Error ? caught.message : 'Saved collection could not be loaded.');
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
      void load();
      return () => { cancelled = true; };
    }, []);

    if (loading) return <div className={styles.libraryLoading} aria-label="Loading saved collection"><span /><span /><span /></div>;

    return (
      <section className={styles.library}>
        {notice && <div className={styles.notice} role="status">{notice}</div>}
        <header className={styles.libraryHeader}>
          <div>
            <h3>Packet staging</h3>
            <p>Pull saved grids and results into Idea Packets — browsing and sharing live in the Collection view.</p>
          </div>
          <span>
            {grids.length} {grids.length === 1 ? 'grid' : 'grids'} · {cards.length} {cards.length === 1 ? 'item' : 'items'}
          </span>
        </header>

        <section className={styles.librarySection} aria-labelledby="saved-grids-title">
          <div className={styles.sectionHeading}>
            <div><h4 id="saved-grids-title">Saved grids</h4><p>Each grid can anchor a new Idea Packet.</p></div>
          </div>
          {grids.length === 0 ? (
            <div className={styles.mediaEmpty}>Save a grid to your collection to use it in packet work here.</div>
          ) : (
            <div className={styles.gridHistory}>
              {grids.map(grid => (
                <article key={grid.id}>
                  <div className={styles.historyGrid}>
                    {grid.images.slice(0, 9).map(image => <img key={image.resultId} src={image.imageUrl} alt="" />)}
                  </div>
                  <div>
                    <strong>{grid.vibeEmoji} {grid.actor}</strong>
                    <span>{grid.vibeEn || grid.vibe} · {formatDate(grid.capturedDate)}</span>
                    <small>{grid.legacyCompositeUrl ? 'Grid · recovered legacy export' : `Grid · ${grid.images.length} source results`}</small>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(busyKey)}
                    onClick={async () => {
                      setBusyKey(grid.id);
                      setNotice('');
                      try { await onCreateFromGrid(grid); } catch (caught) {
                        setNotice(caught instanceof Error ? caught.message : 'Idea Packet could not be started.');
                      } finally { setBusyKey(''); }
                    }}
                  >
                    {busyKey === grid.id ? 'Starting…' : 'Start Idea Packet'}
                  </button>
                  {collecting.length === 0 ? (
                    <span className={styles.noPacket}>Start a packet first</span>
                  ) : (
                    <div className={styles.addSaved}>
                      <select
                        aria-label={`Idea Packet for ${grid.actor} ${grid.vibe} grid`}
                        value={packetSelections[grid.id] || ''}
                        onChange={event => setPacketSelections(current => ({ ...current, [grid.id]: event.target.value }))}
                      >
                        <option value="">Choose packet…</option>
                        {collecting.map(packet => <option key={packet.id} value={packet.id}>{packet.actor.name} · {packet.vibe.labelEn}</option>)}
                      </select>
                      <button
                        type="button"
                        disabled={Boolean(busyKey) || !packetSelections[grid.id]}
                        onClick={async () => {
                          const packet = collecting.find(item => item.id === packetSelections[grid.id]);
                          if (!packet) return;
                          setBusyKey(`grid:${grid.id}`);
                          setNotice('');
                          try {
                            await onAddSavedGrid(packet, grid);
                            setNotice('Complete grid added to the Idea Packet.');
                          } catch (caught) {
                            setNotice(caught instanceof Error ? caught.message : 'Saved grid could not be added.');
                          } finally { setBusyKey(''); }
                        }}
                      >
                        {busyKey === `grid:${grid.id}` ? 'Adding…' : 'Add grid to packet'}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={styles.librarySection} aria-labelledby="saved-items-title">
          <div className={styles.sectionHeading}>
            <div><h4 id="saved-items-title">Saved results</h4><p>Saved lightbox results remain independent from packets.</p></div>
          </div>
          {cards.length === 0 ? (
            <div className={styles.mediaEmpty}>Save a lightbox result with ☆ to collect it for later.</div>
          ) : (
            <div className={styles.savedItems}>
              {cards.map(card => (
                <article key={card.imageUrl}>
                  <img src={card.thumbnailUrl} alt="" />
                  <div>
                    <strong>{card.vibeEmoji} {card.actor}</strong>
                    <span>{card.vibeEn || card.vibe} · {formatDate(card.capturedDate)}</span>
                    <small>Saved item{card.gridContext ? ` · grid position ${card.gridContext.position + 1}` : ''}</small>
                  </div>
                  {collecting.length === 0 ? (
                    <span className={styles.noPacket}>Start a packet first</span>
                  ) : (
                    <div className={styles.addSaved}>
                      <select
                        aria-label={`Idea Packet for ${card.actor} ${card.vibe}`}
                        value={packetSelections[card.imageUrl] || ''}
                        onChange={event => setPacketSelections(current => ({ ...current, [card.imageUrl]: event.target.value }))}
                      >
                        <option value="">Choose packet…</option>
                        {collecting.map(packet => <option key={packet.id} value={packet.id}>{packet.actor.name} · {packet.vibe.labelEn}</option>)}
                      </select>
                      <button
                        type="button"
                        disabled={Boolean(busyKey) || !packetSelections[card.imageUrl]}
                        onClick={async () => {
                          const packet = collecting.find(item => item.id === packetSelections[card.imageUrl]);
                          if (!packet) return;
                          setBusyKey(card.imageUrl);
                          setNotice('');
                          try {
                            await onAddSavedCard(packet, card);
                            setNotice('Saved result added to the Idea Packet.');
                          } catch (caught) {
                            setNotice(caught instanceof Error ? caught.message : 'Saved result could not be added.');
                          } finally { setBusyKey(''); }
                        }}
                      >
                        {busyKey === card.imageUrl ? 'Adding…' : 'Add to Idea Packet'}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    );
  }

  if (loading) return <div className={styles.loading} aria-label="Loading Idea Packets"><span /><span /></div>;
  if (error && packets.length === 0) {
    return <div className={styles.error} role="alert"><strong>Idea Packets could not be loaded.</strong><span>{error}</span><button onClick={onRefresh}>Try again</button></div>;
  }
  if (!selected) {
    return <div className={styles.empty}><strong>No Idea Packets yet.</strong><span>Open today’s Vibe Atlas and choose “Start Idea Packet.”</span></div>;
  }

  return (
    <>
      {(notice || error) && <div className={styles.notice} role="status">{notice || error}</div>}
      <div className={styles.workspace}>
        <aside className={styles.packetList} aria-label="Idea Packets">
          <div className={styles.listHeader}>
            <strong>Packets</strong>
            <button type="button" onClick={onRefresh} disabled={busy}>Refresh</button>
          </div>
          {packets.map(packet => (
            <button
              key={packet.id}
              type="button"
              className={styles.packetRow}
              aria-current={packet.id === selected.id}
              onClick={() => setSelectedId(packet.id)}
            >
              <img src={packet.anchor.imageUrls[0]} alt="" />
              <span><strong>{packet.actor.name}</strong><small>{packet.vibe.emoji} {packet.vibe.labelEn} · {packet.media.length} media</small></span>
              <StateLabel state={packet.state} />
            </button>
          ))}
        </aside>

        <main className={styles.detail} aria-busy={busy}>
          <header className={styles.detailHeader}>
            <div>
              <h3>{selected.actor.name} · {selected.vibe.label}</h3>
              <p>{selected.vibe.labelEn} · Created {formatDate(selected.createdAt)}</p>
            </div>
            <StateLabel state={selected.state} />
          </header>

          <section className={styles.anchor}>
            <div className={styles.anchorGrid}>
              {selected.anchor.imageUrls.slice(0, 9).map((url, index) => <img key={`${url}-${index}`} src={url} alt="" />)}
            </div>
            <dl>
              <div><dt>Anchor</dt><dd>{selected.anchor.label}</dd></div>
              <div><dt>Source</dt><dd>{selected.provenance.gridId}</dd></div>
              <div><dt>Captured</dt><dd>{formatDate(selected.provenance.generatedAt)}</dd></div>
              <div><dt>Route</dt><dd>{selected.provenance.sourceRoute}</dd></div>
            </dl>
          </section>

          <section className={styles.mediaSection}>
            <div className={styles.sectionHeading}>
              <div><h4>Curated media</h4><p>{selected.media.length} individual {selected.media.length === 1 ? 'image' : 'images'} available to the packet</p></div>
              {selected.state === 'media_compiled' ? (
                <button type="button" onClick={() => mutate({ type: 'set_state', state: 'collecting' }, 'Collection resumed.')} disabled={busy}>
                  Resume collection
                </button>
              ) : (
                <button type="button" onClick={() => mutate({ type: 'set_state', state: 'media_compiled' }, 'Media compiled. Nothing was scheduled or published.')} disabled={busy || includedPacketOutputs(selected).length === 0}>
                  Mark media compiled
                </button>
              )}
            </div>
            {selected.media.length === 0 ? (
              <div className={styles.mediaEmpty}>Add individual lightbox results to build this packet’s media set.</div>
            ) : (
              <ol className={styles.mediaList}>
                {selected.media.map((media, index) => (
                  <li key={media.id}>
                    <img src={media.imageUrl} alt="" onError={event => event.currentTarget.dataset.stale = 'true'} />
                    <span><strong>{media.title}</strong><small>{media.publisher || media.sourceUrl}</small></span>
                    <div>
                      <button type="button" aria-label={`Move ${media.title} earlier`} disabled={busy || index === 0} onClick={() => mutate({ type: 'move_media', mediaId: media.id, direction: -1 })}>↑</button>
                      <button type="button" aria-label={`Move ${media.title} later`} disabled={busy || index === selected.media.length - 1} onClick={() => mutate({ type: 'move_media', mediaId: media.id, direction: 1 })}>↓</button>
                      <button type="button" aria-label={`Remove ${media.title}`} disabled={busy} onClick={() => mutate({ type: 'remove_media', mediaId: media.id })}>Remove</button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className={styles.outputSection} aria-labelledby="packet-output-title">
            <div className={styles.sectionHeading}>
              <div>
                <h4 id="packet-output-title">Selected output tray</h4>
                <p>Included outputs send in this order. The first included output is CREATE’s primary preview.</p>
              </div>
              <span>{includedPacketOutputs(selected).length} included</span>
            </div>
            <ol className={styles.outputTray}>
              {selected.outputs.map((output, index) => {
                const media = output.kind === 'individual'
                  ? selected.media.find(item => item.id === output.sourceId)
                  : null;
                const grid = output.kind === 'grid'
                  ? selected.grids.find(item => item.id === output.sourceId)
                  : null;
                const primary = output.included
                  && includedPacketOutputs(selected)[0]?.id === output.id;
                return (
                  <li key={output.id} data-included={output.included}>
                    <div className={styles.outputPreview} data-kind={output.kind}>
                      {output.kind === 'grid'
                        ? (grid?.images.map(image => image.imageUrl) || selected.anchor.imageUrls)
                          .slice(0, 9)
                          .map((url, imageIndex) => <img key={`${url}-${imageIndex}`} src={url} alt="" />)
                        : <img src={media?.imageUrl} alt="" />}
                    </div>
                    <label>
                      <input
                        type="checkbox"
                        checked={output.included}
                        disabled={busy || selected.state === 'media_compiled'}
                        onChange={event => mutate({ type: 'toggle_output', outputId: output.id, included: event.target.checked })}
                      />
                      <span>
                        <strong>{output.label}</strong>
                        <small>{output.kind === 'grid' ? 'Full rendered grid PNG' : 'Selected lightbox image PNG'}</small>
                      </span>
                    </label>
                    {primary && <span className={styles.primaryLabel}>Primary preview</span>}
                    <div className={styles.outputActions}>
                      <button type="button" aria-label={`Move ${output.label} earlier`} disabled={busy || selected.state === 'media_compiled' || index === 0} onClick={() => mutate({ type: 'move_output', outputId: output.id, direction: -1 })}>↑</button>
                      <button type="button" aria-label={`Move ${output.label} later`} disabled={busy || selected.state === 'media_compiled' || index === selected.outputs.length - 1} onClick={() => mutate({ type: 'move_output', outputId: output.id, direction: 1 })}>↓</button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <PacketContext key={selected.id} packet={selected} busy={busy} onSave={values => mutate({ type: 'update_context', ...values }, 'Packet context saved.')} />

          <footer className={styles.handoff}>
            <div>
              <strong>Canonical CREATE handoff</strong>
              <span>Registers the exact selected PNGs in MEDIA, then creates or safely recovers one CREATE Draft. No schedule or publish action is sent.</span>
              {createReceipt && (
                <span className={styles.receipt}>
                  Draft {createReceipt.disposition} · source v{createReceipt.sourceVersion} · {createReceipt.mediaSyncState}
                </span>
              )}
            </div>
            <div className={styles.handoffActions}>
              <button type="button" className={styles.fallback} onClick={() => downloadPacketHandoff(selected)}>
                Download JSON fallback
              </button>
              {createReceipt && (
                <a href={createReceipt.createUrl} target="_blank" rel="noreferrer">
                  Open in CREATE
                </a>
              )}
              <button type="button" disabled={busy || selected.state !== 'media_compiled'} onClick={sendToCreate}>
                {busy ? 'Sending…' : 'Send to CREATE'}
              </button>
            </div>
          </footer>
        </main>
      </div>
    </>
  );
}

function PacketContext({ packet, busy, onSave }: {
  packet: IdeaPacket;
  busy: boolean;
  onSave: (values: Pick<IdeaPacket, 'notes' | 'workingAngle' | 'captionSeeds' | 'outputAngles'>) => void;
}) {
  const [values, setValues] = useState(() => ({
    notes: packet.notes,
    workingAngle: packet.workingAngle,
    captionSeeds: packet.captionSeeds,
    outputAngles: packet.outputAngles,
  }));
  return (
    <form className={styles.context} onSubmit={event => { event.preventDefault(); onSave(values); }}>
      <label><span>Collection notes</span><textarea value={values.notes} onChange={event => setValues({ ...values, notes: event.target.value })} /></label>
      <label><span>Working angle</span><textarea value={values.workingAngle} onChange={event => setValues({ ...values, workingAngle: event.target.value })} /></label>
      <label><span>Caption seeds</span><textarea value={values.captionSeeds} onChange={event => setValues({ ...values, captionSeeds: event.target.value })} /></label>
      <label><span>Possible output angles</span><textarea value={values.outputAngles} onChange={event => setValues({ ...values, outputAngles: event.target.value })} placeholder="Carousel, lore, comparison, legendary entry…" /></label>
      <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save packet context'}</button>
    </form>
  );
}


function CourtRulingsEditor() {
  const [rulings, setRulings] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const shared = await fetchCustomRulings();
        const merged = await migrateLegacyRulings(shared);
        if (!cancelled) setRulings(merged);
      } catch (caught) {
        if (!cancelled) setNotice(caught instanceof Error ? caught.message : 'The shared court record could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setNotice('');
    try {
      setRulings(await addCustomRuling(trimmed));
      setDraft('');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'The ruling could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(index: number) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      setRulings(await removeCustomRuling(index, rulings[index]));
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'The ruling could not be removed.');
      // The record may have changed on the server — re-sync.
      try { setRulings(await fetchCustomRulings()); } catch { /* keep current view */ }
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className={styles.loading} aria-label="Loading court rulings"><span /><span /></div>;

  return (
    <section className={styles.courtEditor}>
      <header className={styles.courtHeader}>
        <div>
          <h3>Court rulings</h3>
          <p>Add lore entries that appear in the raccoon judiciary popup on the unlock screen. Custom rulings are shared across all editors.</p>
        </div>
        <span className={styles.courtCount}>{RACCOON_COURT_RECORD.length} built-in · {rulings.length} custom</span>
      </header>

      <form className={styles.courtForm} onSubmit={handleAdd}>
        <label className={styles.courtLabel}>
          <span>New ruling</span>
          <textarea
            className={styles.courtTextarea}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            placeholder={'Case #999: Your ruling here. — Associate Justice 🦝'}
            rows={3}
          />
        </label>
        <button type="submit" disabled={busy || !draft.trim()}>{busy ? 'Saving…' : 'Add ruling'}</button>
      </form>

      {notice && <div className={styles.notice} role="status">{notice}</div>}

      {rulings.length > 0 && (
        <section className={styles.courtList} aria-label="Custom rulings">
          <h4>Custom rulings ({rulings.length})</h4>
          <ol>
            {rulings.map((ruling, index) => (
              <li key={index}>
                <span>{ruling}</span>
                <button
                  type="button"
                  aria-label={`Remove ruling ${index + 1}`}
                  disabled={busy}
                  onClick={() => void handleRemove(index)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className={styles.courtList} aria-label="Built-in rulings">
        <h4>Built-in rulings ({RACCOON_COURT_RECORD.length})</h4>
        <ol>
          {RACCOON_COURT_RECORD.map((ruling, index) => (
            <li key={index} className={styles.courtBuiltIn}>
              <span>{ruling}</span>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}

function AdminAccess({ onUnlock }: { onUnlock: (token: string) => Promise<void> }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [showLore, setShowLore] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [customRulings, setCustomRulings] = useState<string[]>([]);
  const allRulings = getAllRulings(customRulings);

  useEffect(() => {
    let cancelled = false;
    fetchCustomRulings()
      .then(rulings => { if (!cancelled) setCustomRulings(rulings); })
      .catch(() => { /* built-in rulings still show */ });
    return () => { cancelled = true; };
  }, []);

  function handleMouseEnter() {
    hoverTimer.current = setTimeout(() => {
      setShowLore(true);
    }, 2000);
  }

  function handleMouseLeave() {
    if (hoverTimer.current !== null) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    if (showLore) {
      setShowLore(false);
      setQuoteIndex(i => advanceRulingIndex(i, allRulings.length));
    }
  }

  return (
    <form className={styles.access} onSubmit={async event => {
      event.preventDefault();
      setBusy(true);
      try { await onUnlock(token.trim()); } finally { setBusy(false); }
    }}>
      <h3>Unlock Fandom Admin</h3>
      <p>Enter the operator key for this browser session.</p>
      <label><span>Operator key</span><input type="password" value={token} onChange={event => setToken(event.target.value)} required /></label>
      <button type="submit" disabled={busy || !token.trim()}>{busy ? 'Unlocking…' : 'Unlock workspace'}</button>
      {/* 🦝 The raccoon judiciary presides. Court is in session. */}
      <span
        className={styles.raccoonJudiciary}
        aria-hidden="true"
        title="The raccoon judiciary is in session. All appeals denied."
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        🦝⚖️🦝
        {showLore && (
          <span className={styles.raccoonLore}>
            {allRulings[quoteIndex]}
          </span>
        )}
      </span>
    </form>
  );
}

function StateLabel({ state }: { state: IdeaPacket['state'] }) {
  return <span className={styles.state} data-state={state}>{state === 'media_compiled' ? 'Media compiled' : 'Collecting'}</span>;
}

function formatDate(value: string) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}
