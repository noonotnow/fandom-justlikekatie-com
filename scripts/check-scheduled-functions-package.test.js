import assert from "node:assert/strict";
import test from "node:test";

import {
  EXPECTED_SCHEDULED_FUNCTIONS,
  validateScheduledFunctionsManifest,
} from "./check-scheduled-functions-package.js";

function expectedManifest() {
  return {
    functions: Array.from(
      EXPECTED_SCHEDULED_FUNCTIONS,
      ([name, schedule]) => ({ name, schedule }),
    ),
  };
}

test("accepts a packaged manifest containing every maintenance function and cadence", () => {
  assert.doesNotThrow(() => validateScheduledFunctionsManifest(expectedManifest()));
});

test("reports a maintenance function omitted during packaging", () => {
  const manifest = expectedManifest();
  manifest.functions = manifest.functions.filter(
    entry => entry.name !== "archive-access-retention",
  );

  assert.throws(
    () => validateScheduledFunctionsManifest(manifest),
    /SCHEDULED_JOB_MISSING: archive-access-retention is missing from the packaged Netlify functions manifest \(expected @daily\)/,
  );
});

test("reports a packaged maintenance function with a changed cadence", () => {
  const manifest = expectedManifest();
  manifest.functions.find(
    entry => entry.name === "prune-rate-limits",
  ).schedule = "@daily";

  assert.throws(
    () => validateScheduledFunctionsManifest(manifest),
    /SCHEDULED_JOB_CADENCE_MISMATCH: prune-rate-limits packaged schedule is "@daily"; expected "@hourly"/,
  );
});

test("rejects malformed manifests with a clear error", () => {
  assert.throws(
    () => validateScheduledFunctionsManifest({}),
    /NETLIFY_MANIFEST_FORMAT_CHANGE: expected a top-level functions array/,
  );
});

test("classifies changed function entry shapes as manifest format changes", () => {
  const manifest = expectedManifest();
  manifest.functions.push({ function_name: "new-format-function" });

  assert.throws(
    () => validateScheduledFunctionsManifest(manifest),
    /NETLIFY_MANIFEST_FORMAT_CHANGE: expected every functions entry to be an object with a string name/,
  );
});
