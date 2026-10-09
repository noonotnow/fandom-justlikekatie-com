import { recordDailyParticipationEvent } from './analytics';
import { PARTICIPATION_BATCH, PARTICIPATION_COHORTS, PARTICIPATION_STAGES, isParticipationDate } from '../../shared/daily-participation.js';
import { stripLocalePath } from '../../shared/locale.js';
import { PUBLIC_ROUTE_PATHS } from '../../shared/public-routes.js';
import type { ParticipationStage as Stage, ParticipationCohort as Cohort } from '../../shared/daily-participation.js';

type Entry = { day: string; returned: boolean };
type State = Partial<Record<Cohort, Entry>>;
const STATE_KEY = 'daily-participation-cohorts-v1';
const COHORT_LOCK = 'daily-participation-cohorts-v1';
const LOCK_WAIT_MS = 1000;
const DAY_MS = 86400000;
// Fail closed until the existing account/session boundary has checked operator authority.
let sessionChecked = false;
let operator = false;

export function setDailyParticipationAuthority(isOperator: boolean): void {
  sessionChecked = true;
  operator = isOperator;
  if (isOperator) {
    try {
      localStorage.setItem('daily-participation-internal', '1');
      localStorage.removeItem(STATE_KEY);
    } catch { /* In-memory exclusion remains effective. */ }
  }
}

function allowed(): boolean {
  if (typeof window === 'undefined' || !sessionChecked || operator) return false;
  try {
    const path = stripLocalePath(window.location.pathname).replace(/\/+$/, '');
    const params = new URLSearchParams(window.location.search);
    return (path === PUBLIC_ROUTE_PATHS.vibeAtlas || path === PUBLIC_ROUTE_PATHS.vibeAtlasArchive)
      && params.get('admin') !== 'true' && params.get('view') !== 'admin'
      && localStorage.getItem('daily-participation-internal') !== '1'
      && localStorage.getItem('companion-pilot-internal') !== '1'
      && !/(bot|crawler|spider|headless|lighthouse|playwright)/i.test(navigator.userAgent);
  } catch { return false; }
}

function readState(): State {
  const raw = JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const safe: State = {};
  for (const cohort of PARTICIPATION_COHORTS) {
    const entry = raw[cohort];
    if (entry && isParticipationDate(entry.day) && typeof entry.returned === 'boolean') {
      safe[cohort] = { day: entry.day, returned: entry.returned };
    }
  }
  return safe;
}

function emit(event: string, data: Record<string, string | number>): void {
  recordDailyParticipationEvent({ event, batchKey: PARTICIPATION_BATCH, ...data });
}

async function withCohortLock(update: () => void): Promise<void> {
  try {
    // No unsafe localStorage fallback: unsupported/blocked locks omit cohorts.
    // The fixed origin-wide name contains no browser or account identifier.
    if (!navigator.locks) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOCK_WAIT_MS);
    try {
      await navigator.locks.request(COHORT_LOCK, { signal: controller.signal }, async () => {
        try {
          // Authority, route, and persistent staff markers can change while queued.
          if (allowed()) update();
        } finally {
          // Firefox checkpoints task-buffered localStorage writes at stable state.
          // Keep the origin lock until the writing task ends, before another tab
          // can acquire it and read an older snapshot. A microtask is not enough.
          await new Promise<void>(resolve => setTimeout(resolve, 0));
        }
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch { /* Optional measurement: never retry outside the lock or block an action. */ }
}

function enroll(cohort: Cohort, today: string): void {
  const state = readState();
  if (state[cohort]) return;
  state[cohort] = { day: today, returned: false };
  // Save before emitting so unavailable storage cannot create a cohort on every render.
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
  emit('daily_participation_cohort_started', { cohort, cohortDay: today });
}

/** Called after a real Daily Drop is visible, not on app mount or Collection loading. */
export async function trackDailyParticipationVisit(now = new Date()): Promise<void> {
  if (!allowed()) return;
  await withCohortLock(() => {
    const today = now.toISOString().slice(0, 10);
    enroll('daily_view', today);
    const state = readState();
    for (const cohort of PARTICIPATION_COHORTS) {
      const entry = state[cohort];
      if (!entry || entry.returned) continue;
      const days = (Date.parse(today) - Date.parse(entry.day)) / DAY_MS;
      if (days < 1 || days > 7) continue;
      entry.returned = true;
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
      emit('daily_participation_cohort_returned', { cohort, cohortDay: entry.day, returnDay: days });
    }
  });
}

export async function trackDailyParticipationStage(stage: Stage, now = new Date()): Promise<void> {
  if (!allowed() || !PARTICIPATION_STAGES.includes(stage)) return;
  emit('daily_participation_stage', { stage });
  const cohort = stage === 'guide_opened' ? 'guide'
    : stage === 'grid_preserved' || stage === 'misprint_preserved' ? 'preserved'
    : stage === 'report_receipt_pending' ? 'report_pending' : null;
  if (!cohort) return;
  await withCohortLock(() => enroll(cohort, now.toISOString().slice(0, 10)));
}