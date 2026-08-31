import { randomUUID } from "node:crypto";
import { json } from "./public-auth.js";
import {
  ACTOR_IDENTITY_PROFILES,
  IDENTITY_PROFILE_VERSION,
} from "./actor-identity-profiles.js";
import {
  APPROVED_VERDICTS,
  ELIGIBILITY_STORE,
  auditHeadKey,
  auditRunKey,
  auditRunPrefix,
  auditVerdictKey,
  auditVibeKey,
  eligibilityKey,
  pairingFingerprintFor,
} from "./actor-eligibility.js";
import {
  evaluateCandidates,
  MIN_VIABLE_RESULTS,
  rankCandidates,
  RANKED_BATCH_LIMIT,
} from "./ranking.js";
import { curateDisplayResults } from "./grid-curation.js";

const MAX_BODY_BYTES = 48 * 1024;
const MAX_NOTE_LENGTH = 2000;
const MAX_RETAINED_RUNS = 12;
const MAX_RAW_RESULTS = 36;
const MAX_IDENTITY_ITEMS = 36;
const VERDICTS = new Set([
  "approved",
  "approved_override",
  "needs_query_work",
  "insufficient_material",
  "identity_risk",
  "do_not_schedule",
]);

export function createActorAuditHandler({
  auth,
  getStore,
  actorPacks,
  searchOneQuery,
  now = () => new Date(),
  createRunId = () => randomUUID(),
  curate = curateDisplayResults,
}) {
  return async (req, context) => {
    try {
      const operator = await auth.authenticateAdmin(req, context);
      const store = getStore(ELIGIBILITY_STORE, context);
      const url = new URL(req.url);

      if (req.method === "GET") {
        const actorId = url.searchParams.get("actorId");
        const vibeKey = url.searchParams.get("vibeKey");
        if (!actorId && !vibeKey) {
          return json(200, {
            schemaVersion: 1,
            profileVersion: IDENTITY_PROFILE_VERSION,
            actors: await listActors(store, actorPacks),
          });
        }
        const pair = resolvePair(actorPacks, actorId, vibeKey);
        if (!pair) return json(400, { error: "Unknown actor or Vibe Pack." });
        const report = await readReport(store, pair);
        const runId = url.searchParams.get("runId");
        if (runId) {
          const run = await readRun(store, pair, runId);
          return run ? json(200, { run }) : json(404, { error: "Audit run not found." });
        }
        return json(200, detailResponse(pair, report));
      }

      if (req.method !== "POST") {
        return json(405, { error: "Method not allowed." }, { Allow: "GET, POST" });
      }
      requireSameOrigin(req);
      const input = await readJson(req);
      const pair = resolvePair(actorPacks, input.actorId, input.vibeKey);
      if (!pair) return json(400, { error: "Unknown actor or Vibe Pack." });

      if (input.action === "run") {
        const scope = parseScope(input.scope);
        if (!scope) return json(400, { error: "Audit scope must be representative or full." });
        const run = await runPreflight(pair, searchOneQuery, {
          now,
          createRunId,
          scope,
          curate,
        });
        const report = await appendRun(store, pair, run);
        await writeEligibility(store, pair, null);
        return json(200, {
          actor: await actorSummary(store, actorPacks, pair.actor),
          pairing: pairingSummary(pair, report),
          ...detailResponse(pair, report),
        });
      }

      if (input.action === "verdict") {
        if (!VERDICTS.has(input.verdict)) {
          return json(400, { error: "A valid verdict is required." });
        }
        const notes = boundedText(input.notes, MAX_NOTE_LENGTH);
        if (notes === null) {
          return json(400, { error: "Notes must be text under 2000 characters." });
        }
        const report = await readReport(store, pair);
        if (!report?.currentRun || input.runId !== report.currentRun.runId) {
          return json(409, { error: "This verdict is not for the current audit run. Refresh and try again." });
        }
        if (input.verdict === "approved" && !report.currentRun.materialSufficient) {
          return json(409, { error: "Insufficient material cannot be approved without an override." });
        }
        const stamp = now().toISOString();
        const operatorVerdict = {
          verdict: input.verdict,
          notes,
          decidedAt: stamp,
          decidedBy: operator.user.accountId,
        };
        await store.setJSON(
          auditVerdictKey(pair.actor.id, pair.vibeIdx, report.currentRun.runId),
          operatorVerdict,
        );
        const currentHead = await store.get(auditHeadKey(pair.actor.id, pair.vibeIdx), {
          type: "json",
          consistency: "strong",
        });
        if (currentHead?.currentRunId !== report.currentRun.runId) {
          return json(409, { error: "A newer audit run became current. Review that run before scheduling." });
        }
        await writeEligibility(store, pair, {
          schemaVersion: 1,
          profileVersion: IDENTITY_PROFILE_VERSION,
          actorId: pair.actor.id,
          vibeKey: pair.vibeKey,
          vibeIdx: pair.vibeIdx,
          runId: report.currentRun.runId,
          pairingFingerprint: report.currentRun.pairingFingerprint,
          verdict: input.verdict,
          materialSufficient: report.currentRun.materialSufficient,
          eligible: APPROVED_VERDICTS.has(input.verdict),
          decidedAt: stamp,
        });
        const next = await readReport(store, pair);
        return json(200, {
          actor: await actorSummary(store, actorPacks, pair.actor),
          pairing: pairingSummary(pair, next),
          ...detailResponse(pair, next),
        });
      }

      return json(400, { error: "Unknown audit action." });
    } catch (error) {
      const status = error?.status || (error instanceof TypeError ? 400 : 500);
      if (status === 500) console.error("[actor-audit] request failed", error);
      return json(status, {
        error: status === 500 ? "Actor audit request failed." : error.message,
      });
    }
  };
}

export async function runPreflight(
  pair,
  searchOneQuery,
  {
    now = () => new Date(),
    createRunId = () => randomUUID(),
    scope = "full",
    curate = curateDisplayResults,
  } = {},
) {
  const startedAt = now().toISOString();
  const queries = scope === "representative" ? pair.vibe.queries.slice(0, 3) : pair.vibe.queries;
  const searchReceipts = new Map();
  const candidates = await evaluateCandidates(queries, async query => {
    try {
      const response = await searchOneQuery(query, { debug: true });
      searchReceipts.set(query, { response, error: null });
      return response;
    } catch (error) {
      searchReceipts.set(query, {
        response: null,
        error: boundedText(error?.message || "provider_error", 300) || "provider_error",
      });
      throw error;
    }
  });
  const ranked = rankCandidates(candidates);
  const rankedForCuration = ranked.slice(0, RANKED_BATCH_LIMIT);
  const curated = rankedForCuration.length
    ? await curate(rankedForCuration, { diagnostics: true })
    : { displayResults: [], curation: null, diagnostics: null };
  const diagnostics = curated.diagnostics || emptyDiagnostics();
  const profile = ACTOR_IDENTITY_PROFILES[pair.actor.id];
  const identityEvidence = summarizeIdentityEvidence(candidates, profile);
  const queryRuns = candidates.map(candidate => queryRun(
    candidate,
    searchReceipts.get(candidate.query),
    ranked.findIndex(item => item.query === candidate.query),
  ));
  const completedAt = now().toISOString();
  const materialSufficient = curated.displayResults.length >= 9;

  return {
    runId: createRunId(),
    schemaVersion: 1,
    profileVersion: IDENTITY_PROFILE_VERSION,
    pairingFingerprint: pairingFingerprintFor(pair.actor, pair.vibeIdx),
    scope,
    startedAt,
    completedAt,
    queryCount: queries.length,
    queryRuns,
    rawResults: boundedRawResults(candidates),
    rejections: buildRejectionLedger(queryRuns, diagnostics),
    identityEvidence,
    detectedEvents: diagnostics.eventFamilies || [],
    strongestEvent: diagnostics.strongestEvent || null,
    strongestCompiled: diagnostics.strongestCompiled || null,
    winner: diagnostics.winner
      ? { mode: diagnostics.winner, board: diagnostics[diagnostics.winner === "event" ? "strongestEvent" : "strongestCompiled"] }
      : null,
    alternate: diagnostics.alternate
      ? { mode: diagnostics.alternate, board: diagnostics[diagnostics.alternate === "event" ? "strongestEvent" : "strongestCompiled"] }
      : null,
    curationReceipt: {
      ...(diagnostics.receipt || {}),
      ...(curated.curation || {}),
    },
    displayCount: curated.displayResults.length,
    materialSufficient,
    suggestedState: materialSufficient
      ? identityEvidence.collisionSignals > 0 ? "identity_risk" : "needs_operator_verdict"
      : "insufficient_material",
    operatorVerdict: null,
  };
}

function queryRun(candidate, receipt, rankIndex) {
  const rawCount = receipt?.response?.rawCount
    || receipt?.response?.baiduAttemptLog?.rawCount
    || receipt?.response?.results?.length
    || candidate.count;
  const reasons = [];
  if (receipt?.error) reasons.push("provider_error");
  if (candidate.count < MIN_VIABLE_RESULTS) reasons.push("insufficient_clean_results");
  if (rawCount > candidate.count) reasons.push("junk_source_removed");
  const providerFallback = receipt?.response?.fallbackReason
    || receipt?.response?.baiduAttemptLog?.fallbackReason;
  if (providerFallback) reasons.push(String(providerFallback).slice(0, 160));
  return {
    query: String(candidate.query || "").slice(0, 500),
    provider: candidate.provider || null,
    rawCount,
    cleanCount: candidate.count,
    distinctSources: candidate.distinctSources,
    rank: rankIndex >= 0 ? rankIndex + 1 : null,
    acceptedForCuration: rankIndex >= 0 && rankIndex < RANKED_BATCH_LIMIT,
    rejectionReasons: [...new Set(reasons)],
  };
}

function boundedRawResults(candidates) {
  return candidates.flatMap(candidate => (candidate.results || []).map(result => ({
    query: String(candidate.query || "").slice(0, 500),
    title: String(result.title || "").slice(0, 240),
    description: String(result.description || "").slice(0, 400),
    source: String(result.source || "").slice(0, 120),
    link: String(result.link || "").slice(0, 700),
    thumbnail: String(result.thumbnail || "").slice(0, 700),
  }))).slice(0, MAX_RAW_RESULTS);
}

function buildRejectionLedger(queryRuns, diagnostics) {
  const queryRejections = queryRuns.flatMap(item => item.rejectionReasons.map(reason => ({
    kind: "query",
    query: item.query,
    reason,
  })));
  const imageRejections = (diagnostics.dropped || []).map(item => ({
    kind: "image",
    title: item.title,
    source: item.source,
    thumbnail: item.thumbnail,
    reason: item.dropReason,
  }));
  return [...queryRejections, ...imageRejections].slice(0, MAX_RAW_RESULTS);
}

function summarizeIdentityEvidence(candidates, profile) {
  const canonical = profile?.canonicalNames || [];
  const aliases = profile?.aliases || [];
  const collisions = [...(profile?.commonCollisions || []), ...(profile?.knownContamination || [])]
    .map(value => String(value).toLowerCase());
  const trusted = (profile?.trustedSourcePatterns || []).map(value => String(value).toLowerCase());
  const problematic = (profile?.problematicSourcePatterns || []).map(value => String(value).toLowerCase());
  const items = candidates.flatMap(candidate => candidate.results || []).slice(0, MAX_IDENTITY_ITEMS);
  let canonicalMentions = 0;
  let aliasMentions = 0;
  let collisionSignals = 0;
  let trustedSourceSignals = 0;
  let problematicSourceSignals = 0;
  const evidenceItems = items.map(item => {
    const text = `${item.title || ""} ${item.description || ""}`.toLowerCase();
    const source = String(item.source || "").toLowerCase();
    const canonicalMention = canonical.some(name => text.includes(String(name).toLowerCase()));
    const aliasMention = aliases.some(name => text.includes(String(name).toLowerCase()));
    const collisionMatches = collisions.filter(value => value && text.includes(value));
    const trustedMatch = trusted.some(value => value && source.includes(value));
    const problematicMatch = problematic.some(value => value && source.includes(value));
    if (canonicalMention) canonicalMentions += 1;
    if (aliasMention) aliasMentions += 1;
    collisionSignals += collisionMatches.length;
    if (trustedMatch) trustedSourceSignals += 1;
    if (problematicMatch) problematicSourceSignals += 1;
    return {
      title: String(item.title || "").slice(0, 240),
      source: String(item.source || "").slice(0, 120),
      canonicalMention,
      aliasMention,
      collisionMatches: collisionMatches.slice(0, 4),
      trustedSourceSignal: trustedMatch,
      problematicSourceSignal: problematicMatch,
    };
  });
  return {
    heuristic: "Metadata and source-pattern signals only; these do not prove visual identity.",
    candidateCount: items.length,
    canonicalMentions,
    aliasMentions,
    collisionSignals,
    trustedSourceSignals,
    problematicSourceSignals,
    items: evidenceItems,
  };
}

async function appendRun(store, pair, run) {
  await store.setJSON(auditRunKey(pair.actor.id, pair.vibeIdx, run.runId), run);
  await store.setJSON(auditHeadKey(pair.actor.id, pair.vibeIdx), {
    schemaVersion: 1,
    actorId: pair.actor.id,
    vibeIdx: pair.vibeIdx,
    currentRunId: run.runId,
    updatedAt: run.completedAt,
  });
  return readReport(store, pair);
}

async function listActors(store, actorPacks) {
  return Promise.all(actorPacks.map(actor => actorSummary(store, actorPacks, actor)));
}

async function actorSummary(store, actorPacks, actor) {
  const profile = ACTOR_IDENTITY_PROFILES[actor.id] || emptyProfile(actor);
  const pairings = await Promise.all(actor.vibes.map(async (vibe, vibeIdx) => {
    const pair = resolvePair(actorPacks, actor.id, vibeKeyFor(actor.id, vibeIdx));
    return pairingSummary(pair, await readReport(store, pair));
  }));
  return {
    actorId: actor.id,
    canonicalName: actor.name,
    romanizedName: actor.shortName_en,
    profileVersion: IDENTITY_PROFILE_VERSION,
    ...profile,
    pairings,
  };
}

function pairingSummary(pair, report) {
  const current = report?.currentRun || null;
  const currentVerdict = current && report?.verdictRunId === current.runId ? report.verdict : null;
  const eligible = Boolean(
    current
    && current.profileVersion === IDENTITY_PROFILE_VERSION
    && current.pairingFingerprint === pairingFingerprintFor(pair.actor, pair.vibeIdx)
    && currentVerdict
    && APPROVED_VERDICTS.has(currentVerdict),
  );
  return {
    vibeKey: pair.vibeKey,
    vibeIdx: pair.vibeIdx,
    labels: [pair.vibe.label, pair.vibe.label_en].filter(Boolean),
    queryCount: pair.vibe.queries.length,
    auditState: currentVerdict || current?.suggestedState || "not_run",
    lastRunAt: current?.completedAt || null,
    currentRunId: current?.runId || null,
    verdict: currentVerdict,
    notes: currentVerdict ? report.notes : "",
    verdictAt: currentVerdict ? report.verdictAt : null,
    eligible,
  };
}

function detailResponse(pair, report) {
  return {
    actorId: pair.actor.id,
    vibeKey: pair.vibeKey,
    currentRun: report?.currentRun || null,
    priorRuns: report?.priorRuns || [],
    verdict: report?.verdict || null,
    notes: report?.notes || "",
    verdictAt: report?.verdictAt || null,
  };
}

function emptyProfile(actor) {
  return {
    canonicalNames: [actor.name],
    romanizedNames: [actor.shortName_en].filter(Boolean),
    aliases: [actor.shortName].filter(Boolean),
    commonCollisions: [],
    representativeWorks: [],
    knownContamination: [],
    productStockMeanings: [],
    trustedSourcePatterns: [],
    problematicSourcePatterns: [],
  };
}

function emptyDiagnostics() {
  return {
    rawCandidates: [],
    dropped: [],
    eventFamilies: [],
    strongestEvent: null,
    strongestCompiled: null,
    winner: null,
    alternate: null,
    receipt: { rawCount: 0, analyzedCount: 0 },
  };
}

async function readReport(store, pair) {
  const head = await store.get(auditHeadKey(pair.actor.id, pair.vibeIdx), {
    type: "json",
    consistency: "strong",
  });
  const listing = await store.list({ prefix: auditRunPrefix(pair.actor.id, pair.vibeIdx) });
  const runs = (await Promise.all((listing?.blobs || []).map(async blob => {
    if (typeof blob?.key !== "string") return null;
    const run = await store.get(blob.key, { type: "json", consistency: "strong" });
    return run ? attachVerdict(store, pair, run) : null;
  })))
    .filter(Boolean)
    .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  const currentRun = runs.find(run => run.runId === head?.currentRunId) || null;
  const currentVerdict = currentRun?.operatorVerdict || null;
  return {
    schemaVersion: 1,
    actorId: pair.actor.id,
    vibeKey: pair.vibeKey,
    vibeIdx: pair.vibeIdx,
    verdict: currentVerdict?.verdict || null,
    notes: currentVerdict?.notes || "",
    verdictAt: currentVerdict?.decidedAt || null,
    verdictRunId: currentVerdict ? currentRun.runId : null,
    currentRun,
    priorRuns: runs.filter(run => run.runId !== currentRun?.runId).slice(0, MAX_RETAINED_RUNS),
  };
}

async function readRun(store, pair, runId) {
  const run = await store.get(auditRunKey(pair.actor.id, pair.vibeIdx, runId), {
    type: "json",
    consistency: "strong",
  });
  return run ? attachVerdict(store, pair, run) : null;
}

async function attachVerdict(store, pair, run) {
  const operatorVerdict = await store.get(
    auditVerdictKey(pair.actor.id, pair.vibeIdx, run.runId),
    { type: "json", consistency: "strong" },
  );
  return { ...run, operatorVerdict: operatorVerdict || null };
}

async function writeEligibility(store, pair, snapshot) {
  const value = snapshot || {
    schemaVersion: 1,
    profileVersion: IDENTITY_PROFILE_VERSION,
    actorId: pair.actor.id,
    vibeKey: pair.vibeKey,
    vibeIdx: pair.vibeIdx,
    pairingFingerprint: pairingFingerprintFor(pair.actor, pair.vibeIdx),
    verdict: null,
    eligible: false,
  };
  await store.setJSON(eligibilityKey(pair.actor.id, pair.vibeIdx), value);
}

export function vibeKeyFor(actorId, vibeIdx) {
  return auditVibeKey(actorId, vibeIdx);
}

function resolvePair(packs, actorId, vibeKey) {
  if (typeof actorId !== "string" || typeof vibeKey !== "string") return null;
  const actor = packs.find(item => item.id === actorId);
  if (!actor) return null;
  const match = vibeKey.match(new RegExp(`^${escapeRegex(actorId)}:(\\d+)$`));
  if (!match) return null;
  const vibeIdx = Number(match[1]);
  const vibe = actor.vibes?.[vibeIdx];
  return vibe ? { actor, vibe, vibeIdx, vibeKey } : null;
}

function parseScope(value) {
  return value === "representative" || value === "full" ? value : null;
}

function boundedText(value, max) {
  if (value === undefined) return "";
  return typeof value === "string" && value.length <= max ? value.trim() : null;
}

async function readJson(req) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new TypeError("Content-Type must be application/json.");
  }
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new TypeError("Request is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new TypeError("Request must be valid JSON.");
  }
}

function requireSameOrigin(req) {
  if (req.headers.get("origin") !== new URL(req.url).origin) {
    const error = new Error("Cross-origin requests are not allowed.");
    error.status = 403;
    throw error;
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}