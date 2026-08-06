import { randomUUID } from "node:crypto";

export const HANDOFF_ATTEMPT_STORE = "idea-packet-handoff-attempts";

const LEASE_MS = 5 * 60 * 1000;

export async function withHandoffLease(store, packetId, work, { conflict }) {
  const key = `locks/${safeKeySegment(packetId)}`;
  const owner = randomUUID();
  const acquiredAt = Date.now();
  const lease = {
    owner,
    acquiredAt,
    expiresAt: acquiredAt + LEASE_MS,
    state: "active",
  };
  const existing = await getWithMetadata(store, key);
  if (existing?.data?.state === "active" && existing.data.expiresAt > acquiredAt) {
    throw conflict("This Idea Packet handoff is already in progress. Retry after it finishes.");
  }
  await store.setJSON(
    key,
    lease,
    existing?.etag ? { onlyIfMatch: existing.etag } : { onlyIfNew: true },
  );
  const claimed = await getWithMetadata(store, key);
  if (claimed?.data?.owner !== owner || claimed.data.state !== "active") {
    throw conflict("This Idea Packet handoff is already in progress. Retry after it finishes.");
  }
  try {
    return await work({
      renew: () => renewLease(store, key, owner, conflict),
    });
  } finally {
    await releaseLease(store, key, owner);
  }
}

async function renewLease(store, key, owner, conflict) {
  const current = await getWithMetadata(store, key);
  if (current?.data?.owner !== owner || current.data.state !== "active") {
    throw conflict("This Idea Packet handoff lease was lost. Retry after the active handoff finishes.");
  }
  const result = await store.setJSON(
    key,
    { ...current.data, expiresAt: Date.now() + LEASE_MS },
    current.etag ? { onlyIfMatch: current.etag } : undefined,
  );
  if (result?.modified === false) {
    throw conflict("This Idea Packet handoff lease was lost. Retry after the active handoff finishes.");
  }
  if (result?.modified !== true) {
    const verified = await getWithMetadata(store, key);
    if (verified?.data?.owner !== owner || verified.data.state !== "active") {
      throw conflict("This Idea Packet handoff lease was lost. Retry after the active handoff finishes.");
    }
  }
}

async function releaseLease(store, key, owner) {
  try {
    const current = await getWithMetadata(store, key);
    if (current?.data?.owner !== owner || current.data.state !== "active") return;
    await store.setJSON(
      key,
      { ...current.data, state: "released", releasedAt: Date.now() },
      current.etag ? { onlyIfMatch: current.etag } : undefined,
    );
  } catch (error) {
    console.error("[handoff-lease] could not release durable lease", error);
  }
}

async function getWithMetadata(store, key) {
  if (typeof store.getWithMetadata === "function") {
    return store.getWithMetadata(key, { type: "json", consistency: "strong" });
  }
  const data = await store.get(key, { type: "json", consistency: "strong" });
  return data ? { data } : null;
}

function safeKeySegment(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
}
