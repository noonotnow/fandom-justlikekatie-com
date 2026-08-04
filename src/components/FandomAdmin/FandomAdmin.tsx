import { useEffect, useState } from 'react';
import { Plan } from '../Plan/Plan';
import {
  downloadPacketHandoff,
  mutateIdeaPacket,
  type IdeaPacket,
} from '../../utils/ideaPackets';
import { setPlanOperatorToken } from '../../utils/planPosts';
import styles from './FandomAdmin.module.css';

interface Props {
  packets: IdeaPacket[];
  loading: boolean;
  error: string;
  unauthorized: boolean;
  onRefresh: () => Promise<void>;
  onPacketChange: (packet: IdeaPacket) => void;
}

export const FandomAdmin: React.FC<Props> = props => {
  const [view, setView] = useState<'packets' | 'plan'>('packets');

  return (
    <section className={styles.admin}>
      {/* THESIS: Fandom Admin is a collection workbench, not a second PLAN.
          OWN-WORLD: incumbent charcoal/Canvas surfaces, gold state and action accents, compact native controls.
          STORY: collect visual signals, shape packet context, compile media, then carry a truthful artifact forward.
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
          <button type="button" role="tab" aria-selected={view === 'plan'} onClick={() => setView('plan')}>
            PLAN schedule
          </button>
        </div>
      </header>

      {view === 'plan' ? <Plan /> : props.unauthorized ? (
        <AdminAccess onUnlock={async token => {
          setPlanOperatorToken(token);
          await props.onRefresh();
        }} />
      ) : (
        <PacketWorkspace {...props} />
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
}: Omit<Props, 'unauthorized'>) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const selected = packets.find(packet => packet.id === selectedId) ?? packets[0] ?? null;

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  async function mutate(action: Record<string, unknown>, success?: string) {
    if (!selected || busy) return;
    setBusy(true);
    setNotice('');
    try {
      onPacketChange(await mutateIdeaPacket(selected, action));
      if (success) setNotice(success);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'That packet edit could not be saved.');
    } finally {
      setBusy(false);
    }
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
              <div><h4>Curated media</h4><p>{selected.media.length} selected · order is preserved in handoff</p></div>
              {selected.state === 'media_compiled' ? (
                <button type="button" onClick={() => mutate({ type: 'set_state', state: 'collecting' }, 'Collection resumed.')} disabled={busy}>
                  Resume collection
                </button>
              ) : (
                <button type="button" onClick={() => mutate({ type: 'set_state', state: 'media_compiled' }, 'Media compiled. Nothing was published.')} disabled={busy || selected.media.length === 0}>
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

          <PacketContext key={selected.id} packet={selected} busy={busy} onSave={values => mutate({ type: 'update_context', ...values }, 'Packet context saved.')} />

          <footer className={styles.handoff}>
            <div>
              <strong>Structured handoff</strong>
              <span>Downloads a complete packet artifact. CREATE/PLAN import is deliberately deferred; this does not create a Post or claim it was sent.</span>
            </div>
            <button type="button" disabled={selected.state !== 'media_compiled'} onClick={() => downloadPacketHandoff(selected)}>
              Download handoff JSON
            </button>
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

function AdminAccess({ onUnlock }: { onUnlock: (token: string) => Promise<void> }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
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
    </form>
  );
}

function StateLabel({ state }: { state: IdeaPacket['state'] }) {
  return <span className={styles.state} data-state={state}>{state === 'media_compiled' ? 'Media compiled' : 'Collecting'}</span>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}
