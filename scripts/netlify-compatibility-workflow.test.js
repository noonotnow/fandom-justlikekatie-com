import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../.github/workflows/test.yml", import.meta.url);

function indentedBlock(source, startPattern, endPattern) {
  const start = source.search(startPattern);
  assert.notEqual(start, -1, `Missing workflow block matching ${startPattern}`);

  const remainder = source.slice(start);
  const end = remainder.slice(1).search(endPattern);
  return end === -1 ? remainder : remainder.slice(0, end + 1);
}

function workflowStep(job, name) {
  return indentedBlock(
    job,
    new RegExp(`^      - name: ${name}$`, "m"),
    /^      - (?:name:|uses:)/m,
  );
}

test("Netlify compatibility workflow preserves the reviewed proposal contract", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const job = indentedBlock(
    workflow,
    /^  netlify-package-compatibility:$/m,
    /^  [a-zA-Z0-9_-]+:$/m,
  );

  assert.match(
    job,
    /^    if: github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'$/m,
  );
  assert.match(job, /^    permissions:\n      contents: write\n      pull-requests: write$/m);

  const resolveStep = workflowStep(job, "Resolve Netlify CLI versions");
  assert.match(resolveStep, /echo "candidate=\$candidate" >> "\$GITHUB_OUTPUT"/);

  const compatibilityStep = workflowStep(
    job,
    "Verify candidate Netlify packaging contract",
  );
  assert.match(
    compatibilityStep,
    /^          NETLIFY_CLI_VERSION: \$\{\{ steps\.netlify_cli\.outputs\.candidate \}\}$/m,
  );
  assert.match(
    compatibilityStep,
    /^        run: npm run check:scheduled-functions-package:compat$/m,
  );

  const prepareStep = workflowStep(job, "Prepare reviewed pin upgrade");
  assert.match(
    prepareStep,
    /^        if: steps\.netlify_cli\.outputs\.upgrade == 'true'$/m,
  );
  assert.match(
    prepareStep,
    /update-netlify-cli-pin\.js "\$\{\{ steps\.netlify_cli\.outputs\.candidate \}\}"/,
  );

  const proposalStep = workflowStep(
    job,
    "Create or refresh Netlify CLI upgrade proposal",
  );
  assert.match(
    proposalStep,
    /^        if: steps\.netlify_cli\.outputs\.upgrade == 'true'$/m,
  );
  assert.match(proposalStep, /^        uses: peter-evans\/create-pull-request@v7$/m);
  assert.match(
    proposalStep,
    /commit-message: "chore: update Netlify CLI release pin to \$\{\{ steps\.netlify_cli\.outputs\.candidate \}\}"/,
  );
  assert.match(
    proposalStep,
    /title: "\[Netlify CLI\] Upgrade release pin to \$\{\{ steps\.netlify_cli\.outputs\.candidate \}\}"/,
  );
  assert.match(
    proposalStep,
    /Upgrade candidate: `\$\{\{ steps\.netlify_cli\.outputs\.candidate \}\}`/,
  );
  assert.match(
    proposalStep,
    /netlify-cli@\$\{\{ steps\.netlify_cli\.outputs\.candidate \}\}.*manifest successfully/,
  );
  assert.match(proposalStep, /It does not merge automatically/);
  assert.doesNotMatch(job, /\b(?:auto-merge|merge-pull-request)\b/i);
});