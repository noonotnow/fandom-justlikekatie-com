import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PLAN_STATUSES,
  PlanPostsError,
  fetchPlanPosts,
  optimisticPost,
  replacePlanPost,
  setPlanOperatorToken,
  updatePlanPost,
  type PlanPost,
  type PlanPostMutation,
  type PlanStatus,
  type ProductionStage,
} from '../../utils/planPosts';
import {
  addCalendarDays,
  buildEveningSlots,
  etDate,
  etTime,
  formatChinaCompact,
  formatChinaPreview,
  formatEtTime,
  parseScheduledValue,
  todayInEt,
  zonedDateTimeToIso,
} from '../../utils/scheduling';
import { getSeriesLabel } from '../../utils/series';
import styles from './Plan.module.css';

type PlanView = 'schedule' | 'production';
type EnergyMode = 'normal' | 'low-energy';
type PlatformFilter = 'All' | 'Rednote' | 'Weibo';

const STAGES: ProductionStage[] = [
  'Needs Media',
  'Needs Caption',
  'Review Packet',
  'Ready for XHS Admin',
  'Published',
];

export const Plan: React.FC = () => {
  const [posts, setPosts] = useState<PlanPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState('');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<PlanView>('schedule');
  const [energyMode, setEnergyMode] = useState<EnergyMode>('normal');
  const [platform, setPlatform] = useState<PlatformFilter>('All');
  const [canDrag, setCanDrag] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [accessRequired, setAccessRequired] = useState(false);
  const pendingRef = useRef(new Set<string>());
  const dataVersionRef = useRef(0);

  const loadPosts = useCallback(async () => {
    const startedAtVersion = dataVersionRef.current;
    setLoading(true);
    setWarning('');
    try {
      const loaded = await fetchPlanPosts();
      if (startedAtVersion === dataVersionRef.current) setPosts(loaded);
      setAccessRequired(false);
    } catch (error) {
      setAccessRequired(error instanceof PlanPostsError && error.status === 401);
      setWarning(errorMessage(error, 'PLAN posts could not be loaded. Check the Notion connection.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    const query = window.matchMedia('(pointer: fine) and (hover: hover)');
    const update = () => setCanDrag(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const mutatePost = useCallback(async (
    post: PlanPost,
    mutation: PlanPostMutation,
    successMessage?: string,
  ) => {
    if (pendingRef.current.has(post.id)) return false;
    pendingRef.current.add(post.id);
    dataVersionRef.current += 1;
    setWarning('');
    setBusyIds(current => new Set(current).add(post.id));
    setPosts(current => optimisticPost(current, post.id, mutation));
    try {
      const updated = await updatePlanPost(post, mutation);
      setPosts(current => replacePlanPost(current, updated));
      if (successMessage) setWarning(successMessage);
      return true;
    } catch (error) {
      setPosts(current => replacePlanPost(current, post));
      setWarning(errorMessage(
        error,
        'That edit was not saved. The previous value has been restored.',
      ));
      return false;
    } finally {
      pendingRef.current.delete(post.id);
      setBusyIds(current => {
        const next = new Set(current);
        next.delete(post.id);
        return next;
      });
    }
  }, []);

  const selectedPost = posts.find(post => post.id === selectedPostId) ?? null;
  const platformPosts = useMemo(
    () => posts.filter(post => (
      platform === 'All'
      || post.platform === platform
      || post.platform === 'Both'
    )),
    [platform, posts],
  );
  const visiblePosts = useMemo(
    () => energyMode === 'low-energy'
      ? platformPosts.filter(post => (
          post.productionStage === 'Ready for XHS Admin'
          || (!post.mediaBlocked && post.captionBlocked)
          || post.series.startsWith('A')
        ))
      : platformPosts,
    [energyMode, platformPosts],
  );
  const today = todayInEt();
  const dates = [today, addCalendarDays(today, 1), addCalendarDays(today, 2)];

  return (
    <section className={styles.plan}>
      <header className={styles.header}>
        <div>
          <h2>PLAN</h2>
          <p>Set editorial intent in ET. Publishing stays manual.</p>
        </div>
        <button
          type="button"
          className={styles.refresh}
          onClick={loadPosts}
          disabled={loading || busyIds.size > 0}
        >
          {loading ? 'Refreshing…' : 'Refresh Notion'}
        </button>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.segmented} role="tablist" aria-label="PLAN view">
          {(['schedule', 'production'] as PlanView[]).map(item => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={view === item}
              onClick={() => setView(item)}
            >
              {item === 'schedule' ? 'Evening schedule' : 'Production'}
            </button>
          ))}
        </div>
        <div className={styles.filterGroup}>
          <label>
            <span>Platform</span>
            <select value={platform} onChange={event => setPlatform(event.target.value as PlatformFilter)}>
              <option>All</option>
              <option>Rednote</option>
              <option>Weibo</option>
            </select>
          </label>
          <button
            type="button"
            className={styles.energy}
            aria-pressed={energyMode === 'low-energy'}
            onClick={() => setEnergyMode(current => current === 'normal' ? 'low-energy' : 'normal')}
          >
            Low-energy {energyMode === 'low-energy' ? 'on' : 'off'}
          </button>
        </div>
      </div>

      {warning && (
        <div className={styles.notice} role="status" aria-live="polite">
          {warning}
        </div>
      )}

      {accessRequired ? (
        <PlanAccess onUnlock={async token => {
          setPlanOperatorToken(token);
          await loadPosts();
        }} />
      ) : loading ? (
        <div className={styles.loading} aria-label="Loading PLAN posts">
          {Array.from({ length: 3 }, (_, index) => <div key={index} />)}
        </div>
      ) : visiblePosts.length === 0 ? (
        <div className={styles.empty}>
          <strong>No posts match this view.</strong>
          <span>Try another platform or refresh the Notion connection.</span>
        </div>
      ) : view === 'schedule' ? (
        <ScheduleBoard
          posts={visiblePosts}
          dates={dates}
          canDrag={canDrag}
          draggingId={draggingId}
          busyIds={busyIds}
          onDragStart={setDraggingId}
          onDragEnd={() => setDraggingId(null)}
          onSchedule={(post, instant) => mutatePost(post, { scheduledDate: instant })}
          onOpen={post => setSelectedPostId(post.id)}
          onStatus={(post, status) => mutatePost(post, { status })}
        />
      ) : (
        <ProductionBoard
          posts={visiblePosts}
          busyIds={busyIds}
          onOpen={post => setSelectedPostId(post.id)}
          onStatus={(post, status) => mutatePost(post, { status })}
        />
      )}

      <PostDrawer
        key={selectedPostId ?? 'closed'}
        post={selectedPost}
        busy={selectedPost ? busyIds.has(selectedPost.id) : false}
        onClose={() => setSelectedPostId(null)}
        onSchedule={(post, scheduledDate) => mutatePost(
          post,
          { scheduledDate },
          scheduledDate === null ? 'Schedule cleared.' : 'Editorial time saved.',
        )}
        onStatus={(post, status) => mutatePost(post, { status }, `Status changed to ${status}.`)}
      />
    </section>
  );
};

function ScheduleBoard({
  posts,
  dates,
  canDrag,
  draggingId,
  busyIds,
  onDragStart,
  onDragEnd,
  onSchedule,
  onOpen,
  onStatus,
}: {
  posts: PlanPost[];
  dates: string[];
  canDrag: boolean;
  draggingId: string | null;
  busyIds: Set<string>;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onSchedule: (post: PlanPost, instant: string) => Promise<boolean>;
  onOpen: (post: PlanPost) => void;
  onStatus: (post: PlanPost, status: PlanStatus) => Promise<boolean>;
}) {
  const parsed = posts.map(post => ({ post, schedule: parseScheduledValue(post.scheduledDate) }));
  const slotInstants = new Set(dates.flatMap(date => buildEveningSlots(date).map(slot => slot.instant)));
  const unscheduled = parsed.filter(({ schedule }) => (
    schedule.kind === 'empty'
    || schedule.kind === 'invalid'
    || (schedule.kind === 'date-only' && !dates.includes(schedule.date))
    || (schedule.kind === 'instant' && !slotInstants.has(schedule.instant.toISOString()))
  ));

  return (
    <>
      {unscheduled.length > 0 && (
        <section className={styles.unscheduled} aria-labelledby="unscheduled-title">
          <div>
            <h3 id="unscheduled-title">Needs a time</h3>
            <p>Use Schedule on any card. Drag is available with a mouse or trackpad.</p>
          </div>
          <div className={styles.unscheduledRail}>
            {unscheduled.map(({ post }) => (
              <PlanCard
                key={post.id}
                post={post}
                busy={busyIds.has(post.id)}
                canDrag={canDrag}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onOpen={onOpen}
                onStatus={onStatus}
              />
            ))}
          </div>
        </section>
      )}

      <div className={styles.days}>
        {dates.map((date, dayIndex) => {
          const slots = buildEveningSlots(date);
          const legacy = parsed.filter(({ schedule }) => (
            schedule.kind === 'date-only' && schedule.date === date
          ));
          return (
            <section className={styles.day} key={date} aria-labelledby={`day-${date}`}>
              <header>
                <div>
                  <h3 id={`day-${date}`}>{dayIndex === 0 ? 'Tonight' : dayIndex === 1 ? 'Tomorrow' : 'Next evening'}</h3>
                  <span>{formatDay(date)}</span>
                </div>
                <span>ET → China</span>
              </header>

              {legacy.length > 0 && (
                <div className={styles.legacy}>
                  <strong>Date only</strong>
                  <span>Choose Schedule to add a time without shifting this date.</span>
                  {legacy.map(({ post }) => (
                    <PlanCard
                      key={post.id}
                      post={post}
                      busy={busyIds.has(post.id)}
                      canDrag={canDrag}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      onOpen={onOpen}
                      onStatus={onStatus}
                    />
                  ))}
                </div>
              )}

              <div className={styles.slots}>
                {slots.map(slot => {
                  const slotPosts = parsed.filter(({ schedule }) => (
                    schedule.kind === 'instant'
                    && schedule.instant.toISOString() === slot.instant
                  ));
                  const draggingPost = posts.find(post => post.id === draggingId);
                  return (
                    <div
                      key={slot.instant}
                      className={`${styles.slot} ${draggingId ? styles.dropReady : ''}`}
                      onDragOver={event => {
                        if (draggingPost) event.preventDefault();
                      }}
                      onDrop={event => {
                        event.preventDefault();
                        if (draggingPost) void onSchedule(draggingPost, slot.instant);
                        onDragEnd();
                      }}
                    >
                      <div className={styles.slotTime}>
                        <strong>{formatEtTime(slot.instant)}</strong>
                        <span>{formatChinaCompact(slot.instant)}</span>
                      </div>
                      <div className={styles.slotPosts}>
                        {slotPosts.map(({ post }) => (
                          <PlanCard
                            key={post.id}
                            post={post}
                            compact
                            busy={busyIds.has(post.id)}
                            canDrag={canDrag}
                            onDragStart={onDragStart}
                            onDragEnd={onDragEnd}
                            onOpen={onOpen}
                            onStatus={onStatus}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function PlanAccess({ onUnlock }: { onUnlock: (token: string) => Promise<void> }) {
  const [token, setToken] = useState('');
  return (
    <form
      className={styles.access}
      onSubmit={event => {
        event.preventDefault();
        if (token.trim()) void onUnlock(token.trim());
      }}
    >
      <h3>Unlock PLAN</h3>
      <p>Enter the operator key for this browser session.</p>
      <label>
        <span>Operator key</span>
        <input
          type="password"
          value={token}
          onChange={event => setToken(event.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <button type="submit">Unlock scheduling</button>
    </form>
  );
}

function PlanCard({
  post,
  busy,
  compact = false,
  canDrag,
  onDragStart,
  onDragEnd,
  onOpen,
  onStatus,
}: {
  post: PlanPost;
  busy: boolean;
  compact?: boolean;
  canDrag: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onOpen: (post: PlanPost) => void;
  onStatus: (post: PlanPost, status: PlanStatus) => Promise<boolean>;
}) {
  const parsed = parseScheduledValue(post.scheduledDate);
  return (
    <article
      className={`${styles.card} ${compact ? styles.cardCompact : ''}`}
      draggable={canDrag && !busy}
      onDragStart={event => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', post.id);
        onDragStart(post.id);
      }}
      onDragEnd={onDragEnd}
      aria-busy={busy}
    >
      {post.imageUrl && <img src={post.imageUrl} alt="" />}
      <div className={styles.cardBody}>
        <button type="button" className={styles.cardTitle} onClick={() => onOpen(post)}>
          {post.headline}
        </button>
        <div className={styles.chips}>
          {getSeriesLabel(post.series) && <span>{getSeriesLabel(post.series)}</span>}
          <span data-stage={post.productionStage}>{post.productionStage}</span>
        </div>
        {parsed.kind === 'instant' && (
          <p className={styles.cardTime}>
            {formatEtTime(parsed.instant)} ET <span>· {formatChinaCompact(parsed.instant)}</span>
          </p>
        )}
        {parsed.kind === 'date-only' && <p className={styles.cardTime}>Date only · {parsed.date}</p>}
        <div className={styles.cardActions}>
          <button
            type="button"
            data-plan-focus={post.id}
            onClick={() => onOpen(post)}
            disabled={busy}
          >
            Schedule
          </button>
          <label>
            <span className={styles.srOnly}>Status for {post.headline}</span>
            <select
              value={PLAN_STATUSES.includes(post.status as PlanStatus) ? post.status : ''}
              onChange={event => void onStatus(post, event.target.value as PlanStatus)}
              disabled={busy}
            >
              {!PLAN_STATUSES.includes(post.status as PlanStatus) && (
                <option value="">{post.status || 'Unspecified'}</option>
              )}
              {PLAN_STATUSES.map(status => <option key={status}>{status}</option>)}
            </select>
          </label>
        </div>
      </div>
    </article>
  );
}

function ProductionBoard({
  posts,
  busyIds,
  onOpen,
  onStatus,
}: {
  posts: PlanPost[];
  busyIds: Set<string>;
  onOpen: (post: PlanPost) => void;
  onStatus: (post: PlanPost, status: PlanStatus) => Promise<boolean>;
}) {
  return (
    <div className={styles.production}>
      {STAGES.map(stage => {
        const stagePosts = posts.filter(post => post.productionStage === stage);
        return (
          <section key={stage}>
            <header>
              <h3>{stage}</h3>
              <span>{stagePosts.length}</span>
            </header>
            <div>
              {stagePosts.map(post => (
                <PlanCard
                  key={post.id}
                  post={post}
                  busy={busyIds.has(post.id)}
                  canDrag={false}
                  onDragStart={() => {}}
                  onDragEnd={() => {}}
                  onOpen={onOpen}
                  onStatus={onStatus}
                />
              ))}
              {stagePosts.length === 0 && <p className={styles.columnEmpty}>Nothing here</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PostDrawer({
  post,
  busy,
  onClose,
  onSchedule,
  onStatus,
}: {
  post: PlanPost | null;
  busy: boolean;
  onClose: () => void;
  onSchedule: (post: PlanPost, scheduledDate: string | null) => Promise<boolean>;
  onStatus: (post: PlanPost, status: PlanStatus) => Promise<boolean>;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const parsed = parseScheduledValue(post?.scheduledDate);
  const [date, setDate] = useState(() => (
    parsed.kind === 'date-only'
      ? parsed.date
      : parsed.kind === 'instant'
        ? etDate(parsed.instant)
        : todayInEt()
  ));
  const [time, setTime] = useState(() => (
    parsed.kind === 'instant' ? etTime(parsed.instant) : '18:30'
  ));
  const [formError, setFormError] = useState('');
  const drawerRef = useRef<HTMLElement>(null);
  const postId = post?.id;

  useEffect(() => {
    if (!postId) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      const fallback = Array.from(document.querySelectorAll<HTMLElement>('[data-plan-focus]'))
        .find(element => element.dataset.planFocus === postId);
      const target = previousFocus?.isConnected ? previousFocus : fallback;
      target?.focus();
    };
  }, [postId]);

  useEffect(() => {
    if (!post) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, post]);

  if (!post) return null;
  const instant = zonedDateTimeToIso(date, time);
  const quickTimes = ['18:00', '18:30', '20:00', '20:30'];

  async function saveSchedule() {
    if (!instant) {
      setFormError('Choose a valid 30-minute ET slot. This time may not exist at a DST boundary.');
      return;
    }
    if (await onSchedule(post!, instant)) onClose();
  }

  return (
    <div className={styles.drawerBackdrop} role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside
        ref={drawerRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-drawer-title"
      >
        <header>
          <div>
            <h2 id="plan-drawer-title">{post.headline}</h2>
            <p>{getSeriesLabel(post.series) || 'No series'} · {post.platform}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close post details">
            Close
          </button>
        </header>
        <div className={styles.drawerContent}>
          {post.imageUrl && <img className={styles.drawerImage} src={post.imageUrl} alt={`${post.headline} preview`} />}

          <section className={styles.editor}>
            <h3>Editorial publish time</h3>
            {parsed.kind === 'date-only' && (
              <p className={styles.legacyNote}>
                Legacy date-only value: {parsed.date}. It stays unchanged until you save a time.
              </p>
            )}
            <div className={styles.editorFields}>
              <label>
                <span>Date · ET</span>
                <input type="date" value={date} onChange={event => setDate(event.target.value)} />
              </label>
              <label>
                <span>Time · ET</span>
                <select value={time} onChange={event => setTime(event.target.value)}>
                  {buildEveningSlots(date || todayInEt()).map(slot => (
                    <option key={slot.etTime} value={slot.etTime}>
                      {formatEtTime(slot.instant)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.quickTimes} aria-label="Quick schedule times">
              {quickTimes.map(value => (
                <button key={value} type="button" onClick={() => setTime(value)}>
                  {formatEtTime(zonedDateTimeToIso(date, value) ?? '')}
                </button>
              ))}
            </div>
            <p className={styles.chinaPreview}>
              China: <strong>{instant ? formatChinaPreview(instant) : 'Choose a valid ET date and time'}</strong>
            </p>
            {formError && <p className={styles.formError} role="alert">{formError}</p>}
            <div className={styles.editorActions}>
              <button type="button" onClick={saveSchedule} disabled={busy || !instant}>
                {busy ? 'Saving…' : 'Save intended time'}
              </button>
              {post.scheduledDate && (
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={async () => {
                    if (await onSchedule(post, null)) onClose();
                  }}
                  disabled={busy}
                >
                  Clear schedule
                </button>
              )}
            </div>
          </section>

          <section className={styles.statusEditor}>
            <h3>Status</h3>
            <div>
              {PLAN_STATUSES.map(status => (
                <button
                  key={status}
                  type="button"
                  aria-pressed={post.status === status}
                  disabled={busy}
                  onClick={() => void onStatus(post, status)}
                >
                  {status}
                </button>
              ))}
            </div>
          </section>

          <section className={styles.readiness}>
            <h3>Readiness</h3>
            <ul>
              <Readiness label="Media attached" ready={post.mediaAttached} />
              <Readiness label="Caption written" ready={post.captionWritten} />
              <Readiness label="Packet reviewed" ready={post.packetReady} />
            </ul>
          </section>

          <section className={styles.notes}>
            <h3>Production notes</h3>
            <dl>
              <div><dt>Next action</dt><dd>{post.nextAction || 'Not recorded'}</dd></div>
              <div><dt>Requirements</dt><dd>{post.requirements || 'Not recorded'}</dd></div>
              <div><dt>Campaign notes</dt><dd>{post.campaignNotes || 'Not recorded'}</dd></div>
            </dl>
          </section>
        </div>
        {(post.notionUrl || post.createUrl) && (
          <footer>
            {post.notionUrl && <a href={post.notionUrl} target="_blank" rel="noreferrer">Open in Notion ↗</a>}
            {post.createUrl && <a href={post.createUrl} target="_blank" rel="noreferrer">Open in CREATE ↗</a>}
          </footer>
        )}
      </aside>
    </div>
  );
}

function Readiness({ label, ready }: { label: string; ready: boolean | null }) {
  return (
    <li>
      <span>{label}</span>
      <strong data-ready={ready === true ? 'yes' : ready === false ? 'no' : 'unknown'}>
        {ready === true ? 'Complete' : ready === false ? 'Blocked' : 'Not tracked'}
      </strong>
    </li>
  );
}

function formatDay(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T12:00:00Z`));
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof PlanPostsError && error.status === 409) {
    return `${error.message} Your change was rolled back.`;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
