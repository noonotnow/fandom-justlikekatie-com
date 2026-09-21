import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const RELEASE_CHECK_SCRIPT = "check:scheduled-functions-package";
const PIN_PATTERN = /netlify-cli@(\d+\.\d+\.\d+)/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export function getNetlifyCliReleasePin(packageJson) {
  const command = packageJson?.scripts?.[RELEASE_CHECK_SCRIPT];
  if (typeof command !== "string") {
    throw new Error(`package.json is missing scripts.${RELEASE_CHECK_SCRIPT}`);
  }

  const match = command.match(PIN_PATTERN);
  if (!match) {
    throw new Error(
      `${RELEASE_CHECK_SCRIPT} must contain an exact netlify-cli@x.y.z release pin`,
    );
  }
  return match[1];
}

export function compareVersions(left, right) {
  if (!VERSION_PATTERN.test(left) || !VERSION_PATTERN.test(right)) {
    throw new Error(
      `Expected stable x.y.z versions; received ${left} and ${right}`,
    );
  }

  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return Math.sign(leftParts[index] - rightParts[index]);
    }
  }
  return 0;
}

export function updateNetlifyCliReleasePin(packageJson, candidate) {
  const current = getNetlifyCliReleasePin(packageJson);
  const comparison = compareVersions(candidate, current);
  if (comparison < 0) {
    throw new Error(
      `Refusing to downgrade the Netlify CLI release pin from ${current} to ${candidate}`,
    );
  }
  if (comparison === 0) {
    return false;
  }

  packageJson.scripts[RELEASE_CHECK_SCRIPT] = packageJson.scripts[
    RELEASE_CHECK_SCRIPT
  ].replace(PIN_PATTERN, `netlify-cli@${candidate}`);
  return true;
}

async function main() {
  const packagePath = new URL("../package.json", import.meta.url);
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  const [argument, value] = process.argv.slice(2);
  const current = getNetlifyCliReleasePin(packageJson);

  if (argument === "--current") {
    console.log(current);
    return;
  }

  if (argument === "--check-candidate") {
    compareVersions(value, current);
    console.log(
      `Netlify CLI candidate ${value} is valid; release pin is ${current}.`,
    );
    return;
  }

  if (argument === "--is-newer") {
    console.log(compareVersions(value, current) > 0);
    return;
  }

  if (!argument || value) {
    throw new Error(
      "Usage: node scripts/update-netlify-cli-pin.js <x.y.z> | --current | --check-candidate <x.y.z> | --is-newer <x.y.z>",
    );
  }

  if (updateNetlifyCliReleasePin(packageJson, argument)) {
    await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    console.log(
      `Updated Netlify CLI release pin from ${current} to ${argument}.`,
    );
  } else {
    console.log(`Netlify CLI release pin is already ${current}.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
