import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("Netlify compatibility proposals keep their dedicated overlap protection", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const compatibilityJob = indentedBlock(
    workflow,
    /^  netlify-package-compatibility:$/m,
    /^  [a-zA-Z0-9_-]+:$/m,
  );
  const testJob = indentedBlock(
    workflow,
    /^  test:$/m,
    /^  [a-zA-Z0-9_-]+:$/m,
  );

  assert.match(
    compatibilityJob,
    /^    concurrency:\n      group: netlify-package-compatibility-proposal\n      cancel-in-progress: true$/m,
  );
  assert.doesNotMatch(testJob, /netlify-package-compatibility-proposal/);
  assert.doesNotMatch(testJob, /^    concurrency:$/m);
});

test("launchpad preview smoke check runs after successful production deployments only", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const job = indentedBlock(
    workflow,
    /^  production-launchpad-preview:$/m,
    /^  [a-zA-Z0-9_-]+:$/m,
  );

  assert.match(workflow, /^  deployment_status:$/m);
  assert.match(job, /github\.event_name == 'schedule'/);
  assert.match(job, /github\.event_name == 'workflow_dispatch'/);
  assert.match(job, /github\.event_name == 'deployment_status'/);
  assert.match(job, /github\.event\.deployment_status\.state == 'success'/);
  assert.match(
    job,
    /github\.event\.deployment\.environment == 'production' \|\| github\.event\.deployment\.environment == 'Production'/,
  );
  assert.match(job, /run: npm run check:launchpad-preview/);

  const notificationStep = workflowStep(
    job,
    "Notify operators about failed launchpad preview",
  );
  assert.match(notificationStep, /^        if: failure\(\)$/m);
  assert.match(
    notificationStep,
    /^          RESEND_API_KEY: \$\{\{ secrets\.RESEND_API_KEY \}\}$/m,
  );
  assert.match(
    notificationStep,
    /^          FANDOM_AUTH_FROM_EMAIL: \$\{\{ secrets\.FANDOM_AUTH_FROM_EMAIL \}\}$/m,
  );
  assert.match(
    notificationStep,
    /^          FANDOM_ADMIN_EMAILS: \$\{\{ secrets\.FANDOM_ADMIN_EMAILS \}\}$/m,
  );
  assert.match(
    notificationStep,
    /^        run: npm run check:launchpad-preview -- --notify-failure$/m,
  );
});

test("operator alert configuration is checked on a schedule without sending email", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const job = indentedBlock(
    workflow,
    /^  operator-alert-configuration:$/m,
    /^  [a-zA-Z0-9_-]+:$/m,
  );
  assert.match(job, /^    if: \(github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'\) && github\.ref == 'refs\/heads\/main'$/m);
  assert.match(job, /^    name: Verify operator alert delivery configuration$/m);
  assert.match(job, /^    environment: operator-sender-verification$/m);
  const check = workflowStep(job, "Check Resend credentials and verified sender without emailing");
  for (const secret of ["RESEND_API_KEY", "RESEND_DOMAIN_READ_API_KEY", "FANDOM_AUTH_FROM_EMAIL", "FANDOM_ADMIN_EMAILS"]) {
    assert.match(check, new RegExp(`^          ${secret}: \\$\\{\\{ secrets\\.${secret} \\}\\}$`, "m"));
  }
  assert.match(check, /^        run: npm run check:launchpad-preview -- --check-alert-configuration$/m);
  assert.doesNotMatch(job, /--notify-failure/);
});

test("shared Stripe audit consistency check stays protected and scheduled", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const job = indentedBlock(
    workflow,
    /^  shared-stripe-audit-consistency:$/m,
    /^  [a-zA-Z0-9_-]+:$/m,
  );

  assert.match(
    job,
    /^    if: github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'$/m,
  );
  assert.match(job, /^    name: Shared Stripe audit consistency check$/m);

  const checkStep = workflowStep(
    job,
    "Run shared Stripe audit consistency check",
  );
  assert.match(
    checkStep,
    /^          SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_SITE_ID: \$\{\{ secrets\.SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_SITE_ID \}\}$/m,
  );
  assert.match(
    checkStep,
    /^          SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_TOKEN: \$\{\{ secrets\.SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_TOKEN \}\}$/m,
  );
  assert.match(
    checkStep,
    /::error::Shared Stripe audit consistency check requires its protected Blob site ID and token\./,
  );
  assert.match(
    checkStep,
    /node --test scripts\/audit-subscription-products\.blob-integration\.test\.js/,
  );
  assert.match(
    checkStep,
    /\[ -z "\$SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_SITE_ID" \].*\[ -z "\$SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_TOKEN" \]/,
  );
  assert.doesNotMatch(job, /github\.event_name == '(?:push|pull_request)'/);
});

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
  assert.match(
    workflow,
    /verification_only:\n        description: "Exercise the review-PR path even when the release pin is current"/,
  );
  assert.match(job, /^    permissions:\n      contents: write\n      pull-requests: write$/m);
  assert.match(
    job,
    /^      - name: Set up pnpm\n        uses: pnpm\/action-setup@v4$/m,
  );

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

  const verificationStep = workflowStep(
    job,
    "Prepare verification-only proposal receipt",
  );
  assert.match(verificationStep, /^        if: inputs\.verification_only$/m);
  assert.match(
    verificationStep,
    /tested candidate \\`netlify-cli@\$\{\{ steps\.netlify_cli\.outputs\.candidate \}\}\\`/,
  );

  const proposalStep = workflowStep(
    job,
    "Create or refresh Netlify CLI upgrade proposal",
  );
  assert.match(job, /^          ref: \$\{\{ github\.event_name == 'schedule' && 'main' \|\| github\.ref \}\}$/m);
  const filesStep = workflowStep(job, "Select proposal files");
  assert.match(filesStep, /^        id: proposal_files$/m);
  assert.match(filesStep, /^          VERIFICATION_ONLY: \$\{\{ inputs\.verification_only \}\}$/m);
  assert.match(proposalStep, /^          add-paths: \$\{\{ steps\.proposal_files\.outputs\.paths \}\}$/m);
  assert.match(proposalStep, /^          branch: \$\{\{ inputs\.verification_only && 'automation\/netlify-cli-pin-verification' \|\| 'automation\/netlify-cli-pin' \}\}$/m);
  assert.match(
    proposalStep,
    /^        if: steps\.netlify_cli\.outputs\.upgrade == 'true' \|\| inputs\.verification_only$/m,
  );
  assert.match(proposalStep, /^        uses: peter-evans\/create-pull-request@v7$/m);
  assert.match(
    proposalStep,
    /^          token: \$\{\{ secrets\.REPO_ADMIN_PAT \}\}$/m,
  );
  assert.match(
    proposalStep,
    /title: "\$\{\{ inputs\.verification_only && '\[Verification only\] ' \|\| '' \}\}\[Netlify CLI\] Upgrade release pin to/,
  );
  assert.match(
    proposalStep,
    /> \*\*Verification only:\*\* This temporary proposal exercises the review pull-request path and must not be merged\./,
  );
  assert.match(
    proposalStep,
    /commit-message: "\$\{\{ inputs\.verification_only && 'test: verify Netlify CLI proposal for' \|\| 'chore: update Netlify CLI release pin to' \}\} \$\{\{ steps\.netlify_cli\.outputs\.candidate \}\}"/,
  );
  assert.match(
    proposalStep,
    /title: "\$\{\{ inputs\.verification_only && '\[Verification only\] ' \|\| '' \}\}\[Netlify CLI\] Upgrade release pin to \$\{\{ steps\.netlify_cli\.outputs\.candidate \}\}"/,
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

test("Netlify proposals stage only files present in each run mode", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const job = indentedBlock(workflow, /^  netlify-package-compatibility:$/m, /^  [a-zA-Z0-9_-]+:$/m);
  const step = workflowStep(job, "Select proposal files");
  const script = step.split("        run: |\n")[1].split("\n").map((line) => line.slice(10)).join("\n");
  assert.ok(script);
  for (const [verificationOnly, expected] of [
    ["false", ["package.json"]],
    ["true", ["package.json", ".github/netlify-cli-proposal-verification.md"]],
  ]) {
    const directory = await mkdtemp(join(tmpdir(), "netlify-proposal-paths-"));
    const output = join(directory, "output");
    try {
      const result = spawnSync("bash", ["-e", "-c", script], {
        env: { ...process.env, VERIFICATION_ONLY: verificationOnly, GITHUB_OUTPUT: output },
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual((await readFile(output, "utf8")).trim().split("\n"), ["paths<<EOF", ...expected, "EOF"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test("sender verification runs only on main with a restricted environment", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const job = indentedBlock(
    workflow,
    /^  operator-alert-configuration:$/m,
    /^  [a-zA-Z0-9_-]+:$/m,
  );
  assert.match(job, /^    if: \(github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'\) && github\.ref == 'refs\/heads\/main'$/m);
  assert.match(job, /^    environment: operator-sender-verification$/m);
  const check = workflowStep(job, "Check Resend credentials and verified sender without emailing");
  assert.match(check, /^          RESEND_DOMAIN_READ_API_KEY: \$\{\{ secrets\.RESEND_DOMAIN_READ_API_KEY \}\}$/m);
  assert.match(check, /^        run: npm run check:launchpad-preview -- --check-alert-configuration$/m);
  assert.doesNotMatch(job, /--notify-failure/);
});
