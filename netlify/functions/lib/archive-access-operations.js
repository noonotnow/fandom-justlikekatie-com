import { randomUUID } from "node:crypto";

const BUCKET_PREFIX = "archive-access:hour:";

const NOTIFICATION_STATE_KEY = "archive-access:notification-state";
const NOTIFICATION_REPAIR_STATE_KEY = "archive-access:notification-repairs";
const REPAIR_WARNING_THRESHOLD = 3;
const REPAIR_WARNING_WINDOW_MS = 24 * 60 * 60 * 1000;
const REPAIR_WARNING_DELIVERY_FAILURE_THRESHOLD = 3;
const OUTCOMES = new Set(["sign_in", "upgrade", "billing_delay", "allowed"]);

const SIGNALS = {
  billing: {
    category: "billing_delay",
    countKey: "billing_delay",
    rateKey: "billingDelayRate",
  },
  deniedAccess: {
    category: "authenticated_denial",
    countKey: "upgrade",
    rateKey: "deniedAccessRate",
  },
};
export const ARCHIVE_ACCESS_RETENTION_DAYS = 7;
const RETENTION_MS = ARCHIVE_ACCESS_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const DELETE_BATCH_SIZE = 100;

export function archiveAccessBucketKey(date) {
  return `${BUCKET_PREFIX}${date.toISOString().slice(0, 13)}`;
}

export async function recordArchiveAccessCheck(store, event, date = new Date()) {
  const outcome = OUTCOMES.has(event?.outcome) ? event.outcome : null;
  if (!store || !outcome) return;
  await store.setJSON(
    `${archiveAccessBucketKey(date)}:${date.getTime()}:${randomUUID()}`,
    {
      timestamp: date.toISOString(),
      outcome,
      authenticated: event.authenticated === true,
    },
    { onlyIfNew: true },
  );
}

export async function archiveAccessHealth(store, date = new Date(), hours = 24) {
  const cutoff = date.getTime() - hours * 60 * 60 * 1000;
  const retentionCutoff = date.getTime() - RETENTION_MS;
  const { reportKeys, expiredKeys } = await classifyBlobKeys(store, cutoff, retentionCutoff);
  const records = (await Promise.all(reportKeys.map(key =>
    store.get(key, { type: "json", consistency: "strong" }))))
    .filter(record =>
      OUTCOMES.has(record?.outcome)
      && Number.isFinite(Date.parse(record?.timestamp))
      && Date.parse(record.timestamp) >= cutoff
      && Date.parse(record.timestamp) <= date.getTime());
  const byHour = new Map();
  for (const record of records) {
    const hour = record.timestamp.slice(0, 13);
    const bucket = byHour.get(hour) || {
      hour,
      counts: { sign_in: 0, upgrade: 0, billing_delay: 0, allowed: 0, authenticated_checks: 0 },
    };
    bucket.counts[record.outcome] += 1;
    if (record.authenticated) bucket.counts.authenticated_checks += 1;
    byHour.set(hour, bucket);
  }
  const buckets = [...byHour.values()]
    .sort((left, right) => String(left.hour).localeCompare(String(right.hour)));
  const totals = buckets.reduce((result, bucket) => {
    for (const key of Object.keys(result)) result[key] += Number(bucket.counts?.[key]) || 0;
    return result;
  }, { sign_in: 0, upgrade: 0, billing_delay: 0, allowed: 0, authenticated_checks: 0 });
  const recentCutoff = date.getTime() - 60 * 60 * 1000;
  const recentRecords = records.filter(record => Date.parse(record.timestamp) >= recentCutoff);
  const recentTotals = recentRecords.reduce((result, record) => {
    result[record.outcome] += 1;
    if (record.authenticated) result.authenticated_checks += 1;
    return result;
  }, { upgrade: 0, billing_delay: 0, allowed: 0, authenticated_checks: 0 });
  const denominator = recentTotals.authenticated_checks;
  const billingRate = denominator ? recentTotals.billing_delay / denominator : 0;
  const denialRate = denominator ? recentTotals.upgrade / denominator : 0;
  const consecutiveBillingHours = trailingHoursWith(buckets, "billing_delay");
  const billingStatus = recentTotals.billing_delay >= 5 && billingRate >= 0.5
    ? "critical"
    : (recentTotals.billing_delay >= 3 && billingRate >= 0.2) || consecutiveBillingHours >= 2
      ? "warning"
      : "normal";
  const denialStatus = recentTotals.upgrade >= 25 && denialRate >= 0.6
    ? "critical"
    : recentTotals.upgrade >= 10 && denialRate >= 0.4
      ? "warning"
      : "normal";
  const report = {
    generatedAt: date.toISOString(),
    windowHours: hours,
    totals,
    recentHour: {
      ...recentTotals,
      billingDelayRate: billingRate,
      deniedAccessRate: denialRate,
    },
    status: {
      billing: billingStatus,
      deniedAccess: denialStatus,
      consecutiveBillingHours,
    },
    thresholds: {
      billingWarning: "3+ billing delays and 20%+ of authenticated checks in one hour, or any billing delay in 2 consecutive hours",
      billingCritical: "5+ billing delays and 50%+ of authenticated checks in one hour",
      deniedWarning: "10+ upgrade denials and 40%+ of authenticated checks in one hour",
      deniedCritical: "25+ upgrade denials and 60%+ of authenticated checks in one hour",
      anonymousPreviewsExcluded: true,
    },
    buckets,
  };
  await deleteExpiredBlobs(store, expiredKeys);
  return report;
}

export async function notifyArchiveAccessTransitions({
  store,
  health,
  notify,
  now = new Date(),
  logger = console,
} = {}) {
  if (!store || !health || typeof notify !== "function") return [];
  const notifications = [];
  for (const [signal, definition] of Object.entries(SIGNALS)) {
    const notification = await processSignalTransition({
      store,
      health,
      notify,
      now,
      signal,
      definition,
      logger,
    });
    if (notification) notifications.push(notification);
  }
  const repairWarning = await processRepairWarning({ store, notify, now, logger });
  if (repairWarning) notifications.push(repairWarning);
  return notifications;
}

export async function archiveAccessNotificationDeliveryHealth(store, now = new Date()) {
  const entry = await getWithMetadata(store, NOTIFICATION_STATE_KEY);
  const state = normalizeNotificationState(entry?.data);
  const repairWarningEntry = await getWithMetadata(store, NOTIFICATION_REPAIR_STATE_KEY);
  const repairWarningState = normalizeRepairWarningState(
    repairWarningEntry?.data,
    now.getTime() - REPAIR_WARNING_WINDOW_MS,
  );
  return {
    ...state.delivery,
    repair: state.repair,
    repairWarning: repairWarningState.delivery,
    repairWindow: {
      active: repairWarningState.timestamps.length > 0,
      count: repairWarningState.timestamps.length,
      firstRepairedAt: repairWarningState.timestamps[0] || null,
      lastRepairedAt: repairWarningState.timestamps.at(-1) || null,
      warningSent: repairWarningState.warnedAt !== null,
    },
  };
}

export async function pruneExpiredArchiveAccessChecks(store, date = new Date()) {
  const retentionCutoff = date.getTime() - RETENTION_MS;
  const { expiredKeys } = await classifyBlobKeys(store, Number.POSITIVE_INFINITY, retentionCutoff);
  return deleteExpiredBlobs(store, expiredKeys);
}

function trailingHoursWith(buckets, outcome) {
  let count = 0;
  let previousHour = null;
  for (let index = buckets.length - 1; index >= 0; index -= 1) {
    if ((Number(buckets[index].counts?.[outcome]) || 0) === 0) break;
    const hour = new Date(`${buckets[index].hour}:00:00.000Z`).getTime();
    if (previousHour !== null && previousHour - hour !== 60 * 60 * 1000) break;
    count += 1;
    previousHour = hour;
  }
  return count;
}

async function classifyBlobKeys(store, reportCutoff, retentionCutoff) {
  const reportKeys = [];
  const expiredKeys = [];
  const classify = blob => {
    const timestamp = archiveAccessKeyTimestamp(blob?.key);
    if (timestamp !== null && timestamp < retentionCutoff) expiredKeys.push(blob.key);
    else if (timestamp === null || timestamp >= reportCutoff) reportKeys.push(blob.key);
  };
  const listing = store.list({ prefix: BUCKET_PREFIX, paginate: true });
  if (listing && typeof listing[Symbol.asyncIterator] === "function") {
    for await (const page of listing) {
      for (const blob of page.blobs || []) classify(blob);
    }
  } else {
    for (const blob of (await listing)?.blobs || []) classify(blob);
  }
  return { reportKeys, expiredKeys };
}

function archiveAccessKeyTimestamp(key) {
  if (typeof key !== "string" || !key.startsWith(BUCKET_PREFIX)) return null;
  const remainder = key.slice(BUCKET_PREFIX.length);
  const timestamp = Number(remainder.slice(remainder.indexOf(":") + 1, remainder.lastIndexOf(":")));
  return Number.isFinite(timestamp) ? timestamp : null;
}

async function deleteExpiredBlobs(store, keys) {
  if (typeof store?.delete !== "function") return 0;
  let deleted = 0;
  for (let index = 0; index < keys.length; index += DELETE_BATCH_SIZE) {
    const results = await Promise.allSettled(
      keys.slice(index, index + DELETE_BATCH_SIZE).map(key => store.delete(key)),
    );
    deleted += results.filter(result => result.status === "fulfilled").length;
  }
  return deleted;
}

export function createArchiveAccessRetentionHandler({
  getStore,
  now = () => new Date(),
  logger = console,
} = {}) {
  return async (_req, context) => {
    try {
      const deleted = await pruneExpiredArchiveAccessChecks(getStore(context), now());
      logger.log(`[archive-access-retention] deleted ${deleted} expired archive access checks`);
    } catch (error) {
      logger.error("[archive-access-retention] cleanup failed", error);
    }
  };
}

export function createArchiveAccessOperationsHandler({
  auth,
  getStore,
  now = () => new Date(),
  notify = payload => sendArchiveAccessNotification({ payload }),
  logger = console,
} = {}) {
  return async (req, context) => {
    if (req.method && req.method !== "GET") return response(405, { error: "Method not allowed" });
    try {
      await auth.authenticateAdmin(req, context);
      const store = getStore(context);
      const generatedAt = now();
      const health = await archiveAccessHealth(store, generatedAt);
      try {
        health.notifications = await notifyArchiveAccessTransitions({
          store,
          health,
          notify,
          now: generatedAt,
          logger,
        });
      } catch (error) {
        health.notifications = [];
        logger.error("[archive-access] operator notification failed", {
          message: error instanceof Error ? error.message : "Unknown delivery failure",
        });
      }
      try {
        health.notificationDelivery = await archiveAccessNotificationDeliveryHealth(store, generatedAt);
      } catch (error) {
        health.notificationDelivery = {
          status: "unavailable",
          attemptedAt: null,
          lastSucceededAt: null,
          lastFailedAt: null,
          consecutiveFailures: 0,
          repair: {
            count: 0,
            lastRepairedAt: null,
          },
          repairWarning: emptyRepairWarningDeliveryState(),
          repairWindow: {
            active: false,
            count: 0,
            firstRepairedAt: null,
            lastRepairedAt: null,
            warningSent: false,
          },
        };
        logger.error("[archive-access] notification delivery health unavailable", {
          message: error instanceof Error ? error.message : "Unknown delivery health failure",
        });
      }
      return response(200, health);
    } catch (error) {
      return response(error?.status || 500, {
        error: error?.status === 403 ? "Admin access required." : "Archive access health unavailable.",
      });
    }
  };
}

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

export async function sendArchiveAccessNotification({
  payload,
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const recipients = String(env.FANDOM_ADMIN_EMAILS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  if (!env.RESEND_API_KEY || !env.FANDOM_AUTH_FROM_EMAIL || recipients.length === 0) {
    throw new Error("Archive access notifications are not configured.");
  }
  if (payload.kind === "repair_warning") {
    const title = "WARNING: archive notification state repeatedly repaired";
    const lines = [
      title,
      `Repair count: ${payload.repairCount}`,
      `Window started: ${payload.windowStartedAt}`,
      `Last repaired: ${payload.lastRepairedAt}`,
      `Window: ${payload.windowHours} hours`,
    ];
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.FANDOM_AUTH_FROM_EMAIL,
        to: recipients,
        subject: `[Fandom operations] ${title}`,
        text: lines.join("\n"),
      }),
    });
    if (!response.ok) throw new Error(`Archive access notification delivery failed (${response.status}).`);
    return;
  }
  const percent = `${Math.round(payload.rate * 100)}%`;
  const title = payload.kind === "resolved"
    ? `Resolved: archive ${payload.signalCategory}`
    : `${payload.status.toUpperCase()}: archive ${payload.signalCategory}`;
  const lines = [
    title,
    `Signal category: ${payload.signalCategory}`,
    `Status: ${payload.status}`,
    `Count: ${payload.count}`,
    `Authenticated checks: ${payload.authenticatedChecks}`,
    `Rate: ${percent}`,
    `Window: ${payload.windowMinutes} minutes`,
  ];
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.FANDOM_AUTH_FROM_EMAIL,
      to: recipients,
      subject: `[Fandom operations] ${title}`,
      text: lines.join("\n"),
    }),
  });
  if (!response.ok) throw new Error(`Archive access notification delivery failed (${response.status}).`);
}

async function settleClaim(store, signal, claimId, signalState, deliveryOutcome) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const entry = await getWithMetadata(store, NOTIFICATION_STATE_KEY);
    const state = normalizeNotificationState(entry?.data);
    if (state.signals[signal]?.claimId !== claimId) return;
    const nextState = updateSignalState(state, signal, signalState);
    const write = await conditionalStateWrite(
      store,
      entry,
      deliveryOutcome ? updateDeliveryState(nextState, deliveryOutcome, signalState.updatedAt) : nextState,
    );
    if (write?.modified !== false) return;
  }
  throw new Error("Archive access notification claim could not be settled.");
}

function normalizeNotificationState(value) {
  const root = isPlainObject(value) ? value : {};
  const delivery = isPlainObject(root.delivery)
    ? value.delivery
    : {};
  return {
    updatedAt: typeof root.updatedAt === "string" ? root.updatedAt : null,
    signals: isPlainObject(root.signals) ? root.signals : {},
    repair: {
      count: Number.isSafeInteger(root.repair?.count) && root.repair.count > 0
        ? root.repair.count
        : 0,
      lastRepairedAt: Number.isFinite(Date.parse(root.repair?.lastRepairedAt))
        ? root.repair.lastRepairedAt
        : null,
    },
    delivery: {
      status: delivery.status === "success" || delivery.status === "failure"
        ? delivery.status
        : "never_attempted",
      attemptedAt: typeof delivery.attemptedAt === "string" ? delivery.attemptedAt : null,
      lastSucceededAt: typeof delivery.lastSucceededAt === "string" ? delivery.lastSucceededAt : null,
      lastFailedAt: typeof delivery.lastFailedAt === "string" ? delivery.lastFailedAt : null,
      consecutiveFailures: Number.isSafeInteger(delivery.consecutiveFailures)
        && delivery.consecutiveFailures > 0
        ? delivery.consecutiveFailures
        : 0,
    },
  };
}

function notificationKind(previousStatus, targetStatus) {
  if (previousStatus === "normal" && (targetStatus === "warning" || targetStatus === "critical")) {
    return "incident";
  }
  if (previousStatus === "warning" && targetStatus === "critical") return "incident";
  if (
    (previousStatus === "warning" || previousStatus === "critical")
    && targetStatus === "normal"
  ) return "resolved";
  return null;
}

async function processSignalTransition({ store, health, notify, now, signal, definition, logger }) {
  const targetStatus = health.status?.[signal] || "normal";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const entry = await getWithMetadata(store, NOTIFICATION_STATE_KEY);
    const state = normalizeNotificationState(entry?.data);
    const repairRequired = notificationStateNeedsRepair(entry?.data, signal, entry !== null);
    const current = normalizeSignalState(state.signals[signal]);
    if (current.pending === true) {
      const claimAge = now.getTime() - Date.parse(current.claimedAt);
      if (claimAge >= 0 && claimAge < NOTIFICATION_CLAIM_TTL_MS) return null;
    } else if (current.status === targetStatus) {
      if (repairRequired) {
        const repaired = recordNotificationStateRepair(
          updateSignalState(state, signal, current),
          now,
        );
        const write = await conditionalStateWrite(store, entry, repaired);
        if (write?.modified === false) continue;
        await recordNotificationRepair(store, now);
        logNotificationStateRepair(logger, repaired.repair);
      }
      return null;
    }
    const previousStatus = current.pending === true
      ? current.previousStatus
      : current.status;
    const transitionKind = notificationKind(previousStatus, targetStatus);
    if (!transitionKind) {
      let next = updateSignalState(state, signal, {
        status: targetStatus,
        updatedAt: now.toISOString(),
      });
      if (repairRequired) next = recordNotificationStateRepair(next, now);
      const write = await conditionalStateWrite(store, entry, next);
      if (write?.modified !== false) {
        if (repairRequired) {
          await recordNotificationRepair(store, now);
          logNotificationStateRepair(logger, next.repair);
        }
        return null;
      }
      continue;
    }
    const claimId = randomUUID();
    let claimed = updateSignalState(state, signal, {
      pending: true,
      claimId,
      claimedAt: now.toISOString(),
      previousStatus,
      targetStatus,
      transitionKind,
    });
    if (repairRequired) claimed = recordNotificationStateRepair(claimed, now);
    const claimWrite = await conditionalStateWrite(store, entry, claimed);
    if (claimWrite?.modified === false) continue;
    if (repairRequired) {
      await recordNotificationRepair(store, now);
      logNotificationStateRepair(logger, claimed.repair);
    }
    const payload = {
      kind: transitionKind,
      signalCategory: definition.category,
      status: transitionKind === "resolved" ? "resolved" : targetStatus,
      count: Number(health.recentHour?.[definition.countKey]) || 0,
      authenticatedChecks: Number(health.recentHour?.authenticated_checks) || 0,
      rate: Number(health.recentHour?.[definition.rateKey]) || 0,
      windowMinutes: 60,
    };
    try {
      await notify(payload);
    } catch (error) {
      await settleClaim(store, signal, claimId, {
        status: previousStatus,
        updatedAt: now.toISOString(),
      }, "failure");
      throw error;
    }
    await settleClaim(store, signal, claimId, {
      status: targetStatus,
      notifiedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }, "success");
    return payload;
  }
  throw new Error("Archive access notification state changed too frequently.");
}

function notificationStateNeedsRepair(value, signal, entryExists) {
  if (!entryExists) return false;
  if (!isPlainObject(value) || !isPlainObject(value.signals)) return true;
  if (!isValidDeliveryState(value.delivery)) return true;
  if (!isValidRepairState(value.repair)) return true;
  return value.signals[signal] !== undefined
    && normalizeSignalState(value.signals[signal]) !== value.signals[signal];
}

function isValidDeliveryState(value) {
  if (value === undefined) return true;
  if (!isPlainObject(value)) return false;
  return ["success", "failure", "never_attempted"].includes(value.status)
    && (value.attemptedAt === null || Number.isFinite(Date.parse(value.attemptedAt)))
    && (value.lastSucceededAt === null || Number.isFinite(Date.parse(value.lastSucceededAt)))
    && (value.lastFailedAt === null || Number.isFinite(Date.parse(value.lastFailedAt)))
    && Number.isSafeInteger(value.consecutiveFailures)
    && value.consecutiveFailures >= 0;
}

function isValidRepairState(value) {
  if (value === undefined) return true;
  return isPlainObject(value)
    && Number.isSafeInteger(value.count)
    && value.count >= 0
    && (
      (value.count === 0 && value.lastRepairedAt === null)
      || (value.count > 0 && Number.isFinite(Date.parse(value.lastRepairedAt)))
    );
}

function recordNotificationStateRepair(state, now) {
  return {
    ...state,
    updatedAt: now.toISOString(),
    repair: {
      count: Math.min(state.repair.count + 1, Number.MAX_SAFE_INTEGER),
      lastRepairedAt: now.toISOString(),
    },
  };
}

function logNotificationStateRepair(logger, repair) {
  logger?.warn?.("[archive-access] notification state repaired", {
    repairCount: repair.count,
    repairedAt: repair.lastRepairedAt,
  });
}

async function recordNotificationRepair(store, now) {
  const cutoff = now.getTime() - REPAIR_WARNING_WINDOW_MS;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const entry = await getWithMetadata(store, NOTIFICATION_REPAIR_STATE_KEY);
    const state = normalizeRepairWarningState(entry?.data, cutoff);
    const timestamps = [...state.timestamps, now.toISOString()]
      .slice(-REPAIR_WARNING_THRESHOLD);
    const write = await conditionalWrite(
      store,
      NOTIFICATION_REPAIR_STATE_KEY,
      entry,
      { ...state, timestamps },
    );
    if (write?.modified !== false) return;
  }
  throw new Error("Archive access repair history changed too frequently.");
}

async function processRepairWarning({ store, notify, now, logger }) {
  const cutoff = now.getTime() - REPAIR_WARNING_WINDOW_MS;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const entry = await getWithMetadata(store, NOTIFICATION_REPAIR_STATE_KEY);
    if (!entry) return null;
    const state = normalizeRepairWarningState(entry.data, cutoff);
    if (state.timestamps.length < REPAIR_WARNING_THRESHOLD || state.warnedAt) return null;
    if (state.warningClaim) {
      const claimAge = now.getTime() - Date.parse(state.warningClaim.claimedAt);
      if (claimAge >= 0 && claimAge < NOTIFICATION_CLAIM_TTL_MS) return null;
    }
    const claimId = randomUUID();
    const claimed = { ...state, warningClaim: { claimId, claimedAt: now.toISOString() } };
    const claimWrite = await conditionalWrite(
      store,
      NOTIFICATION_REPAIR_STATE_KEY,
      entry,
      claimed,
    );
    if (claimWrite?.modified === false) continue;
    const payload = {
      kind: "repair_warning",
      repairCount: state.timestamps.length,
      windowStartedAt: state.timestamps[0],
      lastRepairedAt: state.timestamps.at(-1),
      windowHours: REPAIR_WARNING_WINDOW_MS / (60 * 60 * 1000),
    };
    try {
      await notify(payload);
    } catch (error) {
      const delivery = await settleRepairWarningClaim(store, claimId, null, "failure", now);
      if (
        delivery?.consecutiveFailures >= REPAIR_WARNING_DELIVERY_FAILURE_THRESHOLD
        && delivery.escalatedAt === now.toISOString()
      ) {
        logger?.error?.("[archive-access] repair warning delivery repeatedly failed", {
          consecutiveFailures: delivery.consecutiveFailures,
          lastFailedAt: delivery.lastFailedAt,
        });
      }
      throw error;
    }
    await settleRepairWarningClaim(store, claimId, now.toISOString(), "success", now);
    return payload;
  }
  throw new Error("Archive access repair warning state changed too frequently.");
}

async function settleRepairWarningClaim(store, claimId, warnedAt, outcome, now) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const entry = await getWithMetadata(store, NOTIFICATION_REPAIR_STATE_KEY);
    const state = normalizeRepairWarningState(entry?.data, Number.NEGATIVE_INFINITY);
    if (state.warningClaim?.claimId !== claimId) return;
    const delivery = updateRepairWarningDeliveryState(state.delivery, outcome, now);
    const next = { timestamps: state.timestamps, warnedAt, delivery };
    const write = await conditionalWrite(store, NOTIFICATION_REPAIR_STATE_KEY, entry, next);
    if (write?.modified !== false) return delivery;
  }
  throw new Error("Archive access repair warning claim could not be settled.");
}

function normalizeRepairWarningState(value, cutoff) {
  const root = isPlainObject(value) ? value : {};
  const timestamps = Array.isArray(root.timestamps)
    ? root.timestamps
      .filter(timestamp => Number.isFinite(Date.parse(timestamp)) && Date.parse(timestamp) >= cutoff)
      .sort()
      .slice(-REPAIR_WARNING_THRESHOLD)
    : [];
  const warnedAtTimestamp = Date.parse(root.warnedAt);
  const warnedAt = Number.isFinite(warnedAtTimestamp)
    && timestamps.some(timestamp => Date.parse(timestamp) <= warnedAtTimestamp)
    ? root.warnedAt
    : null;
  const warningClaim = isPlainObject(root.warningClaim)
    && typeof root.warningClaim.claimId === "string"
    && Number.isFinite(Date.parse(root.warningClaim.claimedAt))
    ? root.warningClaim
    : null;
  const delivery = normalizeRepairWarningDeliveryState(root.delivery);
  return { timestamps, warnedAt, delivery, ...(warningClaim ? { warningClaim } : {}) };
}

function emptyRepairWarningDeliveryState() {
  return {
    status: "never_attempted",
    attemptedAt: null,
    lastSucceededAt: null,
    lastFailedAt: null,
    consecutiveFailures: 0,
    escalatedAt: null,
  };
}

function normalizeRepairWarningDeliveryState(value) {
  if (!isPlainObject(value)) return emptyRepairWarningDeliveryState();
  return {
    status: value.status === "success" || value.status === "failure"
      ? value.status
      : "never_attempted",
    attemptedAt: Number.isFinite(Date.parse(value.attemptedAt)) ? value.attemptedAt : null,
    lastSucceededAt: Number.isFinite(Date.parse(value.lastSucceededAt))
      ? value.lastSucceededAt
      : null,
    lastFailedAt: Number.isFinite(Date.parse(value.lastFailedAt)) ? value.lastFailedAt : null,
    consecutiveFailures: Number.isSafeInteger(value.consecutiveFailures)
      && value.consecutiveFailures > 0
      ? value.consecutiveFailures
      : 0,
    escalatedAt: Number.isFinite(Date.parse(value.escalatedAt)) ? value.escalatedAt : null,
  };
}

function updateRepairWarningDeliveryState(value, outcome, now) {
  const previous = normalizeRepairWarningDeliveryState(value);
  const attemptedAt = now.toISOString();
  const failed = outcome === "failure";
  const consecutiveFailures = failed
    ? Math.min(previous.consecutiveFailures + 1, Number.MAX_SAFE_INTEGER)
    : 0;
  return {
    status: failed ? "failure" : "success",
    attemptedAt,
    lastSucceededAt: failed ? previous.lastSucceededAt : attemptedAt,
    lastFailedAt: failed ? attemptedAt : previous.lastFailedAt,
    consecutiveFailures,
    escalatedAt: failed && consecutiveFailures >= REPAIR_WARNING_DELIVERY_FAILURE_THRESHOLD
      ? previous.escalatedAt || attemptedAt
      : null,
  };
}

async function conditionalStateWrite(store, entry, state) {
  return conditionalWrite(store, NOTIFICATION_STATE_KEY, entry, state);
}

async function conditionalWrite(store, key, entry, value) {
  return store.setJSON(
    key,
    value,
    entry?.etag ? { onlyIfMatch: entry.etag } : { onlyIfNew: true },
  );
}

function updateSignalState(state, signal, signalState) {
  return {
    ...state,
    updatedAt: signalState.updatedAt || signalState.notifiedAt || signalState.claimedAt,
    signals: {
      ...state.signals,
      [signal]: signalState,
    },
  };
}

function updateDeliveryState(state, outcome, attemptedAt) {
  const previous = normalizeNotificationState(state).delivery;
  const failed = outcome === "failure";
  return {
    ...state,
    updatedAt: attemptedAt,
    delivery: {
      status: failed ? "failure" : "success",
      attemptedAt,
      lastSucceededAt: failed ? previous.lastSucceededAt : attemptedAt,
      lastFailedAt: failed ? attemptedAt : previous.lastFailedAt,
      consecutiveFailures: failed
        ? Math.min(previous.consecutiveFailures + 1, Number.MAX_SAFE_INTEGER)
        : 0,
    },
  };
}

async function getWithMetadata(store, key) {
  if (typeof store.getWithMetadata === "function") {
    const entry = await store.getWithMetadata(key, { type: "text", consistency: "strong" });
    if (!entry) return null;
    const decoded = { ...entry, data: parseNotificationState(entry.data) };
    if (entry.etag) return decoded;
    if (typeof store.getMetadata === "function") {
      const metadata = await store.getMetadata(key, { consistency: "strong" });
      if (metadata?.etag) return { ...decoded, etag: metadata.etag };
    }
    if (typeof store.list !== "function") return decoded;
    const listing = await store.list({ prefix: key });
    const blob = listing?.blobs?.find(candidate => candidate.key === key);
    return { ...decoded, etag: blob?.etag };
  }
  const data = await store.get(key, { type: "text", consistency: "strong" });
  return data === null ? null : { data: parseNotificationState(data) };
}

function parseNotificationState(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeSignalState(value) {
  if (!isPlainObject(value)) return { status: "normal" };
  if (value.pending === true) {
    const previousStatus = value.previousStatus;
    const targetStatus = value.targetStatus;
    if (
      typeof value.claimId === "string"
      && value.claimId.length > 0
      && Number.isFinite(Date.parse(value.claimedAt))
      && ["normal", "warning", "critical"].includes(previousStatus)
      && ["normal", "warning", "critical"].includes(targetStatus)
    ) return value;
    return { status: "normal" };
  }
  return ["normal", "warning", "critical"].includes(value.status)
    ? value
    : { status: "normal" };
}

const NOTIFICATION_CLAIM_TTL_MS = 5 * 60 * 1000;
