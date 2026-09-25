import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const EXPECTED_SCHEDULED_FUNCTIONS = new Map([
  ["archive-access-health-scheduled", "@hourly"],
  ["archive-access-retention", "@daily"],
  ["prune-rate-limits", "@hourly"],
  ["receipt-index-health-scheduled", "@hourly"],
]);

export function validateScheduledFunctionsManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.functions)) {
    throw new Error(
      "NETLIFY_MANIFEST_FORMAT_CHANGE: expected a top-level functions array. The Netlify functions manifest contract may have changed; inspect the generated manifest before updating the pinned CLI.",
    );
  }

  const malformedEntry = manifest.functions.find(
    entry => !entry || typeof entry !== "object" || typeof entry.name !== "string",
  );
  if (malformedEntry) {
    throw new Error(
      "NETLIFY_MANIFEST_FORMAT_CHANGE: expected every functions entry to be an object with a string name. The Netlify functions manifest contract may have changed; inspect the generated manifest before updating the pinned CLI.",
    );
  }

  const packagedFunctions = new Map(
    manifest.functions.map(entry => [entry.name, entry]),
  );
  const errors = [];

  for (const [name, expectedSchedule] of EXPECTED_SCHEDULED_FUNCTIONS) {
    const packagedFunction = packagedFunctions.get(name);
    if (!packagedFunction) {
      errors.push(
        `SCHEDULED_JOB_MISSING: ${name} is missing from the packaged Netlify functions manifest (expected ${expectedSchedule})`,
      );
      continue;
    }

    if (packagedFunction.schedule !== expectedSchedule) {
      errors.push(
        `SCHEDULED_JOB_CADENCE_MISMATCH: ${name} packaged schedule is ${JSON.stringify(packagedFunction.schedule ?? null)}; expected ${JSON.stringify(expectedSchedule)}`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Scheduled function package validation failed:\n- ${errors.join("\n- ")}`);
  }
}

async function main() {
  const manifestPath =
    process.argv[2] ?? new URL("../.netlify/functions/manifest.json", import.meta.url);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  validateScheduledFunctionsManifest(manifest);
  console.log(
    `Scheduled function package validation passed: ${EXPECTED_SCHEDULED_FUNCTIONS.size} maintenance jobs have the expected cadence.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}