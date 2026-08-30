import { randomUUID } from "node:crypto";
import { json } from "./public-auth.js";

export const WATCH_JOURNAL_SERIES = Object.freeze({
  id: "the-untamed",
  title: "The Untamed",
});

const STORE_NAME = "fandom-watch-journals";
export const PUBLIC_JOURNAL_KEY = "public/the-untamed";
const MAX_EPISODE = 999;
const MAX_TEXT = 10000;
const MAX_SHORT_TEXT = 1000;
const MAX_LIST_ITEMS = 30;
const MAX_PREDICTIONS = 20;
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
      if (req.method === "GET") {
        const audience = new URL(req.url).searchParams.get("audience") || "admin";
        if (audience === "reader") {
          return await handleReaderGet(req, getStore(STORE_NAME, context));
        }
        if (audience !== "admin") throw httpError(400, "Audience is invalid.");

        const authResult = await auth.authenticateAdmin(req, context);
        const accountId = authResult?.user?.accountId;
        if (typeof accountId !== "string" || !accountId) {
          throw httpError(403, "Admin account identity is unavailable.");
        }
        return await handleAdminGet(getStore(STORE_NAME, context), accountId);
      }
      if (req.method !== "POST") {
        return json(405, { error: "Method not allowed." }, { Allow: "GET, POST" });
      }

      const authResult = await auth.authenticateAdmin(req, context);
      const accountId = authResult?.user?.accountId;
      if (typeof accountId !== "string" || !accountId) {
        throw httpError(403, "Admin account identity is unavailable.");
      }
      const store = getStore(STORE_NAME, context);
      validateSameOrigin(req);
      const input = await readJson(req);
      if (input?.action === "publish") {
        const journal = normalizeJournal((await getWithMetadata(
          store,
          journalKey(accountId),
        ))?.data);
        const publication = buildPublication(journal, input, now);
        await writePublication(store, publication);
        return json(200, {
          journal,
          publishedThroughEpisode: publication.approvedThroughEpisode,
        });
      }
      const journal = await mutateJournal(store, accountId, current => applyMutation(
        current,
        input,
        now,
        randomId,
      ));
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

async function handleAdminGet(store, accountId) {
  const existing = await getWithMetadata(store, journalKey(accountId));
  const journal = normalizeJournal(existing?.data);
  return json(200, { journal });
}

async function handleReaderGet(req, store) {
  const params = new URL(req.url).searchParams;
  const safeThroughEpisode = parseEpisode(params.get("safeThroughEpisode"), true);
  const published = await getWithMetadata(store, PUBLIC_JOURNAL_KEY);
  const journal = publishedJournal(published?.data);
  return json(200, {
    journal: filterForSafeThrough(journal, safeThroughEpisode),
    safeThroughEpisode,
  });
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

function buildPublication(journal, input, now) {
  const approvedThroughEpisode = parseEpisode(input.approvedThroughEpisode);
  if (!journal.entries.some(entry => entry.watchedThroughEpisode === approvedThroughEpisode)) {
    throw new TypeError("Approval must end at a filed first-watch boundary.");
  }
  const approvedJournal = sanitizeForPublic(
    filterForSafeThrough(journal, approvedThroughEpisode),
  );

  return {
    schemaVersion: 1,
    status: "published",
    series: WATCH_JOURNAL_SERIES,
    approvedThroughEpisode,
    publishedAt: now().toISOString(),
    journal: approvedJournal,
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
  ) {
    return emptyWatchJournal();
  }
  const journal = normalizeJournal(publication.journal);
  const boundary = contiguousWatchBoundary(journal.entries);
  if (boundary !== publication.approvedThroughEpisode) return emptyWatchJournal();
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
      resolution: prediction.resolution ? {
        resolutionEpisode: prediction.resolution.resolutionEpisode,
        verdict: prediction.resolution.verdict,
        postRevealReaction: prediction.resolution.postRevealReaction,
        resolvedAt: prediction.resolution.resolvedAt,
      } : null,
    })),
    evidence: journal.evidence.map(item => ({
      schemaVersion: 1,
      id: item.id,
      entryId: item.entryId,
      predictionId: item.predictionId,
      unlockEpisode: item.unlockEpisode,
      interpretation: item.interpretation,
      submittedAt: item.submittedAt,
    })),
  };
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