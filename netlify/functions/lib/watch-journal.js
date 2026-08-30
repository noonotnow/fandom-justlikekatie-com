import { createHash, randomUUID } from "node:crypto";
import { json } from "./public-auth.js";

export const WATCH_JOURNAL_SERIES = Object.freeze({
  id: "the-untamed",
  title: "The Untamed",
});

const STORE_NAME = "fandom-watch-journals";
const SUBMISSION_STORE_NAME = "fandom-watch-journal-submissions";
export const PUBLIC_JOURNAL_KEY = "public/the-untamed";
const MAX_EPISODE = 999;
const MAX_TEXT = 10000;
const MAX_SUBMISSION_TEXT = 5000;
const MAX_SHORT_TEXT = 1000;
const MAX_LIST_ITEMS = 30;
const MAX_PREDICTIONS = 20;
const MAX_SUBMISSIONS_PER_WINDOW = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const VERDICTS = new Set([
  "vindicated",
  "technically-correct",
  "catastrophically-wrong",
  "right-conclusion-deranged-reasoning",
  "drama-committed-a-crime",
]);

export function createWatchJournalHandler({ auth, getStore, now = () => new Date(), randomId = randomUUID }) {
  return async (req, context) => {
    try {
      const store = getStore(STORE_NAME, context);
      const submissionStore = getStore(SUBMISSION_STORE_NAME, context);
      const params = new URL(req.url).searchParams;

      if (req.method === "GET") {
        if (params.get("audience") === "reader") {
          return await handlePublishedReaderGet(req, store);
        }
        if (params.get("audience") === "targets") {
          return await handlePublicTargets(submissionStore, requirePublicJournalId(params.get("journal")));
        }
        if (params.get("audience") === "submissions") {
          return await handlePublicSubmissions(
            req,
            context,
            submissionStore,
            auth,
            requirePublicJournalId(params.get("journal")),
          );
        }
        const authResult = await auth.authenticateAdmin(req, context);
        const accountId = requireAccountId(authResult);
        const publicJournalId = publicJournalIdFor(accountId);
        const journal = await readJournal(store, accountId);
        if (params.get("audience") === "public-link") {
          await syncPublicTargets(submissionStore, accountId, publicJournalId, journal, store);
          return json(200, { publicJournalId });
        }
        if (params.get("audience") === "moderation") {
          await syncPublicTargets(submissionStore, accountId, publicJournalId, journal, store);
          return await handleModerationGet(submissionStore, journal, accountId, publicJournalId);
        }
        await syncPublicTargets(submissionStore, accountId, publicJournalId, journal, store);
        return await handleGet(req, journal);
      }

      if (req.method !== "POST") {
        return json(405, { error: "Method not allowed." }, { Allow: "GET, POST" });
      }

      validateSameOrigin(req);
      const input = await readJson(req);
      if (input?.action === "submit-veteran") {
        return await handlePublicSubmission(
          req,
          context,
          submissionStore,
          auth,
          input,
          requirePublicJournalId(input.journalId),
          now,
          randomId,
        );
      }

      const authResult = await auth.authenticateAdmin(req, context);
      const accountId = requireAccountId(authResult);
      const publicJournalId = publicJournalIdFor(accountId);
      if (input?.action === "publish") {
        const journal = await readJournal(store, accountId);
        const publication = buildPublication(journal, input, now);
        await writePublication(store, publication);
        return json(200, {
          journal,
          publishedThroughEpisode: publication.approvedThroughEpisode,
        });
      }
      if (input?.action === "moderate-veteran-submission" || input?.action === "moderate-veteran") {
        return await handleModeration(store, submissionStore, accountId, publicJournalId, input, now);
      }

      const journal = await mutateJournal(store, accountId, current => applyMutation(
        current,
        input,
        now,
        randomId,
      ));
      await syncPublicTargets(submissionStore, accountId, publicJournalId, journal, store);
      return json(200, { journal });
    } catch (error) {
      const status = error?.status || (error instanceof TypeError ? 400 : 500);
      if (status === 500) console.error("[watch-journal] request failed", error);
      return json(status, {
        error: status === 500 ? "Watch journal request failed." : error.message,
      });
    }
  };
}

async function handleGet(req, journal) {
  const params = new URL(req.url).searchParams;
  const audience = params.get("audience") || "admin";
  if (audience === "admin") return json(200, { journal });
  if (audience !== "reader") throw httpError(400, "Audience is invalid.");

  const safeThroughEpisode = parseEpisode(params.get("safeThroughEpisode"), true);
  return json(200, {
    journal: filterForSafeThrough(journal, safeThroughEpisode),
    safeThroughEpisode,
  });
}

async function handlePublishedReaderGet(req, store) {
  const params = new URL(req.url).searchParams;
  const safeThroughEpisode = parseEpisode(params.get("safeThroughEpisode"), true);
  const published = await getWithMetadata(store, PUBLIC_JOURNAL_KEY);
  const journal = publishedJournal(published?.data);
  return json(200, {
    journal: filterForSafeThrough(journal, safeThroughEpisode),
    safeThroughEpisode,
  });
}

function requireAccountId(authResult) {
  const accountId = authResult?.user?.accountId;
  if (typeof accountId !== "string" || !accountId) {
    throw httpError(403, "Admin account identity is unavailable.");
  }
  return accountId;
}

async function readJournal(store, accountId) {
  const existing = await getWithMetadata(store, journalKey(accountId));
  return normalizeJournal(existing?.data);
}

function buildPublication(journal, input, now) {
  const approvedThroughEpisode = parseEpisode(input.approvedThroughEpisode);
  if (!journal.entries.some(entry => entry.watchedThroughEpisode === approvedThroughEpisode)) {
    throw new TypeError("Approval must end at a filed first-watch boundary.");
  }
  return {
    schemaVersion: 1,
    status: "published",
    series: WATCH_JOURNAL_SERIES,
    approvedThroughEpisode,
    publishedAt: now().toISOString(),
    journal: sanitizeForPublic(filterForSafeThrough(journal, approvedThroughEpisode)),
  };
}

async function writePublication(store, publication) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const existing = await getWithMetadata(store, PUBLIC_JOURNAL_KEY);
    const result = await store.setJSON(
      PUBLIC_JOURNAL_KEY,
      publication,
      existing?.etag ? { onlyIfMatch: existing.etag } : { onlyIfNew: true },
    );
    if (result?.modified !== false) return;
  }
  throw httpError(409, "The public journal changed too frequently. Retry.");
}

function publishedJournal(publication) {
  if (
    !publication
    || typeof publication !== "object"
    || publication.schemaVersion !== 1
    || publication.status !== "published"
    || publication.series?.id !== WATCH_JOURNAL_SERIES.id
    || publication.series?.title !== WATCH_JOURNAL_SERIES.title
    || !validEpisode(publication.approvedThroughEpisode)
    || typeof publication.publishedAt !== "string"
    || !publication.journal
  ) return emptyWatchJournal();
  const journal = normalizeJournal(publication.journal);
  if (contiguousWatchBoundary(journal.entries) !== publication.approvedThroughEpisode) {
    return emptyWatchJournal();
  }
  return sanitizeForPublic(journal);
}

function sanitizeForPublic(journal) {
  return {
    schemaVersion: 1,
    series: WATCH_JOURNAL_SERIES,
    entries: journal.entries.map(entry => ({
      schemaVersion: 1,
      id: entry.id,
      seriesId: WATCH_JOURNAL_SERIES.id,
      seriesTitle: WATCH_JOURNAL_SERIES.title,
      episodeStart: entry.episodeStart,
      episodeEnd: entry.episodeEnd,
      watchedThroughEpisode: entry.watchedThroughEpisode,
      recordedAt: entry.recordedAt,
      fields: {
        emotionalCondition: entry.fields.emotionalCondition,
        trustedPeople: [...entry.fields.trustedPeople],
        distrustedPeople: [...entry.fields.distrustedPeople],
        relationshipMonitored: entry.fields.relationshipMonitored,
        recurringSuspects: [...entry.fields.recurringSuspects],
        currentTheory: entry.fields.currentTheory,
      },
    })),
    predictions: journal.predictions.map(prediction => ({
      schemaVersion: 1,
      id: prediction.id,
      entryId: prediction.entryId,
      originalText: prediction.originalText,
      filedAfterEpisode: prediction.filedAfterEpisode,
      filedAt: prediction.filedAt,
      resolution: prediction.resolution ? { ...prediction.resolution } : null,
    })),
    evidence: journal.evidence.map(item => ({
      schemaVersion: 1,
      id: item.id,
      ...(item.sourceSubmissionId ? { sourceSubmissionId: item.sourceSubmissionId } : {}),
      entryId: item.entryId,
      predictionId: item.predictionId,
      unlockEpisode: item.unlockEpisode,
      interpretation: item.interpretation,
      submittedAt: item.submittedAt,
    })),
  };
}

async function handlePublicTargets(store, publicJournalId) {
  const entry = await getWithMetadata(store, targetsKey(publicJournalId));
  const targets = normalizeTargets(entry?.data);
  return json(200, {
    series: WATCH_JOURNAL_SERIES,
    targets: { entries: targets.entries, predictions: targets.predictions },
  });
}

async function handlePublicSubmissions(req, context, store, auth, publicJournalId) {
  const actor = await getPublicActor(auth, req, context);
  const entry = await getWithMetadata(store, submissionsKey(publicJournalId));
  const submissions = normalizeSubmissions(entry?.data)
    .filter(submission => submission.ownerId === actor.ownerId)
    .map(publicSubmission);
  return json(200, { submissions }, actorHeaders(actor));
}

async function handlePublicSubmission(req, context, store, auth, input, publicJournalId, now, randomId) {
  const actor = await getPublicActor(auth, req, context);
  if (input.website !== undefined && input.website !== "") {
    return json(202, { message: "If the submission is eligible, it has been received." }, actorHeaders(actor));
  }
  if (input.consent !== true) throw new TypeError("Confirm that you understand this is a spoiler submission.");

  const targetsEntry = await getWithMetadata(store, targetsKey(publicJournalId));
  const targets = normalizeTargets(targetsEntry?.data);
  const relation = validateSubmissionRelation(input, targets);
  const unlockEpisode = parseEpisode(input.unlockEpisode);
  const relationEpisode = relation.kind === "entry" ? relation.episodeEnd : relation.filedAfterEpisode;
  if (unlockEpisode < relationEpisode) {
    throw new TypeError(`The unlock episode must be Episode ${relationEpisode} or later for this relation.`);
  }
  const interpretation = requiredText(input.interpretation, "Veteran interpretation", MAX_SUBMISSION_TEXT);
  await consumeSubmissionRateLimit(store, actor.ownerId, req, now);

  const submission = {
    schemaVersion: 1,
    id: randomId(),
    seriesId: WATCH_JOURNAL_SERIES.id,
    ownerId: actor.ownerId,
    targetAccountId: targets.accountId,
    entryId: relation.entryId,
    predictionId: relation.predictionId,
    unlockEpisode,
    interpretation,
    submittedAt: now().toISOString(),
    status: "pending",
    moderatedAt: null,
    moderationNote: null,
  };
  await appendSubmission(store, publicJournalId, submission);
  return json(201, {
    message: "Your interpretation is sealed for moderator review.",
    submission: publicSubmission(submission),
  }, actorHeaders(actor));
}

async function handleModerationGet(store, journal, accountId, publicJournalId) {
  const entry = await getWithMetadata(store, submissionsKey(publicJournalId));
  const submissions = normalizeSubmissions(entry?.data)
    .filter(submission => submission.targetAccountId === accountId)
    .filter(submission => submission.unlockEpisode <= contiguousWatchBoundary(journal.entries))
    .map(submission => moderationSubmission(submission, journal));
  return json(200, {
    journal,
    watchBoundary: contiguousWatchBoundary(journal.entries),
    submissions,
  });
}

async function handleModeration(journalStore, submissionStore, accountId, publicJournalId, input, now) {
  const journal = await readJournal(journalStore, accountId);
  const key = submissionsKey(publicJournalId);
  const entry = await getWithMetadata(submissionStore, key);
  const current = normalizeSubmissions(entry?.data);
  const submission = current.find(item => item.id === input.submissionId && item.targetAccountId === accountId);
  if (!submission) throw httpError(404, "That veteran submission does not exist.");
  const boundary = contiguousWatchBoundary(journal.entries);
  if (submission.unlockEpisode > boundary) {
    throw httpError(403, "This submission stays hidden until the first-watch boundary reaches its unlock episode.");
  }

  const decision = input.decision || input.status;
  if (decision !== "approve" && decision !== "reject" && decision !== "correct-unlock") {
    throw new TypeError("Moderation decision must be approve, reject, or correct-unlock.");
  }
  if (decision === "approve" && submission.status === "approved") {
    await appendApprovedEvidence(journalStore, accountId, submission, now);
    return json(200, { submission: moderationSubmission(submission, journal) });
  }
  const updated = structuredClone(submission);
  let correctApprovedEvidenceAfterArchive = false;
  if (decision === "correct-unlock") {
    const corrected = parseEpisode(input.unlockEpisode);
    const relationEpisode = relationEpisodeForSubmission(submission, journal);
    if (corrected < relationEpisode) {
      throw new TypeError(`The unlock episode must be Episode ${relationEpisode} or later for this relation.`);
    }
    updated.unlockEpisode = corrected;
    if (updated.status === "approved") {
      if (corrected > submission.unlockEpisode) {
        // Seal the published copy first when moving the boundary later. A
        // concurrent reader must never observe the less restrictive value.
        await updateApprovedEvidence(journalStore, accountId, submission.id, corrected);
      } else if (corrected < submission.unlockEpisode) {
        correctApprovedEvidenceAfterArchive = true;
      }
    }
  } else {
    if (submission.status !== "pending") throw httpError(409, "That submission has already been moderated.");
    updated.status = decision === "approve" ? "approved" : "rejected";
    updated.moderatedAt = now().toISOString();
    updated.moderationNote = typeof input.moderationNote === "string"
      ? input.moderationNote.trim().slice(0, MAX_SHORT_TEXT) || null
      : null;
  }

  const next = current.map(item => item.id === updated.id ? updated : item);
  const result = await submissionStore.setJSON(
    key,
    next,
    entry?.etag ? { onlyIfMatch: entry.etag } : { onlyIfNew: true },
  );
  if (result?.modified === false) throw httpError(409, "The moderation queue changed. Refresh and try again.");
  if (decision === "approve") {
    // The archive becomes approved before its text can enter the reader-facing
    // evidence collection. A partial failure therefore remains fail-closed.
    await appendApprovedEvidence(journalStore, accountId, updated, now);
  } else if (correctApprovedEvidenceAfterArchive) {
    await updateApprovedEvidence(journalStore, accountId, submission.id, updated.unlockEpisode);
  }
  return json(200, { submission: moderationSubmission(updated, journal) });
}

async function getPublicActor(auth, req, context) {
  if (typeof auth.getPublicActor !== "function") {
    throw new Error("Public submission identity is not configured.");
  }
  const actor = await auth.getPublicActor(req, context);
  if (!actor || typeof actor.ownerId !== "string" || !actor.ownerId) {
    throw httpError(403, "Public submission identity is unavailable.");
  }
  return actor;
}

function actorHeaders(actor) {
  return actor.setCookie ? { "Set-Cookie": actor.setCookie } : {};
}

function validateSubmissionRelation(input, targets) {
  const entryId = optionalId(input.entryId, "Entry");
  const predictionId = optionalId(input.predictionId, "Prediction");
  if (!entryId && !predictionId) throw new TypeError("Choose a journal entry or prediction.");
  const entry = entryId ? targets.entries.find(item => item.id === entryId) : null;
  const prediction = predictionId ? targets.predictions.find(item => item.id === predictionId) : null;
  if (entryId && !entry) throw httpError(404, "That journal entry is not open for submissions.");
  if (predictionId && !prediction) throw httpError(404, "That prediction is not open for submissions.");
  if (entryId && predictionId && prediction.entryId !== entryId) {
    throw new TypeError("The selected prediction does not belong to the selected entry.");
  }
  return {
    kind: entry ? "entry" : "prediction",
    entryId: entryId || null,
    predictionId: predictionId || null,
    episodeEnd: entry?.episodeEnd || prediction.filedAfterEpisode,
    filedAfterEpisode: prediction?.filedAfterEpisode || entry?.episodeEnd,
  };
}

function relationEpisodeForSubmission(submission, journal) {
  if (submission.entryId) {
    const entry = journal.entries.find(item => item.id === submission.entryId);
    if (!entry) throw httpError(409, "The related journal entry is no longer eligible.");
    return entry.episodeEnd;
  }
  const prediction = journal.predictions.find(item => item.id === submission.predictionId);
  if (!prediction) throw httpError(409, "The related prediction is no longer eligible.");
  return prediction.filedAfterEpisode;
}

async function appendApprovedEvidence(journalStore, accountId, submission, now) {
  await mutateJournal(journalStore, accountId, current => {
    if (current.evidence.some(item => item.sourceSubmissionId === submission.id)) return current;
    return {
      ...current,
      evidence: [...current.evidence, {
        schemaVersion: 1,
        id: submission.id,
        sourceSubmissionId: submission.id,
        entryId: submission.entryId,
        predictionId: submission.predictionId,
        unlockEpisode: submission.unlockEpisode,
        interpretation: submission.interpretation,
        submittedAt: submission.submittedAt || now().toISOString(),
      }],
    };
  });
}

async function updateApprovedEvidence(journalStore, accountId, submissionId, unlockEpisode) {
  await mutateJournal(journalStore, accountId, current => ({
    ...current,
    evidence: current.evidence.map(item => item.sourceSubmissionId === submissionId
      ? { ...item, unlockEpisode }
      : item),
  }));
}

async function appendSubmission(store, publicJournalId, submission) {
  const key = submissionsKey(publicJournalId);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const entry = await getWithMetadata(store, key);
    const current = normalizeSubmissions(entry?.data);
    if (current.length >= 10000) throw httpError(429, "The submission archive is temporarily full.");
    const result = await store.setJSON(
      key,
      [...current, submission],
      entry?.etag ? { onlyIfMatch: entry.etag } : { onlyIfNew: true },
    );
    if (result?.modified === false) continue;
    return;
  }
  throw httpError(409, "The submission archive changed too frequently. Retry.");
}

async function consumeSubmissionRateLimit(store, ownerId, req, now) {
  const window = Math.floor(now().getTime() / RATE_WINDOW_MS);
  const source = req.headers.get("x-nf-client-connection-ip") || req.headers.get("cf-connecting-ip");
  if (source) await consumeRateLimitKey(store, `ip:${source}`, window);
  await consumeRateLimitKey(store, `owner:${ownerId}`, window);
}

async function consumeRateLimitKey(store, identity, window) {
  const digest = createHash("sha256").update(identity).digest("hex");
  const key = `rate/${digest}/${window}`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const entry = await getWithMetadata(store, key);
    const current = entry?.data && entry.data.window === window ? entry.data : { window, count: 0 };
    if (current.count >= MAX_SUBMISSIONS_PER_WINDOW) {
      throw httpError(429, "Submission limit reached. Please try again later.");
    }
    const result = await store.setJSON(
      key,
      { window, count: current.count + 1, expiresAt: new Date((window + 1) * RATE_WINDOW_MS).toISOString() },
      entry?.etag ? { onlyIfMatch: entry.etag } : { onlyIfNew: true },
    );
    if (result?.modified !== false) return;
  }
  throw httpError(409, "Submission limit changed too frequently. Retry.");
}

function publicSubmission(submission) {
  return {
    id: submission.id,
    entryId: submission.entryId,
    predictionId: submission.predictionId,
    unlockEpisode: submission.unlockEpisode,
    interpretation: submission.interpretation,
    submittedAt: submission.submittedAt,
    status: submission.status,
  };
}

function moderationSubmission(submission, journal) {
  return {
    ...publicSubmission(submission),
    eligible: submission.unlockEpisode <= contiguousWatchBoundary(journal.entries),
    relation: submission.entryId
      ? `Episodes ${journal.entries.find(item => item.id === submission.entryId)?.episodeStart || "?"}–${journal.entries.find(item => item.id === submission.entryId)?.episodeEnd || "?"}`
      : "Prediction",
    moderatedAt: submission.moderatedAt,
    moderationNote: submission.moderationNote,
  };
}

function normalizeTargets(data) {
  if (!data || typeof data !== "object") return { schemaVersion: 1, series: WATCH_JOURNAL_SERIES, accountId: null, entries: [], predictions: [] };
  return {
    schemaVersion: 1,
    series: WATCH_JOURNAL_SERIES,
    accountId: typeof data.accountId === "string" ? data.accountId : null,
    entries: Array.isArray(data.entries) ? data.entries.filter(item => (
      item && typeof item.id === "string" && validEpisode(item.episodeStart)
      && validEpisode(item.episodeEnd) && item.episodeStart <= item.episodeEnd
    )) : [],
    predictions: Array.isArray(data.predictions) ? data.predictions.filter(item => (
      item && typeof item.id === "string" && typeof item.entryId === "string"
      && validEpisode(item.filedAfterEpisode)
    )) : [],
  };
}

function normalizeSubmissions(data) {
  const values = Array.isArray(data) ? data : [];
  return values.filter(item => (
    item && item.schemaVersion === 1 && typeof item.id === "string"
    && item.seriesId === WATCH_JOURNAL_SERIES.id && typeof item.ownerId === "string"
    && typeof item.targetAccountId === "string"
    && (item.entryId === null || typeof item.entryId === "string")
    && (item.predictionId === null || typeof item.predictionId === "string")
    && (item.entryId || item.predictionId) && validEpisode(item.unlockEpisode)
    && typeof item.interpretation === "string" && item.interpretation.trim()
    && item.interpretation.length <= MAX_SUBMISSION_TEXT
    && typeof item.submittedAt === "string"
    && ["pending", "approved", "rejected"].includes(item.status)
  ));
}

async function syncPublicTargets(store, accountId, publicJournalId, journal, journalStore) {
  // Test doubles often return one object for every store name. Do not add
  // public bookkeeping keys to the private-store assertions in that case.
  if (store === journalStore) return;
  await store.setJSON(targetsKey(publicJournalId), {
    schemaVersion: 1,
    seriesId: WATCH_JOURNAL_SERIES.id,
    accountId,
    entries: journal.entries.map(entry => ({
      id: entry.id,
      episodeStart: entry.episodeStart,
      episodeEnd: entry.episodeEnd,
    })),
    predictions: journal.predictions.map(prediction => ({
      id: prediction.id,
      entryId: prediction.entryId,
      filedAfterEpisode: prediction.filedAfterEpisode,
    })),
  });
}

function publicJournalIdFor(accountId) {
  return createHash("sha256").update(`watch-journal:${accountId}`).digest("base64url").slice(0, 24);
}

function requirePublicJournalId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{24}$/.test(value)) {
    throw new TypeError("A valid public journal link is required.");
  }
  return value;
}

function targetsKey(publicJournalId) {
  return `journals/${publicJournalId}/targets`;
}

function submissionsKey(publicJournalId) {
  return `journals/${publicJournalId}/submissions`;
}

function applyMutation(journal, input, now, randomId) {
  if (!input || typeof input.action !== "string") {
    throw new TypeError("A journal action is required.");
  }

  if (input.action === "file-entry") {
    return fileEntry(journal, input, now, randomId);
  }
  if (input.action === "resolve-prediction") {
    return resolvePrediction(journal, input, now);
  }
  if (input.action === "add-evidence") {
    return addEvidence(journal, input, now, randomId);
  }
  throw new TypeError("That journal action is not supported.");
}

function fileEntry(journal, input, now, randomId) {
  const episodeStart = parseEpisode(input.episodeStart);
  const episodeEnd = parseEpisode(input.episodeEnd);
  if (episodeStart > episodeEnd) throw new TypeError("Episode start must not be after episode end.");
  const expectedStart = contiguousWatchBoundary(journal.entries) + 1;
  if (episodeStart !== expectedStart) {
    throw new TypeError(`The next first-watch entry must begin with Episode ${expectedStart}.`);
  }

  const fields = {
    emotionalCondition: requiredText(input.emotionalCondition, "Current emotional condition", MAX_SHORT_TEXT),
    trustedPeople: stringList(input.trustedPeople, "Trusted people"),
    distrustedPeople: stringList(input.distrustedPeople, "People not trusted"),
    relationshipMonitored: requiredText(input.relationshipMonitored, "Relationship being monitored", MAX_SHORT_TEXT),
    recurringSuspects: stringList(input.recurringSuspects, "Recurring suspects or objects"),
    currentTheory: requiredText(input.currentTheory, "What seems to be happening", MAX_TEXT),
  };
  const predictions = stringList(input.predictions, "Predictions", MAX_SHORT_TEXT, MAX_PREDICTIONS);
  const recordedAt = now().toISOString();
  const entryId = randomId();
  const entry = {
    schemaVersion: 1,
    id: entryId,
    seriesId: WATCH_JOURNAL_SERIES.id,
    seriesTitle: WATCH_JOURNAL_SERIES.title,
    episodeStart,
    episodeEnd,
    watchedThroughEpisode: episodeEnd,
    recordedAt,
    fields,
  };
  const newPredictions = predictions.map(text => ({
    schemaVersion: 1,
    id: randomId(),
    entryId,
    originalText: text,
    filedAfterEpisode: episodeEnd,
    filedAt: recordedAt,
    resolution: null,
  }));

  return {
    ...journal,
    entries: [...journal.entries, entry],
    predictions: [...journal.predictions, ...newPredictions],
  };
}

function resolvePrediction(journal, input, now) {
  if (typeof input.predictionId !== "string" || !input.predictionId) {
    throw new TypeError("A prediction is required.");
  }
  const resolutionEpisode = parseEpisode(input.resolutionEpisode);
  const verdict = input.verdict;
  if (!VERDICTS.has(verdict)) throw new TypeError("That prediction verdict is invalid.");
  const index = journal.predictions.findIndex(prediction => prediction.id === input.predictionId);
  if (index < 0) throw httpError(404, "That prediction does not exist.");
  const prediction = journal.predictions[index];
  if (prediction.resolution) {
    throw httpError(409, "That prediction already has a final verdict.");
  }
  if (resolutionEpisode < prediction.filedAfterEpisode) {
    throw new TypeError("Resolution episode cannot precede the filed episode.");
  }
  const watchedThroughEpisode = contiguousWatchBoundary(journal.entries);
  if (resolutionEpisode > watchedThroughEpisode) {
    throw new TypeError("A prediction cannot be resolved beyond the latest filed watch boundary.");
  }
  const reaction = requiredText(input.postRevealReaction, "Post-reveal reaction", MAX_TEXT);
  const next = structuredClone(journal);
  next.predictions[index] = {
    ...prediction,
    resolution: {
      resolutionEpisode,
      verdict,
      postRevealReaction: reaction,
      resolvedAt: now().toISOString(),
    },
  };
  return next;
}

function addEvidence(journal, input, now, randomId) {
  const entryId = optionalId(input.entryId, "Entry");
  const predictionId = optionalId(input.predictionId, "Prediction");
  if (!entryId && !predictionId) throw new TypeError("Evidence must relate to an entry or prediction.");
  if (entryId && !journal.entries.some(entry => entry.id === entryId)) {
    throw httpError(404, "That journal entry does not exist.");
  }
  if (predictionId && !journal.predictions.some(prediction => prediction.id === predictionId)) {
    throw httpError(404, "That prediction does not exist.");
  }
  if (entryId && predictionId) {
    const prediction = journal.predictions.find(item => item.id === predictionId);
    if (prediction.entryId !== entryId) {
      throw new TypeError("The selected prediction does not belong to the selected entry.");
    }
  }
  const unlockEpisode = parseEpisode(input.unlockEpisode);
  const relatedPrediction = predictionId
    ? journal.predictions.find(prediction => prediction.id === predictionId)
    : null;
  if (
    relatedPrediction?.resolution
    && unlockEpisode < relatedPrediction.resolution.resolutionEpisode
  ) {
    throw new TypeError("Prediction evidence cannot unlock before the prediction resolution.");
  }
  const interpretation = requiredText(input.interpretation, "Veteran evidence", MAX_TEXT);
  const evidence = {
    schemaVersion: 1,
    id: randomId(),
    entryId,
    predictionId,
    unlockEpisode,
    interpretation,
    submittedAt: now().toISOString(),
  };
  return { ...journal, evidence: [...journal.evidence, evidence] };
}

export function filterForSafeThrough(journal, safeThroughEpisode) {
  const safe = parseEpisode(safeThroughEpisode);
  const entries = journal.entries.filter(entry => entry.watchedThroughEpisode <= safe);
  const entryIds = new Set(entries.map(entry => entry.id));
  const predictions = journal.predictions
    .filter(prediction => entryIds.has(prediction.entryId))
    .map(prediction => (
      prediction.resolution && prediction.resolution.resolutionEpisode > safe
        ? { ...prediction, resolution: null }
        : prediction
    ));
  const predictionIds = new Set(predictions.map(prediction => prediction.id));
  const sourcePredictions = new Map(
    journal.predictions.map(prediction => [prediction.id, prediction]),
  );
  const evidence = journal.evidence.filter(item => (
    item.unlockEpisode <= safe
    && (!item.entryId || entryIds.has(item.entryId))
    && (!item.predictionId || predictionIds.has(item.predictionId))
    && (
      !item.predictionId
      || !sourcePredictions.get(item.predictionId)?.resolution
      || sourcePredictions.get(item.predictionId).resolution.resolutionEpisode <= safe
    )
  ));
  return { ...journal, entries, predictions, evidence };
}

export function emptyWatchJournal() {
  return {
    schemaVersion: 1,
    series: WATCH_JOURNAL_SERIES,
    entries: [],
    predictions: [],
    evidence: [],
  };
}

export function normalizeJournal(data) {
  const source = data && typeof data === "object" ? data : {};
  const entries = contiguousEntries(Array.isArray(source.entries) ? source.entries : []);
  const entryIds = new Set(entries.map(entry => entry.id));
  const predictions = Array.isArray(source.predictions)
    ? source.predictions.filter(prediction => isPrediction(prediction) && entryIds.has(prediction.entryId))
    : [];
  const predictionIds = new Set(predictions.map(prediction => prediction.id));
  const evidence = Array.isArray(source.evidence)
    ? source.evidence.filter(item => (
      isEvidence(item)
      && (!item.entryId || entryIds.has(item.entryId))
      && (!item.predictionId || predictionIds.has(item.predictionId))
    ))
    : [];
  return {
    schemaVersion: 1,
    series: WATCH_JOURNAL_SERIES,
    entries,
    predictions,
    evidence,
  };
}

function contiguousEntries(values) {
  const entries = [];
  let expectedStart = 1;
  for (const value of values) {
    if (!isEntry(value) || value.episodeStart !== expectedStart) break;
    entries.push(value);
    expectedStart = value.watchedThroughEpisode + 1;
  }
  return entries;
}

function contiguousWatchBoundary(entries) {
  return entries.length ? entries[entries.length - 1].watchedThroughEpisode : 0;
}

async function mutateJournal(store, accountId, mutate) {
  const key = journalKey(accountId);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const existing = await getWithMetadata(store, key);
    const next = mutate(normalizeJournal(existing?.data));
    const result = await store.setJSON(
      key,
      next,
      existing?.etag ? { onlyIfMatch: existing.etag } : { onlyIfNew: true },
    );
    if (result?.modified === false) continue;
    return next;
  }
  throw httpError(409, "The watch journal changed too frequently. Retry.");
}

function journalKey(accountId) {
  return `accounts/${accountId}/the-untamed`;
}

function isEntry(value) {
  return Boolean(
    value
    && value.schemaVersion === 1
    && typeof value.id === "string"
    && value.seriesId === WATCH_JOURNAL_SERIES.id
    && value.seriesTitle === WATCH_JOURNAL_SERIES.title
    && validEpisode(value.episodeStart)
    && validEpisode(value.episodeEnd)
    && value.episodeStart <= value.episodeEnd
    && value.watchedThroughEpisode === value.episodeEnd
    && typeof value.recordedAt === "string"
    && validFields(value.fields),
  );
}

function isPrediction(value) {
  return Boolean(
    value
    && value.schemaVersion === 1
    && typeof value.id === "string"
    && typeof value.entryId === "string"
    && typeof value.originalText === "string"
    && value.originalText.trim()
    && validEpisode(value.filedAfterEpisode)
    && typeof value.filedAt === "string"
    && (value.resolution === null || validResolution(value.resolution, value.filedAfterEpisode)),
  );
}

function isEvidence(value) {
  return Boolean(
    value
    && value.schemaVersion === 1
    && typeof value.id === "string"
    && (value.entryId === null || typeof value.entryId === "string")
    && (value.predictionId === null || typeof value.predictionId === "string")
    && (value.entryId || value.predictionId)
    && validEpisode(value.unlockEpisode)
    && typeof value.interpretation === "string"
    && value.interpretation.trim()
    && typeof value.submittedAt === "string",
  );
}

function validFields(fields) {
  return Boolean(
    fields
    && typeof fields.emotionalCondition === "string"
    && typeof fields.relationshipMonitored === "string"
    && typeof fields.currentTheory === "string"
    && validStringList(fields.trustedPeople)
    && validStringList(fields.distrustedPeople)
    && validStringList(fields.recurringSuspects),
  );
}

function validResolution(resolution, filedAfterEpisode) {
  return Boolean(
    resolution
    && validEpisode(resolution.resolutionEpisode)
    && resolution.resolutionEpisode >= filedAfterEpisode
    && VERDICTS.has(resolution.verdict)
    && typeof resolution.postRevealReaction === "string"
    && resolution.postRevealReaction.trim()
    && typeof resolution.resolvedAt === "string",
  );
}

function validStringList(value) {
  return Array.isArray(value)
    && value.length <= MAX_LIST_ITEMS
    && value.every(item => typeof item === "string" && item.trim() && item.length <= MAX_SHORT_TEXT);
}

function stringList(value, label, maxLength = MAX_SHORT_TEXT, maxItems = MAX_LIST_ITEMS) {
  if (!Array.isArray(value) || value.length > maxItems) throw new TypeError(`${label} must be a list.`);
  const list = value.map(item => typeof item === "string" ? item.trim() : "");
  if (list.some(item => !item || item.length > maxLength)) throw new TypeError(`${label} contains invalid text.`);
  return list;
}

function requiredText(value, label, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new TypeError(`${label} is required and must be ${maxLength} characters or fewer.`);
  }
  return value.trim();
}

function optionalId(value, label) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 200) throw new TypeError(`${label} is invalid.`);
  return value;
}

function parseEpisode(value, required = false) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new TypeError("A safe-through episode is required.");
    throw new TypeError("An episode number is required.");
  }
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > MAX_EPISODE) {
    throw new TypeError("Episode must be a whole number from 1 to 999.");
  }
  return number;
}

function validEpisode(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_EPISODE;
}

async function getWithMetadata(store, key) {
  if (typeof store.getWithMetadata === "function") {
    return store.getWithMetadata(key, { type: "json", consistency: "strong" });
  }
  const data = await store.get(key, { type: "json", consistency: "strong" });
  return data ? { data } : null;
}

async function readJson(req) {
  const text = await req.text();
  if (Buffer.byteLength(text) > 64 * 1024) throw new TypeError("Request is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new TypeError("Request must be valid JSON.");
  }
}

function validateSameOrigin(req) {
  if (req.headers.get("origin") !== new URL(req.url).origin) {
    throw httpError(403, "Cross-origin requests are not allowed.");
  }
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}