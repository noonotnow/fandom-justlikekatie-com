import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createWorkstationMemeHandoffHandler, MEME_SEND_SCHEMA, memeOutputId, prepareEnvelopeForCreate } from "./workstation-meme-handoff.js";

const ORIGIN = "https://fandom.justlikekatie.com";
const ENV = {
  MEDIA_ASSETS_TOKEN: "t",
  MEDIA_ASSETS_URL: "https://media.example/v1/assets/images",
  WORKSTATION_FANDOM_INTAKE_URL: "https://workstation.example/api/integrations/fandom/projects",
  WORKSTATION_FANDOM_HMAC_KEY_ID: "k",
  WORKSTATION_FANDOM_HMAC_SECRET: "s",
};
const ASSET_ID = "33333333-3333-4333-8333-333333333333";

function png(width, height, filler = 0) {
  const b = Buffer.alloc(64, filler);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}
const sha = b => createHash("sha256").update(b).digest("hex");

function memoryStore() {
  const map = new Map();
  return { map, get: async k => map.get(k) ?? null, setJSON: async (k, v) => { map.set(k, structuredClone(v)); } };
}

function harness({ retentionState = "held", metaDedup = false, backupState = "verified", admin = true, mediaSourceType = "fandom-memeforge", dropFirstResponse = false, createRejection = null, dispositions = ["created", "replayed", "updated"] } = {}) {
  const store = memoryStore();
  const calls = { media: 0, workstation: [] };
  let n = 0;
  let seenWorkstation = 0;
  const digests = new Map();
  const fetchImpl = async (url, init) => {
    if (String(url).startsWith("https://media.example")) {
      calls.media++;
      const file = init.body.get("file");
      const bytes = Buffer.from(await file.arrayBuffer());
      const meta = JSON.parse(init.body.get("metadata"));
      assert.ok(!JSON.stringify(meta).includes("collection:"), "no collection association is claimed");
      assert.equal(meta.linkedPostIdentifiers, undefined, "meme identifiers are not written to MEDIA linkedPostIdentifiers");
      const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20);
      return Response.json({ data: { version: 1, assetId: ASSET_ID, mediaType: "image", mimeType: "image/png", sizeBytes: bytes.length, checksum: sha(bytes), fileUrl: "https://media.example/f.png", deliveryUrl: "https://media.example/d.png", thumbnailUrl: "https://media.example/t.png", dimensions: { width: w, height: h }, sourceType: mediaSourceType, rightsStatus: "cleared" }, meta: { deduplicated: metaDedup } });
    }
    const envelope = JSON.parse(init.body);
    calls.workstation.push({ envelope, headers: init.headers });
    if (createRejection) return Response.json(createRejection.body, { status: createRejection.status });
    // Model CREATE's validator for the meme snapshot: optional text may be ABSENT but a present field must not be blank,
    // and hook/caption are required. (CREATE: "meme.punchline must not be empty".)
    const blank = (v) => typeof v === "string" && v.trim() === "";
    const blanks = [
      ...Object.entries(envelope.meme).filter(([, v]) => blank(v)).map(([k]) => `meme.${k}`),
      ...Object.entries(envelope.meme.stillSource ?? {}).filter(([, v]) => blank(v)).map(([k]) => `meme.stillSource.${k}`),
      ...Object.entries(envelope.meme.framing ?? {}).filter(([, v]) => blank(v)).map(([k]) => `meme.framing.${k}`),
    ];
    if (blanks.length) return Response.json({ error: `${blanks[0]} must not be empty`, code: "FANDOM_PROJECT_VALIDATION_ERROR" }, { status: 400 });
    // Model CREATE's idempotency: same key + same content replays; same key + different content is a 409.
    const { expectedSourceVersion, ...rest } = envelope;
    const comparable = JSON.stringify({ ...rest, meme: { ...envelope.meme, registration: { ...envelope.meme.registration, deduplicated: undefined } } });
    const known = digests.get(init.headers["Idempotency-Key"] + ":" + envelope.sourceVersion);
    if (known && known !== comparable) return Response.json({ error: "conflict" }, { status: 409 });
    const replay = Boolean(known);
    digests.set(init.headers["Idempotency-Key"] + ":" + envelope.sourceVersion, comparable);
    if (dropFirstResponse && seenWorkstation++ === 0) throw new Error("connection lost after CREATE committed");
    const disposition = replay ? "replayed" : dispositions[Math.min(n++, dispositions.length - 1)];
    return Response.json({ deliverableId: envelope.deliverableId, postId: "post-1", postUrl: "https://notion.so/post-1", status: "Draft", sourceVersion: envelope.sourceVersion, workflow: "direct", disposition, mediaSyncState: "synced", warnings: [{ code: "FANDOM_PLATFORM_SELECT_CONFLICT", detail: "Set Platform to TikTok.", retryable: false, secret: "x" }], backup: { state: backupState, assetId: ASSET_ID, detail: "ok", checkedAt: "2026-01-01T00:00:00Z", recovery: { secret: "x" } }, retention: { state: retentionState, detail: "d" } }, { status: disposition === "created" ? 201 : 200 });
  };
  const auth = { authenticateAdmin: async () => { if (!admin) throw Object.assign(new Error("no"), { status: 403 }); return { user: {} }; } };
  const handler = createWorkstationMemeHandoffHandler({ env: ENV, fetchImpl, getStore: () => store, auth, now: () => new Date("2026-11-04T10:00:00Z") });
  return { handler, calls, store, digests };
}

function body(overrides = {}, image = png(1080, 1920)) {
  return {
    schema: MEME_SEND_SCHEMA, memeGroupId: "group-00001", sendIntentId: "intent-0001", format: "tiktok-9x16",
    hook: "Hook", setup: "Setup", punchline: "Punch", caption: "English caption", hashtags: "#CDrama #Meme",
    stillSource: { kind: "search", title: "A still", link: "https://example.com/p", publisher: "Ex", query: "q" },
    png: image.toString("base64"), ...overrides,
  };
}
const send = (handler, b, headers = {}) => handler(new Request(`${ORIGIN}/api/workstation-meme-handoff`, {
  method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, ...headers }, body: JSON.stringify(b),
}), {});

test("sends a TikTok draft with rights, source and the correct image", async () => {
  const { handler, calls } = harness();
  const res = await send(handler, body());
  assert.equal(res.status, 201);
  const out = await res.json();
  assert.equal(out.receipt.postId, "post-1");
  assert.equal(out.backup.state, "verified");
  assert.equal(out.backup.recovery, undefined);
  const { envelope, headers } = calls.workstation[0];
  assert.equal(envelope.publicationBrief.distribution.primaryPlatform, "tiktok");
  assert.equal(envelope.meme.rights.posture, "not-cleared");
  assert.equal(envelope.meme.stillSource.link, "https://example.com/p");
  assert.equal(envelope.meme.registration.checksum, envelope.mediaAttachments[0].checksum);
  assert.equal(headers["Idempotency-Key"], `fandom/direct/card/group-00001/${memeOutputId("tiktok", "intent-0001")}`);
  assert.equal(envelope.sourceVersion, 1);
  assert.equal(envelope.expectedSourceVersion, null);
});

test("labels the Post snapshot as a MemeForge meme, not the C-drama studio", async () => {
  const { handler, calls } = harness();
  await send(handler, body());
  const { envelope } = calls.workstation[0];
  assert.deepEqual(envelope.vibe, { id: "memeforge-meme", label: "MemeForge meme" });
  assert.equal(envelope.renderVariant, "memeforge-meme-tiktok-9x16");
  assert.doesNotMatch(JSON.stringify([envelope.vibe, envelope.renderVariant]), /c-drama/i);
});

test("retry with the same intent replays without a new upstream write", async () => {
  const { handler, calls } = harness();
  await send(handler, body());
  const again = await send(handler, body());
  const out = await again.json();
  assert.equal(out.receipt.disposition, "replayed");
  assert.equal(calls.workstation.length, 1);
  assert.equal(calls.media, 1);
});

test("a new intent for the same meme and platform makes a separate Post identity", async () => {
  const { handler, calls } = harness();
  await send(handler, body());
  await send(handler, body({ sendIntentId: "intent-0002" }));
  const keys = calls.workstation.map(c => c.headers["Idempotency-Key"]);
  assert.equal(new Set(keys).size, 2);
});

test("edited content on the same intent updates with compare-and-swap", async () => {
  const { handler, calls } = harness();
  await send(handler, body());
  await send(handler, body({ caption: "Changed" }));
  const second = calls.workstation[1].envelope;
  assert.equal(second.sourceVersion, 2);
  assert.equal(second.expectedSourceVersion, 1);
});

test("rejects non-admin, wrong dimensions, and non-PNG bytes", async () => {
  assert.equal((await send(harness({ admin: false }).handler, body())).status, 403);
  assert.equal((await send(harness().handler, body({}, png(1080, 1350)))).status, 400);
  assert.equal((await send(harness().handler, body({ png: Buffer.from("not a png at all, sorry").toString("base64") }))).status, 400);
});

test("rejects cross-origin and unexpected fields", async () => {
  const { handler } = harness();
  const cross = await handler(new Request(`${ORIGIN}/api/x`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify(body()) }), {});
  assert.equal(cross.status, 403);
  assert.equal((await send(handler, body({ rights: "cleared" }))).status, 400);
});

test("flags MEDIA deduplication so a first-uploader label is not trusted, and uploads read as uploader-asserted", async () => {
  const { handler, calls } = harness({ mediaSourceType: "someone-else" });
  await send(handler, body({ stillSource: { kind: "upload" } }));
  const meme = calls.workstation[0].envelope.meme;
  assert.equal(meme.registration.deduplicated, true);
  assert.equal(meme.registration.returnedRightsStatus, "cleared");
  assert.equal(meme.rights.posture, "uploader-asserted");
  assert.match(meme.rights.note, /Operator-determined/);
  assert.match(meme.rights.note, /Not independently verified or cleared/);
});

test("an unverified backup is retried by re-sending the same envelope version, not a new Post", async () => {
  const { handler, calls } = harness({ backupState: "failed", dispositions: ["created", "replayed"] });
  const first = await (await send(handler, body())).json();
  assert.equal(first.backup.state, "failed");
  const retry = await (await send(handler, body())).json();
  assert.equal(calls.workstation.length, 2);
  const [a, b] = calls.workstation.map(c => c.envelope);
  assert.equal(b.sourceVersion, a.sourceVersion);
  assert.equal(b.generatedAt, a.generatedAt);
  assert.equal(calls.workstation[0].headers["Idempotency-Key"], calls.workstation[1].headers["Idempotency-Key"]);
  assert.equal(retry.receipt.disposition, "replayed");
});

test("uses MEDIA's authoritative meta.deduplicated flag even when sourceType matches", async () => {
  const { handler, calls } = harness({ metaDedup: true });
  await send(handler, body());
  assert.equal(calls.workstation[0].envelope.meme.registration.deduplicated, true);
});

test("a failed retention hold is surfaced and retried even when the backup is verified", async () => {
  const { handler, calls } = harness({ retentionState: "failed", dispositions: ["created", "replayed"] });
  const first = await (await send(handler, body())).json();
  assert.equal(first.retention.state, "failed");
  await send(handler, body());
  assert.equal(calls.workstation.length, 2);
});

test("CREATE platform warnings reach the operator with their action text and nothing extra", async () => {
  const { handler } = harness();
  const out = await (await send(handler, body())).json();
  assert.deepEqual(out.receipt.warnings, [{ code: "FANDOM_PLATFORM_SELECT_CONFLICT", detail: "Set Platform to TikTok.", retryable: false }]);
});

test("a lost CREATE response is recovered by re-sending the saved envelope, not a conflicting rebuild", async () => {
  const { handler, calls, store } = harness({ dropFirstResponse: true, metaDedup: false });
  const first = await send(handler, body());
  assert.equal(first.status, 502);
  assert.ok(store.map.get("intent/intent-0001").pending, "the envelope was saved before CREATE was called");
  const second = await send(handler, body());
  assert.equal(second.status, 200, "retry replays instead of 409");
  assert.deepEqual(calls.workstation[1].envelope, calls.workstation[0].envelope);
  assert.equal(calls.media, 1, "no second MEDIA upload for the same attempt");
  assert.equal(store.map.get("intent/intent-0001").pending, undefined);
});

test("a retry after MEDIA starts reporting deduplicated does not change the Post content", async () => {
  const { handler, calls } = harness({ backupState: "failed" });
  assert.equal((await send(handler, body())).status, 201);
  const retry = await send(handler, body());
  assert.equal(retry.status, 200);
  assert.deepEqual(calls.workstation[1].envelope, calls.workstation[0].envelope);
});

test("a meme send does not claim a Collection, uses a canonical Series, and does not touch MEDIA linked identifiers", async () => {
  const { handler, calls } = harness();
  await send(handler, body());
  const { envelope } = calls.workstation[0];
  assert.equal(envelope.sourceCards[0].media.association, undefined);
  assert.deepEqual(envelope.draft.series, ["H"]);
  assert.deepEqual(envelope.publicationBrief.series, ["H"]);
});

test("Series is operator-selectable, validated, defaults to H, and a change updates the same Post", async () => {
  const { handler, calls } = harness();
  assert.equal((await send(handler, body())).status, 201);
  assert.deepEqual(calls.workstation[0].envelope.draft.series, ["H"]);
  assert.equal((await send(handler, body({ series: "J" }))).status, 400, "unknown options are refused, not invented");
  const changed = await send(handler, body({ series: "A" }));
  assert.equal(changed.status, 200);
  assert.deepEqual(calls.workstation[1].envelope.publicationBrief.series, ["A"]);
  assert.equal(calls.workstation[1].envelope.sourceVersion, 2);
});

test("the canonical I = Meme Series can be sent, and nothing forces memes into it", async () => {
  const { handler, calls } = harness();
  assert.equal((await send(handler, body({ series: "I" }))).status, 201);
  assert.deepEqual(calls.workstation[0].envelope.draft.series, ["I"]);
  assert.ok((await send(handler, body({ sendIntentId: "intent-0002" }))).ok);
  assert.deepEqual(calls.workstation[1].envelope.draft.series, ["H"], "unspecified Series still defaults to the existing option, not I");
});

test("lost response, then an edit: the old attempt is settled first and the edit becomes the next version", async () => {
  const { handler, calls, store } = harness({ dropFirstResponse: true });
  assert.equal((await send(handler, body())).status, 502);
  const edited = await send(handler, body({ caption: "Edited caption" }));
  assert.ok(edited.ok, "no version conflict");
  const [lost, replayOfLost, edit] = calls.workstation.map(c => c.envelope);
  assert.deepEqual(replayOfLost, lost, "the lost attempt is re-sent exactly as saved");
  assert.equal(edit.sourceVersion, 2);
  assert.equal(edit.expectedSourceVersion, 1);
  assert.equal(edit.draft.caption, "Edited caption");
  assert.equal(store.map.get("intent/intent-0001").pending, undefined);
  assert.equal(store.map.get("intent/intent-0001").sourceVersion, 2);
});

test("successive edits chain versions 1, 2, 3 with compare-and-swap", async () => {
  const { handler, calls } = harness();
  assert.ok((await send(handler, body())).ok);
  assert.ok((await send(handler, body({ caption: "Edit A" }))).ok);
  assert.ok((await send(handler, body({ caption: "Edit B" }))).ok);
  assert.deepEqual(calls.workstation.map(c => c.envelope.sourceVersion), [1, 2, 3]);
  assert.deepEqual(calls.workstation.map(c => c.envelope.expectedSourceVersion), [null, 1, 2]);
});

test("a retry of an unconfirmed UPDATE with unchanged content re-sends that update's saved envelope", async () => {
  const state = harness();
  const { handler, calls, store } = state;
  assert.equal((await send(handler, body())).status, 201);
  // Simulate a lost update response: persist the pending update the way the handler does, without a receipt for it.
  const prior = store.map.get("intent/intent-0001");
  const edited = body({ caption: "Edit A" });
  const res = await send(handler, edited);
  assert.equal(res.status, 200);
  const saved = JSON.parse(JSON.stringify(store.map.get("intent/intent-0001")));
  store.map.set("intent/intent-0001", { ...prior, pending: { contentDigest: saved.contentDigest, assetId: saved.assetId, envelope: saved.envelope } });
  const before = calls.workstation.length;
  const retry = await send(handler, edited);
  assert.equal(retry.status, 200);
  assert.equal(calls.workstation.length, before + 1);
  assert.deepEqual(calls.workstation.at(-1).envelope, saved.envelope, "same envelope, not a rebuilt one");
});

const BLANK_OPTIONALS = { setup: "", punchline: "", hashtags: "   ", stillSource: { kind: "upload", title: " ", publisher: "", query: "" }, framing: { framing: "", focusX: 0.5, focusY: 0.5, textPlacement: "" } };

test("a draft with blank optional text is omitted from the envelope, not sent as empty strings", async () => {
  const { handler, calls } = harness();
  const res = await send(handler, body({ ...BLANK_OPTIONALS }));
  assert.equal(res.status, 201, "CREATE accepts an envelope with the blank optionals omitted");
  const { meme, sourceCards } = calls.workstation[0].envelope;
  for (const key of ["setup", "punchline", "hashtags", "visualDirection"]) assert.equal(Object.hasOwn(meme, key), false, key);
  for (const key of ["title", "publisher", "query"]) assert.equal(Object.hasOwn(meme.stillSource, key), false, key);
  assert.deepEqual(meme.framing, { focusX: 0.5, focusY: 0.5 });
  assert.equal(meme.hook, "Hook");
  assert.equal(meme.caption, "English caption");
  assert.equal(sourceCards[0].title, "Hook", "no dangling ' / ' title when setup and punchline are blank");
});

test("a single blank optional keeps the other text and a readable title", async () => {
  const { handler, calls } = harness();
  assert.equal((await send(handler, body({ punchline: "" }))).status, 201);
  const { meme, sourceCards } = calls.workstation[0].envelope;
  assert.equal(meme.setup, "Setup");
  assert.equal(Object.hasOwn(meme, "punchline"), false);
  assert.equal(sourceCards[0].title, "Setup");
});

test("recovery: a saved pending envelope that still holds a blank punchline is sent clean on the same-intent retry", async () => {
  const { handler, calls, store, digests } = harness();
  // First, a normal send builds a valid envelope; then rewrite the store the way the failed hosted attempt left it:
  // an unconfirmed pending record whose saved envelope contains punchline: "".
  assert.equal((await send(handler, body({ punchline: "" }))).status, 201);
  const good = JSON.parse(JSON.stringify(store.map.get("intent/intent-0001")));
  const legacyEnvelope = JSON.parse(JSON.stringify(good.envelope));
  legacyEnvelope.meme.punchline = "";
  legacyEnvelope.sourceCards[0].title = "Setup / ";
  store.map.set("intent/intent-0001", {
    memeGroupId: good.memeGroupId,
    sendIntentId: good.sendIntentId,
    pending: { contentDigest: good.contentDigest, assetId: good.assetId, envelope: legacyEnvelope, attemptedAt: "2026-11-06T16:03:04Z" },
  });
  digests.clear(); // CREATE never accepted the failed hosted attempt, so it holds no prior record for this key
  const mediaBefore = calls.media;
  const sentBefore = calls.workstation.length;
  const retry = await send(handler, body({ punchline: "" }));
  assert.ok(retry.status === 200 || retry.status === 201, `same intent now reaches CREATE and succeeds (got ${retry.status})`);
  assert.equal(calls.media, mediaBefore, "the saved asset is reused, not re-registered");
  assert.equal(calls.workstation.length, sentBefore + 1);
  const sent = calls.workstation.at(-1).envelope;
  assert.equal(Object.hasOwn(sent.meme, "punchline"), false);
  const { meme: sentMeme, ...sentRest } = sent;
  const { meme: legacyMeme, ...legacyRest } = legacyEnvelope;
  assert.deepEqual(sentRest, legacyRest, "intent, version, identity, image and every other field are unchanged");
  const { punchline, ...legacyMemeRest } = legacyMeme;
  assert.deepEqual(sentMeme, legacyMemeRest);
  const record = store.map.get("intent/intent-0001");
  assert.equal(record.pending, undefined, "pending is cleared only after CREATE confirmed");
  assert.equal(record.receipt.postId, "post-1");
  // A further identical retry replays and creates nothing new.
  const again = await send(handler, body({ punchline: "" }));
  assert.ok(again.status === 200 || again.status === 201);
  assert.equal(calls.workstation.length, sentBefore + 1, "no duplicate Post or upstream write");
});

test("the saved pending record is kept if CREATE still refuses the recovery attempt", async () => {
  const { handler, store } = harness();
  assert.equal((await send(handler, body({ punchline: "" }))).status, 201);
  const good = JSON.parse(JSON.stringify(store.map.get("intent/intent-0001")));
  const legacyEnvelope = JSON.parse(JSON.stringify(good.envelope));
  legacyEnvelope.meme.hook = "";
  store.map.set("intent/intent-0001", { memeGroupId: good.memeGroupId, sendIntentId: good.sendIntentId, pending: { contentDigest: good.contentDigest, assetId: good.assetId, envelope: legacyEnvelope } });
  const before = JSON.stringify(store.map.get("intent/intent-0001").pending.envelope);
  const retry = await send(handler, body({ punchline: "" }));
  assert.equal(retry.status, 502);
  assert.equal(JSON.stringify(store.map.get("intent/intent-0001").pending.envelope), before, "original pending envelope is untouched");
});

test("an empty hook is refused before any MEDIA upload, so no orphan asset is created", async () => {
  const { handler, calls } = harness();
  const res = await send(handler, body({ hook: "  " }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /hook is required/i);
  assert.equal(calls.media, 0);
  assert.equal(calls.workstation.length, 0);
});

test("prepareEnvelopeForCreate leaves non-blank values and required fields alone and is idempotent", () => {
  const envelope = { sourceVersion: 1, meme: { hook: "H", caption: "C", setup: "S", punchline: "", stillSource: { kind: "search", title: "T", publisher: "" }, registration: { assetId: "a" } } };
  const once = prepareEnvelopeForCreate(envelope);
  assert.deepEqual(once.meme, { hook: "H", caption: "C", setup: "S", stillSource: { kind: "search", title: "T" }, registration: { assetId: "a" } });
  assert.deepEqual(prepareEnvelopeForCreate(once), once);
  assert.equal(envelope.meme.punchline, "", "the input is not mutated");
  assert.deepEqual(prepareEnvelopeForCreate({ nope: 1 }), { nope: 1 });
});

test("a CREATE validation rejection surfaces its code and field message, and the pending record is kept", async () => {
  const { handler, store } = harness({ createRejection: { status: 400, body: { error: "meme.hook must not be empty", code: "FANDOM_PROJECT_VALIDATION_ERROR" } } });
  const res = await send(handler, body());
  assert.equal(res.status, 502);
  const out = await res.json();
  assert.equal(out.code, "FANDOM_PROJECT_VALIDATION_ERROR");
  assert.match(out.error, /HTTP 400\): meme\.hook must not be empty\./);
  assert.ok(store.map.get("intent/intent-0001").pending, "pending kept for same-intent recovery");
});

test("other CREATE errors expose only a well-formed code, never the body text", async () => {
  const { handler } = harness({ createRejection: { status: 503, body: { error: "secret-ish internal detail", code: "FANDOM_PLATFORM_RELATION_UNRESOLVED" } } });
  const out = await (await send(handler, body())).json();
  assert.equal(out.code, "FANDOM_PLATFORM_RELATION_UNRESOLVED");
  assert.equal(out.error, "CREATE rejected the draft (HTTP 503).");
  const bad = harness({ createRejection: { status: 500, body: { error: "x", code: "<script>bad code</script>" } } });
  const o2 = await (await send(bad.handler, body())).json();
  assert.equal(o2.code, undefined);
  assert.equal(o2.error, "CREATE rejected the draft (HTTP 500).");
});

test("validation text is passed through only when it matches the closed field-path allowlist", async () => {
  const cases = [
    ["meme.stillSource.title must not be empty", "CREATE rejected the draft (HTTP 400): meme.stillSource.title must not be empty."],
    ["meme.framing.focusX must be a finite number", "CREATE rejected the draft (HTTP 400): meme.framing.focusX must be a finite number."],
    // Never forwarded: caller-controlled key names, idempotency keys, free text, unknown paths, other phrasings.
    ["meme contains unexpected field(s): sk_live_SECRET-key, x", "CREATE rejected the draft (HTTP 400)."],
    ["Idempotency-Key fandom/direct/card/abc/meme-tiktok-send-1 does not match the request", "CREATE rejected the draft (HTTP 400)."],
    ["meme.sk_live_SECRET must not be empty", "CREATE rejected the draft (HTTP 400)."],
    ["meme.hook must not be empty because user typed SECRET", "CREATE rejected the draft (HTTP 400)."],
    ["meme.hook must be one of a, b", "CREATE rejected the draft (HTTP 400)."],
    ["sourceCards[0].media.association must be omitted", "CREATE rejected the draft (HTTP 400)."],
    ["meme.hook must not be empty\nSECRET", "CREATE rejected the draft (HTTP 400)."],
  ];
  for (const [text, expected] of cases) {
    const { handler, store } = harness({ createRejection: { status: 400, body: { error: text, code: "FANDOM_PROJECT_VALIDATION_ERROR" } } });
    const out = await (await send(handler, body())).json();
    assert.equal(out.error, expected, text);
    assert.equal(out.code, "FANDOM_PROJECT_VALIDATION_ERROR", "the code is always preserved");
    assert.ok(!JSON.stringify(out).includes("SECRET") && !JSON.stringify(out).includes("sk_live") && !JSON.stringify(out).includes("send-1"), text);
    assert.ok(store.map.get("intent/intent-0001").pending, "pending intent preserved");
  }
});
