/**
 * Contract test: the payload produced by gridExportEventFromRecord (client,
 * src/utils/gridExportLog.ts) must pass validateGridPayload (server,
 * log-engagement.js) without modification.
 *
 * This file is pure JS so it runs under `npm run test:functions`
 * (node --test netlify/functions/lib/*.test.js) even though the client
 * source is TypeScript.  The payload shape is mirrored manually here;
 * whenever GridExportEvent changes, this fixture must be kept in sync.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { validateGridPayload, GRID_STRING_FIELDS, GRID_ALLOWED_FIELDS } from "./grid-export-validation.js";

// ---------------------------------------------------------------------------
// Minimal valid payload — mirrors exactly what gridExportEventFromRecord
// returns for a single-image grid.
// ---------------------------------------------------------------------------
function validPayload(overrides = {}) {
  return {
    gridId: "vibe-atlas-2026-08-01-actor-1",
    date: "2026-08-01",
    actorId: "actor-1",
    actor: "刘学义",
    actorEn: "Liu Xueyi",
    vibe: "破碎感美人",
    vibeEn: "Shattered Beauty",
    searchSpell: "刘学义 破碎感",
    tier: "standard",
    variant: "full",
    imageIds: ["https://images.example/result-0.jpg"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test("valid minimal payload (no ctaSeed) passes", () => {
  assert.equal(validateGridPayload(validPayload()), null);
});

test("valid payload with ctaSeed passes", () => {
  assert.equal(validateGridPayload(validPayload({ ctaSeed: "cta-abc123" })), null);
});

test("valid payload with 9 imageIds passes", () => {
  const imageIds = Array.from({ length: 9 }, (_, i) => `https://images.example/${i}.jpg`);
  assert.equal(validateGridPayload(validPayload({ imageIds })), null);
});

test("teaser variant is accepted", () => {
  assert.equal(validateGridPayload(validPayload({ variant: "teaser" })), null);
});

// ---------------------------------------------------------------------------
// Required string fields
// ---------------------------------------------------------------------------

for (const field of GRID_STRING_FIELDS) {
  test(`missing required field: ${field}`, () => {
    const payload = validPayload();
    delete payload[field];
    const err = validateGridPayload(payload);
    assert.ok(err, `expected an error when ${field} is missing`);
    assert.ok(err.includes(field), `error mentions '${field}': ${err}`);
  });

  test(`wrong type for required field: ${field}`, () => {
    const err = validateGridPayload(validPayload({ [field]: 42 }));
    assert.ok(err, `expected an error when ${field} is a number`);
    assert.ok(err.includes(field), `error mentions '${field}': ${err}`);
  });
}

// ---------------------------------------------------------------------------
// variant field
// ---------------------------------------------------------------------------

test("variant must be full or teaser — rejects 'preview'", () => {
  const err = validateGridPayload(validPayload({ variant: "preview" }));
  assert.ok(err);
  assert.match(err, /variant/);
});

test("variant must be full or teaser — rejects undefined", () => {
  const payload = validPayload();
  delete payload.variant;
  const err = validateGridPayload(payload);
  assert.ok(err);
  assert.match(err, /variant/);
});

test("variant must be full or teaser — rejects null", () => {
  const err = validateGridPayload(validPayload({ variant: null }));
  assert.ok(err);
  assert.match(err, /variant/);
});

// ---------------------------------------------------------------------------
// imageIds field
// ---------------------------------------------------------------------------

test("imageIds must be an array", () => {
  const err = validateGridPayload(validPayload({ imageIds: "not-an-array" }));
  assert.ok(err);
  assert.match(err, /imageIds/);
});

test("imageIds must not be empty", () => {
  const err = validateGridPayload(validPayload({ imageIds: [] }));
  assert.ok(err);
  assert.match(err, /imageIds/);
});

test("imageIds must not exceed 9 entries", () => {
  const imageIds = Array.from({ length: 10 }, (_, i) => `https://images.example/${i}.jpg`);
  const err = validateGridPayload(validPayload({ imageIds }));
  assert.ok(err);
  assert.match(err, /imageIds/);
});

test("imageIds entries must be strings", () => {
  const err = validateGridPayload(validPayload({ imageIds: [42] }));
  assert.ok(err);
  assert.match(err, /imageIds/);
});

// ---------------------------------------------------------------------------
// ctaSeed field (optional)
// ---------------------------------------------------------------------------

test("ctaSeed: absent is fine", () => {
  const payload = validPayload();
  delete payload.ctaSeed;
  assert.equal(validateGridPayload(payload), null);
});

test("ctaSeed: non-string is rejected", () => {
  const err = validateGridPayload(validPayload({ ctaSeed: 99 }));
  assert.ok(err);
  assert.match(err, /ctaSeed/);
});

// ---------------------------------------------------------------------------
// gridWasSaved field (optional boolean)
// ---------------------------------------------------------------------------

test("gridWasSaved: absent is fine", () => {
  const payload = validPayload();
  delete payload.gridWasSaved;
  assert.equal(validateGridPayload(payload), null);
});

test("gridWasSaved: true is accepted", () => {
  assert.equal(validateGridPayload(validPayload({ gridWasSaved: true })), null);
});

test("gridWasSaved: false is accepted", () => {
  assert.equal(validateGridPayload(validPayload({ gridWasSaved: false })), null);
});

test("gridWasSaved: non-boolean is rejected", () => {
  const err = validateGridPayload(validPayload({ gridWasSaved: "yes" }));
  assert.ok(err);
  assert.match(err, /gridWasSaved/);
});

// ---------------------------------------------------------------------------
// Unknown fields
// ---------------------------------------------------------------------------

test("unknown field is rejected", () => {
  const err = validateGridPayload(validPayload({ unknownField: "surprise" }));
  assert.ok(err);
  assert.match(err, /unknown grid field/);
});

test("extra nested object is rejected", () => {
  const err = validateGridPayload(validPayload({ meta: { source: "test" } }));
  assert.ok(err);
  assert.match(err, /unknown grid field/);
});

// ---------------------------------------------------------------------------
// Non-object inputs
// ---------------------------------------------------------------------------

test("null is rejected", () => {
  const err = validateGridPayload(null);
  assert.ok(err);
});

test("array is rejected", () => {
  const err = validateGridPayload([validPayload()]);
  assert.ok(err);
});

test("string is rejected", () => {
  const err = validateGridPayload("{}");
  assert.ok(err);
});

test("undefined is rejected", () => {
  const err = validateGridPayload(undefined);
  assert.ok(err);
});

// ---------------------------------------------------------------------------
// Size limit
// ---------------------------------------------------------------------------

test("payload over 8 KB is rejected", () => {
  const imageIds = Array.from({ length: 9 }, (_, i) => `https://images.example/${"x".repeat(1000)}-${i}.jpg`);
  const err = validateGridPayload(validPayload({ imageIds }));
  assert.ok(err);
  assert.match(err, /too large/);
});

// ---------------------------------------------------------------------------
// Contract: GRID_ALLOWED_FIELDS matches the GridExportEvent interface
// ---------------------------------------------------------------------------

test("GRID_ALLOWED_FIELDS covers every key in a full client payload", () => {
  // These are all fields GridExportEvent declares in gridExportLog.ts.
  const clientFields = [
    "gridId", "date", "actorId", "actor", "actorEn",
    "vibe", "vibeEn", "searchSpell", "tier",
    "variant", "imageIds", "gridWasSaved", "ctaSeed",
  ];
  for (const field of clientFields) {
    assert.ok(
      GRID_ALLOWED_FIELDS.has(field),
      `GRID_ALLOWED_FIELDS is missing client field: ${field}`,
    );
  }
});

test("GRID_ALLOWED_FIELDS has no extra fields beyond what the client sends", () => {
  const clientFields = new Set([
    "gridId", "date", "actorId", "actor", "actorEn",
    "vibe", "vibeEn", "searchSpell", "tier",
    "variant", "imageIds", "gridWasSaved", "ctaSeed",
  ]);
  for (const field of GRID_ALLOWED_FIELDS) {
    assert.ok(
      clientFields.has(field),
      `GRID_ALLOWED_FIELDS has server-only field not in client: ${field}`,
    );
  }
});
