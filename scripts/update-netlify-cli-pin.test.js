import assert from "node:assert/strict";
import test from "node:test";
import {
  compareVersions,
  getNetlifyCliReleasePin,
  updateNetlifyCliReleasePin,
} from "./update-netlify-cli-pin.js";

function packageJsonWithPin(version = "27.8.0") {
  return {
    scripts: {
      "check:scheduled-functions-package": `npx --yes netlify-cli@${version} build --offline`,
      "check:scheduled-functions-package:compat":
        "npx --yes netlify-cli@${NETLIFY_CLI_VERSION:-latest} build --offline",
    },
  };
}

test("reads the exact release pin without confusing the compatibility command", () => {
  assert.equal(getNetlifyCliReleasePin(packageJsonWithPin()), "27.8.0");
});

test("compares stable semantic versions numerically", () => {
  assert.equal(compareVersions("27.10.0", "27.8.0"), 1);
  assert.equal(compareVersions("27.8.0", "27.8.0"), 0);
  assert.equal(compareVersions("26.12.0", "27.1.0"), -1);
});

test("updates only the deterministic release command", () => {
  const packageJson = packageJsonWithPin();

  assert.equal(updateNetlifyCliReleasePin(packageJson, "28.0.0"), true);
  assert.match(
    packageJson.scripts["check:scheduled-functions-package"],
    /netlify-cli@28\.0\.0/,
  );
  assert.match(
    packageJson.scripts["check:scheduled-functions-package:compat"],
    /NETLIFY_CLI_VERSION/,
  );
});

test("does not rewrite an unchanged pin", () => {
  assert.equal(
    updateNetlifyCliReleasePin(packageJsonWithPin(), "27.8.0"),
    false,
  );
});

test("rejects downgrades and non-stable candidates", () => {
  assert.throws(
    () => updateNetlifyCliReleasePin(packageJsonWithPin(), "27.7.0"),
    /Refusing to downgrade/,
  );
  assert.throws(
    () => updateNetlifyCliReleasePin(packageJsonWithPin(), "latest"),
    /Expected stable x\.y\.z versions/,
  );
});
