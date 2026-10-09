import { randomUUID } from "node:crypto";
import { getWithResolvedEtag } from "./blob-store.js";
import { ACTIVE_DISCUSSIONS, readDiscussionCapacity } from "./vibing-discussion.js";

const CLAIM_MS = 15 * 60 * 1000;
const categories = ["total", "approved"];

function validState(value) {
  if (!value || value.schemaVersion !== 1 || !["armed", "claimed", "sent"].includes(value.status)) {
    throw new Error("Discussion capacity notification state is invalid.");
  }
  if (value.status === "claimed" && (typeof value.claimId !== "string"
    || !Number.isFinite(Date.parse(value.claimedAt)))) {
    throw new Error("Discussion capacity notification claim is invalid.");
  }
  return value;
}

async function transition(store, key, next, previous) {
  const result = await store.setJSON(key, next,
    previous ? { onlyIfMatch: previous.etag } : { onlyIfNew: true });
  return result?.modified !== false;
}

async function state(store, key) {
  const entry = await getWithResolvedEtag(store, key, { type: "json" });
  if (entry && !entry.etag) throw new Error("Discussion capacity notification ETag is unavailable.");
  return entry ? { data: validState(entry.data), etag: entry.etag } : null;
}

async function checkCategory({ store, discussionId, category, capacity, notify, now, randomId }) {
  const key = `capacity-alert/${discussionId}/${category}`;
  const crossed = capacity[category] >= capacity.warningAt;
  for (let attempt = 0; attempt < 12; attempt++) {
    const previous = await state(store, key);
    if (!crossed) {
      // Rearm only after a successful archive read below the warning threshold.
      if (!previous || previous.data.status === "armed") return;
      if (await transition(store, key, { schemaVersion: 1, status: "armed" }, previous)) return;
      continue;
    }
    if (previous?.data.status === "sent") return;
    if (previous?.data.status === "claimed"
      && now.getTime() - Date.parse(previous.data.claimedAt) < CLAIM_MS) {
      throw new Error("Discussion capacity notification delivery is pending.");
    }
    const claimId = randomId();
    const claim = { schemaVersion: 1, status: "claimed", claimId, claimedAt: now.toISOString() };
    if (!await transition(store, key, claim, previous)) continue;
    await notify({ discussionId, category, total: capacity.total, approved: capacity.approved,
      limit: capacity.limit, warningAt: capacity.warningAt, observedAt: now.toISOString() });
    // If delivery succeeds but this settlement fails, a later retry may resend.
    // Never mark the alert sent before the provider accepts it.
    const current = await state(store, key);
    if (current?.data.claimId !== claimId
      || !await transition(store, key, { schemaVersion: 1, status: "sent" }, current)) {
      throw new Error("Discussion capacity notification settlement conflicted.");
    }
    return;
  }
  throw new Error("Discussion capacity notification changed too frequently.");
}

export async function checkDiscussionCapacity({ store, notify, now = new Date(), randomId = randomUUID }) {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid discussion capacity check time.");
  const failures = [];
  for (const discussionId of Object.keys(ACTIVE_DISCUSSIONS)) {
    try {
      const capacity = await readDiscussionCapacity(store, discussionId);
      for (const category of categories) {
        try {
          await checkCategory({ store, discussionId, category, capacity, notify, now, randomId });
        } catch (error) { failures.push(error); }
      }
    } catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, "Discussion capacity check failed.");
}

export async function sendDiscussionCapacityAlert({ payload, env = process.env, fetchImpl = fetch }) {
  const recipients = String(env.FANDOM_ADMIN_EMAILS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!env.RESEND_API_KEY || !env.FANDOM_AUTH_FROM_EMAIL || !recipients.length) {
    throw new Error("Discussion capacity notifications are not configured.");
  }
  const subject = `[Fandom operations] Discussion ${payload.category} capacity planning warning`;
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.FANDOM_AUTH_FROM_EMAIL, to: recipients, subject,
      text: [
        "Private discussion capacity planning warning",
        `Discussion: ${payload.discussionId}`,
        `Threshold crossed: ${payload.category} >= ${payload.warningAt}`,
        `Total records: ${payload.total} / ${payload.limit}`,
        `Protected approved replies: ${payload.approved} / ${payload.limit}`,
        `Observed at: ${payload.observedAt}`,
        payload.category === "approved"
          ? "Plan a reviewed storage expansion; cleanup cannot remove visible replies."
          : "Preview eligible cleanup in private moderation; approved replies remain protected.",
      ].join("\n"),
    }),
  });
  if (!response.ok) throw new Error(`Discussion capacity notification delivery failed (${response.status}).`);
}