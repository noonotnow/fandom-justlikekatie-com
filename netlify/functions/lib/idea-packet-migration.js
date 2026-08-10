import { createHash, createHmac } from "node:crypto";
import { getIdeaPacketMode, IdeaPacketModeError } from "./idea-packet-cutover.js";
import { HANDOFF_ATTEMPT_STORE } from "./handoff-lease.js";
import { upgradeLegacyPacket, validatePacket } from "./idea-packets.js";
import { secureEqual } from "./public-auth.js";

const PACKET_STORE = "idea-packets";
const SCHEMA_VERSION = "fandom.idea-packet-migration.v1";
const CHECKSUM_ALGORITHM = "sha256-canonical-json-v1";
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_CONCURRENT_BLOB_READS = 12;
const EMPTY_BODY_DIGEST = createHash("sha256").update("").digest("hex");
const MIGRATION_PATH = "/api/internal/idea-packet-migration";
const LEGACY_ATTEMPT_KEYS = new Set([
  "sourceVersion",
  "expectedSourceVersion",
  "packetVersion",
  "fingerprint",
  "generatedAt",
]);

class MigrationError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function createIdeaPacketMigrationHandler({
  env = process.env,
  getStore,
  logger = console,
  now = () => new Date(),
} = {}) {
  return async function ideaPacketMigration(req, context) {
    if (req.method !== "GET") {
      return jsonResponse(405, {
        code: "PACKET_MIGRATION_METHOD_NOT_ALLOWED",
        error: "Method not allowed.",
      }, { Allow: "GET" });
    }

    try {
      validateMigrationSignature(req, env, now());
      const url = new URL(req.url);
      if (url.pathname !== MIGRATION_PATH || url.search) {
        throw new MigrationError(
          "Migration export does not accept query parameters.",
          400,
          "PACKET_MIGRATION_QUERY_NOT_ALLOWED",
        );
      }

      let mode;
      try {
        mode = getIdeaPacketMode(env);
      } catch (error) {
        if (error instanceof IdeaPacketModeError) {
          throw new MigrationError(
            "Fandom Idea Packets mode is invalid.",
            503,
            "FANDOM_IDEA_PACKETS_MODE_INVALID",
          );
        }
        throw error;
      }
      if (mode !== "read-only") {
        throw new MigrationError(
          "Fandom Idea Packets must be read-only before migration export.",
          409,
          "PACKET_MIGRATION_NOT_FROZEN",
        );
      }

      const packetStore = getStore(PACKET_STORE, context);
      const attemptStore = getStore(HANDOFF_ATTEMPT_STORE, context);
      const phaseMetrics = [];
      const { exportData, totalDurationMs } = await buildMigrationExportResult(
        packetStore,
        attemptStore,
        now(),
        metric => {
          phaseMetrics.push(metric);
          logger.info("[idea-packet-migration] phase complete", metric);
        },
      );
      const serialized = JSON.stringify(exportData);
      const responseBytes = Buffer.byteLength(serialized);
      logger.info("[idea-packet-migration] export complete", {
        totalDurationMs,
        responseBytes,
        packetCount: exportData.snapshot.packetCount,
        quarantineCount: exportData.quarantine.length,
      });
      return jsonTextResponse(200, serialized, {
        ETag: `"${exportData.snapshot.checksum}"`,
        "X-Fandom-Snapshot-Checksum": exportData.snapshot.checksum,
        "Server-Timing": serverTimingHeader(phaseMetrics, totalDurationMs),
      });
    } catch (error) {
      if (error instanceof MigrationError) {
        return jsonResponse(error.status, { code: error.code, error: error.message });
      }
      logger.error("[idea-packet-migration] export failed", error);
      return jsonResponse(503, {
        code: "PACKET_MIGRATION_EXPORT_UNAVAILABLE",
        error: "Idea Packet migration export is unavailable.",
      });
    }
  };
}

export async function buildMigrationExport(packetStore, attemptStore, generatedAt = new Date()) {
  return (await buildMigrationExportResult(packetStore, attemptStore, generatedAt)).exportData;
}

async function buildMigrationExportResult(
  packetStore,
  attemptStore,
  generatedAt,
  onPhase = () => {},
) {
  const startedAt = performance.now();
  const [packetBlobs, attemptBlobs] = await measurePhase(
    "initial-inventory",
    onPhase,
    () => Promise.all([
      listAllBlobs(packetStore),
      listAllBlobs(attemptStore),
    ]),
  );
  const [packetEntries, attemptEntries] = await measurePhase(
    "body-read",
    onPhase,
    () => readSnapshotEntries(packetStore, packetBlobs, attemptStore, attemptBlobs),
    {
      packetBlobCount: packetBlobs.length,
      attemptBlobCount: attemptBlobs.length,
      maxConcurrency: MAX_CONCURRENT_BLOB_READS,
    },
  );
  assertNoActiveLeases(attemptEntries, generatedAt);

  const exportData = await measurePhase(
    "compile",
    onPhase,
    () => compileMigrationExport(packetEntries, attemptEntries, generatedAt),
  );

  const [verifiedPacketBlobs, verifiedAttemptBlobs] = await measurePhase(
    "final-inventory",
    onPhase,
    () => Promise.all([
      listAllBlobs(packetStore),
      listAllBlobs(attemptStore),
    ]),
  );
  assertSnapshotUnchanged(packetEntries, verifiedPacketBlobs, "packet");
  assertSnapshotUnchanged(attemptEntries, verifiedAttemptBlobs, "handoff");

  return {
    exportData,
    totalDurationMs: roundedDuration(performance.now() - startedAt),
  };
}

function compileMigrationExport(packetEntries, attemptEntries, generatedAt) {
  const attemptByKey = new Map(attemptEntries.map(entry => [entry.key, entry.data]));
  const referencedArtifactKeys = new Set();
  const packets = [];
  const quarantine = [];

  for (const entry of packetEntries) {
    if (!isRecord(entry.data)) {
      quarantine.push(quarantineRecord({
        kind: "invalid-packet",
        packetId: entry.key,
        reason: "The packet Blob is not a JSON object and cannot be imported.",
        storedValue: stripAttemptBytes(entry.data),
        storedChecksum: canonicalChecksum(entry.data),
      }));
      continue;
    }

    const storedPacket = structuredClone(entry.data);
    const packetId = stringValue(storedPacket.id) || entry.key;
    let normalizedPacket;
    try {
      normalizedPacket = upgradeLegacyPacket(storedPacket);
      validatePacket(normalizedPacket);
      canonicalChecksum(normalizedPacket);
    } catch {
      quarantine.push(quarantineRecord({
        kind: "invalid-packet",
        packetId,
        reason: "The packet Blob cannot be normalized into a valid Idea Packet.",
        storedValue: stripAttemptBytes(storedPacket),
        storedChecksum: canonicalChecksum(storedPacket),
      }));
      continue;
    }
    const attempt = classifyPacketAttempt({
      packetId,
      packet: storedPacket,
      attemptByKey,
      referencedArtifactKeys,
    });
    if (attempt.quarantine) quarantine.push(attempt.quarantine);
    const handoff = classifyCompletedHandoff(storedPacket, packetId);
    if (handoff.quarantine) quarantine.push(handoff.quarantine);
    packets.push({
      packetId,
      version: stringValue(storedPacket.version),
      createdAt: stringValue(storedPacket.createdAt),
      updatedAt: stringValue(storedPacket.updatedAt),
      state: stringValue(storedPacket.state),
      storedPacket,
      normalizedPacket,
      storedChecksum: canonicalChecksum(storedPacket),
      normalizedChecksum: canonicalChecksum(normalizedPacket),
      selectedMediaIds: Array.isArray(normalizedPacket.media)
        ? normalizedPacket.media.map(item => stringValue(item?.id))
        : [],
      selectedOutputIds: Array.isArray(normalizedPacket.outputs)
        ? normalizedPacket.outputs.filter(output => output?.included === true).map(output => stringValue(output.id))
        : [],
      createIdentity: {
        idempotencyKey: `fandom/deliverable/${packetId}/idea-packet-main`,
        deliverableId: "idea-packet-main",
        completedHandoff: handoff.completed,
      },
      attemptDisposition: attempt.quarantine?.quarantineId ?? null,
    });
  }

  for (const entry of attemptEntries) {
    if (entry.key.startsWith("locks/")) {
      quarantine.push(classifyLease(entry.key, entry.data, generatedAt));
      continue;
    }
    if (!referencedArtifactKeys.has(entry.key)) {
      quarantine.push(quarantineRecord({
        kind: "orphan-artifact",
        artifactKey: entry.key,
        reason: "No packet handoffAttempt pointer references this artifact.",
        artifactChecksum: canonicalChecksum(entry.data),
        artifact: sanitizeAttemptArtifact(entry.data),
      }));
    }
  }

  packets.sort((left, right) => left.packetId.localeCompare(right.packetId));
  quarantine.sort((left, right) => left.quarantineId.localeCompare(right.quarantineId));
  const completedHandoffCount = packets.filter(packet => packet.createIdentity.completedHandoff).length;
  const unresolvedAttemptCount = quarantine.filter(item => [
    "current-attempt",
    "stale-attempt",
    "legacy-attempt",
    "invalid-attempt",
    "missing-artifact",
    "invalid-handoff",
  ].includes(item.kind)).length;
  const stateCounts = {
    collecting: packets.filter(packet => packet.state === "collecting").length,
    media_compiled: packets.filter(packet => packet.state === "media_compiled").length,
  };
  const checksum = canonicalChecksum({ packets, quarantine });

  return {
    schemaVersion: SCHEMA_VERSION,
    source: {
      system: "fandom",
      store: PACKET_STORE,
      attemptStore: HANDOFF_ATTEMPT_STORE,
      mode: "read-only",
    },
    snapshot: {
      generatedAt: generatedAt.toISOString(),
      checksumAlgorithm: CHECKSUM_ALGORITHM,
      checksum,
      packetCount: packets.length,
      completedHandoffCount,
      unresolvedAttemptCount,
      orphanAttemptCount: quarantine.filter(item => item.kind === "orphan-artifact").length,
      expiredOrReleasedLeaseCount: quarantine.filter(item => (
        item.kind === "expired-lease" || item.kind === "released-lease"
      )).length,
      stateCounts,
      mediaCount: packets.reduce((count, packet) => count + packet.selectedMediaIds.length, 0),
      selectedOutputCount: packets.reduce((count, packet) => count + packet.selectedOutputIds.length, 0),
    },
    packets,
    quarantine,
  };
}

function classifyCompletedHandoff(packet, packetId) {
  if (packet.handoff === undefined) {
    return { completed: null, quarantine: null };
  }
  if (isValidCompletedHandoff(packet.handoff, packet, packetId)) {
    return { completed: structuredClone(packet.handoff), quarantine: null };
  }
  return {
    completed: null,
    quarantine: quarantineRecord({
      kind: "invalid-handoff",
      packetId,
      reason: "The persisted completed handoff does not satisfy the receipt, source CAS, idempotency, or packet-version contract.",
      handoff: stripAttemptBytes(packet.handoff),
    }),
  };
}

function isValidCompletedHandoff(handoff, packet, packetId) {
  if (!isRecord(handoff)) return false;
  const expectedSourceVersion = handoff.expectedSourceVersion;
  const receipt = handoff.receipt;
  const generatedAt = Date.parse(handoff.generatedAt);
  const completedAt = Date.parse(handoff.completedAt);
  const packetCreatedAt = Date.parse(packet.createdAt);
  const packetUpdatedAt = Date.parse(packet.updatedAt);
  const completedPacketVersion = typeof handoff.fingerprint === "string"
    ? `${handoff.completedAt}-${createHash("sha256").update(handoff.fingerprint).digest("hex").slice(0, 12)}`
    : null;
  const currentPacketFollowsCompletion = (
    packet.updatedAt === handoff.completedAt
    && packet.version === completedPacketVersion
  ) || (
    packetUpdatedAt >= completedAt
    && isEditedPacketVersion(packet.version, packet.updatedAt)
    && packet.version !== completedPacketVersion
  );
  return Number.isInteger(handoff.sourceVersion)
    && handoff.sourceVersion >= 1
    && (
      expectedSourceVersion === null
      || (Number.isInteger(expectedSourceVersion) && expectedSourceVersion >= 1)
    )
    && handoff.sourceVersion === (expectedSourceVersion ?? 0) + 1
    && typeof handoff.packetVersion === "string"
    && Boolean(handoff.packetVersion)
    && handoff.packetVersion !== packet.version
    && typeof handoff.fingerprint === "string"
    && /^[a-f0-9]{64}$/.test(handoff.fingerprint)
    && isIsoTimestamp(handoff.generatedAt)
    && isIsoTimestamp(handoff.completedAt)
    && isIsoTimestamp(packet.createdAt)
    && isIsoTimestamp(packet.updatedAt)
    && generatedAt >= packetCreatedAt
    && completedAt >= generatedAt
    && currentPacketFollowsCompletion
    && isRecord(receipt)
    && receipt.deliverableId === "idea-packet-main"
    && typeof receipt.postId === "string"
    && Boolean(receipt.postId)
    && isHttpsUrl(receipt.postUrl)
    && isValidCreateUrl(receipt.createUrl, receipt.postId)
    && receipt.status === "Draft"
    && receipt.sourceVersion === handoff.sourceVersion
    && receipt.workflow === "packet"
    && ["created", "replayed", "updated"].includes(receipt.disposition)
    && receipt.packetReceipt?.packetId === packetId
    && receipt.packetReceipt?.deliverableId === "idea-packet-main"
    && receipt.packetReceipt?.accepted === true
    && receipt.mediaSyncState === "synced"
    && Array.isArray(receipt.warnings);
}

function classifyPacketAttempt({ packetId, packet, attemptByKey, referencedArtifactKeys }) {
  const pointer = packet.handoffAttempt;
  if (pointer === undefined) return { quarantine: null };
  if (!isRecord(pointer)) {
    return {
      quarantine: quarantineRecord({
        kind: "invalid-attempt",
        packetId,
        reason: "The packet handoffAttempt pointer is not an object.",
        pointer: stripAttemptBytes(pointer),
      }),
    };
  }
  if (isLegacyPointer(pointer)) {
    return {
      quarantine: quarantineRecord({
        kind: "legacy-attempt",
        packetId,
        reason: "Legacy retry pointers have no trustworthy artifact bytes and must not be replayed.",
        pointer: structuredClone(pointer),
      }),
    };
  }
  if (!isValidModernPointer(pointer)) {
    return {
      quarantine: quarantineRecord({
        kind: "invalid-attempt",
        packetId,
        reason: "The packet handoffAttempt pointer is malformed.",
        pointer: stripAttemptBytes(pointer),
      }),
    };
  }

  referencedArtifactKeys.add(pointer.artifactKey);
  const artifact = attemptByKey.get(pointer.artifactKey);
  if (artifact === undefined) {
    return {
      quarantine: quarantineRecord({
        kind: "missing-artifact",
        packetId,
        artifactKey: pointer.artifactKey,
        reason: "The packet points to an attempt artifact that is not present.",
        pointer: structuredClone(pointer),
      }),
    };
  }
  const artifactIsValid = isValidStoredAttemptArtifact(artifact, pointer, packetId);
  return {
    quarantine: quarantineRecord({
      kind: artifactIsValid
        ? pointer.packetVersion === packet.version ? "current-attempt" : "stale-attempt"
        : "invalid-attempt",
      packetId,
      artifactKey: pointer.artifactKey,
      reason: artifactIsValid
        ? pointer.packetVersion === packet.version
          ? "The unresolved attempt matches the current packet version and is quarantined instead of resumed."
          : "The unresolved attempt targets an older packet version and is quarantined as stale."
        : "The persisted attempt artifact is malformed or does not match its packet pointer.",
      pointer: structuredClone(pointer),
      artifactChecksum: canonicalChecksum(artifact),
      artifact: sanitizeAttemptArtifact(artifact),
      bytesOmitted: true,
    }),
  };
}

function classifyLease(key, value, current) {
  const state = isRecord(value) ? value.state : undefined;
  const expiresAt = isRecord(value) ? Number(value.expiresAt) : Number.NaN;
  let kind;
  let reason;
  if (state === "active" && Number.isFinite(expiresAt) && expiresAt > current.getTime()) {
    kind = "active-lease";
    reason = "A handoff still owns this durable lease.";
  } else if (state === "released") {
    kind = "released-lease";
    reason = "The durable handoff lease was released.";
  } else {
    kind = "expired-lease";
    reason = "The durable handoff lease is inactive, expired, or malformed.";
  }
  return quarantineRecord({
    kind,
    packetId: key.slice("locks/".length) || null,
    artifactKey: key,
    reason,
    lease: stripAttemptBytes(value),
  });
}

function quarantineRecord({
  kind,
  packetId = null,
  artifactKey = null,
  reason,
  ...details
}) {
  const identity = canonicalChecksum({
    kind,
    packetId,
    artifactKey,
    pointer: details.pointer ?? null,
  });
  return {
    quarantineId: `quarantine-${identity}`,
    packetId,
    kind,
    replayAllowed: false,
    reason,
    ...(artifactKey ? { artifactKey } : {}),
    ...details,
  };
}

function sanitizeAttemptArtifact(value) {
  const sanitized = stripAttemptBytes(value);
  if (!isRecord(sanitized)) return sanitized;
  return {
    ...sanitized,
    ...(Array.isArray(sanitized.files)
      ? {
          files: sanitized.files.map(file => isRecord(file)
            ? {
                filename: file.filename ?? null,
                checksum: file.checksum ?? null,
                sizeBytes: file.sizeBytes ?? null,
                bytesOmitted: true,
              }
            : { value: file, bytesOmitted: true }),
        }
      : {}),
  };
}

function stripAttemptBytes(value) {
  if (Array.isArray(value)) return value.map(stripAttemptBytes);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter(key => key !== "bytesBase64")
      .sort()
      .map(key => [key, stripAttemptBytes(value[key])]),
  );
}

async function listAllBlobs(store) {
  const listing = store.list({ paginate: true });
  if (listing && typeof listing[Symbol.asyncIterator] === "function") {
    const blobs = [];
    for await (const page of listing) blobs.push(...(page.blobs || []));
    return deduplicateBlobs(blobs);
  }
  const page = await listing;
  return deduplicateBlobs(page?.blobs || []);
}

function deduplicateBlobs(blobs) {
  return [...new Map(blobs.map(blob => [blob.key, blob])).values()]
    .sort((left, right) => left.key.localeCompare(right.key));
}

async function readSnapshotEntries(packetStore, packetBlobs, attemptStore, attemptBlobs) {
  const requests = [
    ...packetBlobs.map(blob => ({ store: packetStore, blob })),
    ...attemptBlobs.map(blob => ({ store: attemptStore, blob })),
  ];
  const entries = await mapWithConcurrency(
    requests,
    MAX_CONCURRENT_BLOB_READS,
    ({ store, blob }) => readEntry(store, blob),
  );
  return [
    entries.slice(0, packetBlobs.length),
    entries.slice(packetBlobs.length),
  ];
}

async function readEntry(store, blob) {
  if (typeof store.getWithMetadata !== "function") {
    throw new Error("Blob metadata reads are required for a stable migration snapshot.");
  }
  if (typeof blob.etag !== "string" || !blob.etag) {
    throw new Error(`Blob ${blob.key} listing has no ETag for migration snapshot validation.`);
  }
  const entry = await store.getWithMetadata(blob.key, {
    type: "json",
    consistency: "strong",
  });
  if (entry?.data === undefined || entry?.data === null) {
    throw snapshotChanged(`Blob ${blob.key} disappeared during migration inventory.`);
  }
  if (typeof entry.etag !== "string" || !entry.etag) {
    throw new Error(`Blob ${blob.key} has no ETag for migration snapshot validation.`);
  }
  if (entry.etag !== blob.etag) {
    throw snapshotChanged(`Blob ${blob.key} changed between migration listing and read.`);
  }
  return { key: blob.key, etag: entry.etag, data: entry.data };
}

async function mapWithConcurrency(values, limit, work) {
  const results = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await work(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker()),
  );
  return results;
}

function assertNoActiveLeases(entries, current) {
  const activeLeases = entries
    .filter(entry => entry.key.startsWith("locks/"))
    .map(entry => classifyLease(entry.key, entry.data, current))
    .filter(item => item.kind === "active-lease");
  if (activeLeases.length > 0) {
    throw new MigrationError(
      `Migration export is blocked by ${activeLeases.length} active handoff lease${activeLeases.length === 1 ? "" : "s"}.`,
      409,
      "PACKET_MIGRATION_HANDOFF_ACTIVE",
    );
  }
}

function assertSnapshotUnchanged(entries, blobs, label) {
  const before = entries.map(entry => ({ key: entry.key, etag: entry.etag }));
  const after = blobs.map(blob => {
    if (typeof blob.etag !== "string" || !blob.etag) {
      throw new Error(`Blob ${blob.key} listing has no ETag for migration snapshot validation.`);
    }
    return { key: blob.key, etag: blob.etag };
  });
  if (canonicalChecksum(before) !== canonicalChecksum(after)) {
    throw snapshotChanged(`The ${label} Blob inventory changed during migration export. Retry the snapshot.`);
  }
}

function snapshotChanged(message) {
  return new MigrationError(message, 409, "PACKET_MIGRATION_SNAPSHOT_CHANGED");
}

async function measurePhase(name, onPhase, work, details = {}) {
  const startedAt = performance.now();
  const result = await work();
  onPhase({
    phase: name,
    durationMs: roundedDuration(performance.now() - startedAt),
    ...details,
  });
  return result;
}

function roundedDuration(value) {
  return Math.round(value * 10) / 10;
}

function serverTimingHeader(metrics, totalDurationMs) {
  return [
    ...metrics.map(metric => `${metric.phase};dur=${metric.durationMs}`),
    `total;dur=${totalDurationMs}`,
  ].join(", ");
}

function validateMigrationSignature(req, env, current) {
  const keyId = req.headers.get("x-fandom-key-id") || "";
  const timestamp = req.headers.get("x-fandom-timestamp") || "";
  const signature = req.headers.get("x-fandom-signature") || "";
  if (
    !env.CREATE_FANDOM_PACKET_MIGRATION_KEY_ID
    || !env.CREATE_FANDOM_PACKET_MIGRATION_SECRET
    || !secureEqual(keyId, env.CREATE_FANDOM_PACKET_MIGRATION_KEY_ID)
  ) throw unauthorized();

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(current.getTime() - timestampMs) > MAX_CLOCK_SKEW_MS) {
    throw unauthorized();
  }
  const expected = createHmac("sha256", env.CREATE_FANDOM_PACKET_MIGRATION_SECRET)
    .update(`${timestamp}\nGET\n${MIGRATION_PATH}\n${EMPTY_BODY_DIGEST}`)
    .digest("hex");
  if (!secureEqual(signature, `v1=${expected}`)) throw unauthorized();
}

function unauthorized() {
  return new MigrationError(
    "Idea Packet migration authorization failed.",
    401,
    "PACKET_MIGRATION_UNAUTHORIZED",
  );
}

function isLegacyPointer(pointer) {
  const keys = Object.keys(pointer);
  return keys.length === LEGACY_ATTEMPT_KEYS.size
    && keys.every(key => LEGACY_ATTEMPT_KEYS.has(key));
}

function isValidModernPointer(pointer) {
  return pointer.schemaVersion === 1
    && typeof pointer.artifactKey === "string"
    && Boolean(pointer.artifactKey)
    && Number.isInteger(pointer.sourceVersion)
    && pointer.sourceVersion >= 1
    && (
      pointer.expectedSourceVersion === null
      || (Number.isInteger(pointer.expectedSourceVersion) && pointer.expectedSourceVersion >= 1)
    )
    && typeof pointer.packetVersion === "string"
    && Boolean(pointer.packetVersion)
    && typeof pointer.sourcePacketVersion === "string"
    && Boolean(pointer.sourcePacketVersion)
    && typeof pointer.inputFingerprint === "string"
    && Boolean(pointer.inputFingerprint)
    && typeof pointer.fingerprint === "string"
    && Boolean(pointer.fingerprint)
    && typeof pointer.generatedAt === "string"
    && Number.isFinite(Date.parse(pointer.generatedAt));
}

function isValidStoredAttemptArtifact(artifact, pointer, packetId) {
  if (
    !isRecord(artifact)
    || artifact.schemaVersion !== 1
    || artifact.artifactKey !== pointer.artifactKey
    || artifact.sourceVersion !== pointer.sourceVersion
    || artifact.expectedSourceVersion !== pointer.expectedSourceVersion
    || artifact.packetVersion !== pointer.packetVersion
    || artifact.sourcePacketVersion !== pointer.sourcePacketVersion
    || artifact.inputFingerprint !== pointer.inputFingerprint
    || artifact.fingerprint !== pointer.fingerprint
    || artifact.generatedAt !== pointer.generatedAt
    || artifact.packet?.id !== packetId
    || !Array.isArray(artifact.outputs)
    || !Array.isArray(artifact.files)
    || !Array.isArray(artifact.registered)
    || artifact.registered.length > artifact.files.length
  ) {
    return false;
  }
  return artifact.files.every(file => {
    if (
      !isRecord(file)
      || typeof file.bytesBase64 !== "string"
      || typeof file.checksum !== "string"
      || typeof file.filename !== "string"
      || !Number.isInteger(file.sizeBytes)
    ) {
      return false;
    }
    const bytes = Buffer.from(file.bytesBase64, "base64");
    return bytes.toString("base64") === file.bytesBase64
      && bytes.byteLength === file.sizeBytes
      && createHash("sha256").update(bytes).digest("hex") === file.checksum;
  });
}

function isIsoTimestamp(value) {
  return typeof value === "string"
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function isEditedPacketVersion(value, updatedAt) {
  if (typeof value !== "string" || typeof updatedAt !== "string") return false;
  const prefix = `${updatedAt}-`;
  if (!value.startsWith(prefix)) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value.slice(prefix.length));
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isValidCreateUrl(value, postId) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "create.justlikekatie.com"
      && url.pathname === "/compose"
      && url.searchParams.get("postId") === postId;
  } catch {
    return false;
  }
}

export function canonicalChecksum(value) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError("Value is not JSON-serializable.");
  return createHash("sha256").update(canonicalJson(JSON.parse(serialized))).digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(",")}}`;
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonResponse(status, body, headers = {}) {
  return jsonTextResponse(status, JSON.stringify(body), headers);
}

function jsonTextResponse(status, body, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      ...headers,
    },
  });
}
