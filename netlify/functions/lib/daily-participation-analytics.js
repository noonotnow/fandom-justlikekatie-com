import {
  PARTICIPATION_BATCH, PARTICIPATION_COHORTS, PARTICIPATION_STAGES,
  isParticipationDate, validateParticipationEvent,
} from "../../../shared/daily-participation.js";
import { json } from "./public-auth.js";

const DAY_MS = 86400000;
const MIN_GROUP = 10;

export function createParticipationCollector({ auth, getStore, now = () => new Date() }) {
  return async (req, context, body) => {
    const entry = validateParticipationEvent(body);
    if (!entry) return json(400, { error: "Invalid participation event." });
    if (/(bot|crawler|spider|headless|lighthouse|playwright)/i.test(req.headers.get("user-agent") || "")) {
      return json(200, { ok: true, excluded: true });
    }
    try {
      await auth.authenticateAdmin(req, context);
      return json(200, { ok: true, excluded: true });
    } catch (error) {
      if (error?.status !== 401 && error?.status !== 403) {
        return json(503, { error: "Participation authority check unavailable." });
      }
    }
    const timestamp = now().toISOString();
    const today = timestamp.slice(0, 10);
    if (entry.cohortDay) {
      const elapsed = (Date.parse(today) - Date.parse(entry.cohortDay)) / DAY_MS;
      if (entry.event === "daily_participation_cohort_started" ? elapsed !== 0 : elapsed !== entry.returnDay) {
        return json(400, { error: "Invalid participation observation day." });
      }
    }
    try {
      await getStore("engagement", context).setJSON(
        `${PARTICIPATION_BATCH}:${entry.event}:${Date.now()}:${crypto.randomUUID()}`,
        { schemaVersion: 2, ...entry, timestamp }, { onlyIfNew: true },
      );
      return json(200, { ok: true });
    } catch {
      return json(503, { error: "Participation measurement unavailable." });
    }
  };
}

/** Aggregate-only, no visitor join, event records, URLs, or storage keys in the response. */
export function participationReview(records, url, now = new Date()) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!isParticipationDate(from) || !isParticipationDate(to)) {
    return { status: 400, payload: { error: "from and to are required UTC calendar dates." } };
  }
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (end - start !== 28 * DAY_MS || end > now.valueOf()) {
    return { status: 400, payload: { error: "Use a completed 28-day half-open UTC enrollment window." } };
  }
  const observationEnd = new Date(end + 7 * DAY_MS).toISOString();
  const base = {
    schemaVersion: 1,
    range: { from, toExclusive: to, observationEndExclusive: observationEnd.slice(0, 10) },
    minimumGroup: MIN_GROUP,
    unit: "same_browser_cohort",
    overlappingCohorts: true,
    causalEvidence: false,
  };
  if (now.valueOf() < end + 7 * DAY_MS) {
    return { status: 200, payload: { ...base, status: "collecting", cohorts: [], stages: [] } };
  }
  const safe = records.flatMap(record => {
    // Normalize only the known wire shape before validating persisted records.
    if (record.batchKey !== PARTICIPATION_BATCH) return [];
    const data = {
      event: record.event, batchKey: record.batchKey,
      ...(record.stage !== undefined ? { stage: record.stage } : {}),
      ...(record.cohort !== undefined ? { cohort: record.cohort } : {}),
      ...(record.cohortDay !== undefined ? { cohortDay: record.cohortDay } : {}),
      ...(record.returnDay !== undefined ? { returnDay: record.returnDay } : {}),
    };
    const entry = validateParticipationEvent(data);
    if (!entry || typeof record.timestamp !== "string" || !Number.isFinite(Date.parse(record.timestamp))) return [];
    const timestamp = Date.parse(record.timestamp);
    if (timestamp < start || timestamp >= end + 7 * DAY_MS) return [];
    if (entry.cohortDay) {
      const enrolled = Date.parse(entry.cohortDay);
      const day = record.timestamp.slice(0, 10);
      const elapsed = (Date.parse(day) - enrolled) / DAY_MS;
      if (enrolled < start || enrolled >= end
        || (entry.event === "daily_participation_cohort_started" ? elapsed !== 0 : elapsed !== entry.returnDay)) return [];
    }
    return [{ ...entry, timestamp }];
  });
  const cohorts = PARTICIPATION_COHORTS.map(cohort => {
    const starts = safe.filter(entry => entry.cohort === cohort && entry.event === "daily_participation_cohort_started").length;
    const returns = safe.filter(entry => entry.cohort === cohort && entry.event === "daily_participation_cohort_returned").length;
    const suppressed = starts < MIN_GROUP || returns < MIN_GROUP;
    const inconsistent = returns > starts;
    return {
      cohort, suppressed, inconsistent,
      enrolled: suppressed ? null : starts,
      returnedWithin7Days: suppressed ? null : returns,
      returnRate: suppressed || inconsistent ? null : returns / starts,
    };
  });
  const stages = PARTICIPATION_STAGES.map(stage => {
    const count = safe.filter(entry => entry.stage === stage && entry.timestamp < end).length;
    return { stage, count: count < MIN_GROUP ? null : count, suppressed: count < MIN_GROUP };
  });
  return { status: 200, payload: { ...base, status: "ready", cohorts, stages } };
}