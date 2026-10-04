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

function environmentEntries(block, indentation) {
  const lines = block.split("\n");
  const header = lines.findIndex((line) => line === `${" ".repeat(indentation)}env:`);
  if (header === -1) return new Map();

  const entries = new Map();
  for (const line of lines.slice(header + 1)) {
    if (!line.trim()) continue;
    const spaces = line.match(/^ */)[0].length;
    if (spaces <= indentation) break;
    if (spaces !== indentation + 2) continue;
    const entry = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    assert.ok(entry, `Invalid environment entry: ${line.trim()}`);
    entries.set(entry[1], entry[2]);
  }
  return entries;
}

function assertNotificationKeyBoundary(workflow) {
  const jobsStart = workflow.search(/^jobs:$/m);
  assert.notEqual(jobsStart, -1, "Expected jobs section");
  const jobs = workflow.slice(jobsStart);
  const jobHeaders = [...jobs.matchAll(/^  ([a-zA-Z0-9_-]+):$/gm)];
  assert.ok(jobHeaders.length > 0, "Expected workflow jobs");
  const workflowEnv = environmentEntries(workflow.slice(0, jobsStart), 0);
  assert.ok(!workflowEnv.has("RESEND_DOMAIN_READ_API_KEY"), "Domain-read key cannot be workflow-wide");

  const notifications = new Map([
    ["production-launchpad-preview", "Notify operators about failed launchpad preview"],
    ["production-archive-records", "Notify operators about failed Archive record verification"],
    ["migration-next-major", "Notify operators about failed PostgreSQL candidate migration"],
    ["shared-stripe-audit-consistency", "Notify operators about failed shared Stripe audit consistency check"],
  ]);
  const authorizedStep = "Check Resend credentials and verified sender without emailing";
  const authorizedJob = "operator-alert-configuration";
  let approvedStep;

  for (const [index, match] of jobHeaders.entries()) {
    const jobName = match[1];
    const job = jobs.slice(match.index, jobHeaders[index + 1]?.index);
    const stepHeaders = [...job.matchAll(/^      - (?:name:|uses:)/gm)];
    assert.ok(stepHeaders.length > 0, `Expected steps in ${jobName}`);
    assert.ok(
      !environmentEntries(job.slice(0, stepHeaders[0].index), 4).has("RESEND_DOMAIN_READ_API_KEY"),
      `Domain-read key cannot be inherited by steps in ${jobName}`,
    );

    for (const [stepIndex, stepHeader] of stepHeaders.entries()) {
      const step = job.slice(stepHeader.index, stepHeaders[stepIndex + 1]?.index);
      const name = step.match(/^      - name: (.+)$/m)?.[1];
      const env = environmentEntries(step, 8);
      const isApproved = jobName === authorizedJob && name === authorizedStep;
      if (isApproved) {
        assert.equal(approvedStep, undefined, "Duplicate sender verification step");
        approvedStep = step;
        assert.equal(env.get("RESEND_DOMAIN_READ_API_KEY"), "${{ secrets.RESEND_DOMAIN_READ_API_KEY }}");
      } else {
        assert.ok(!env.has("RESEND_DOMAIN_READ_API_KEY"), `Domain-read key exposed to ${jobName}: ${name ?? "unnamed step"}`);
      }

      if (name?.startsWith("Notify ") || /--notify-failure|run: node scripts\/notify-/.test(step)) {
        assert.equal(env.get("RESEND_API_KEY"), "${{ secrets.RESEND_API_KEY }}", `Notification step ${jobName}: ${name} must use send-only key`);
        assert.ok(!env.has("RESEND_DOMAIN_READ_API_KEY"), `Notification step ${jobName}: ${name} has domain-read key`);
      }
    }

    if (notifications.has(jobName)) {
      const notification = workflowStep(job, notifications.get(jobName));
      assert.equal(environmentEntries(notification, 8).get("RESEND_API_KEY"), "${{ secrets.RESEND_API_KEY }}");
    }
  }

  assert.ok(approvedStep, "Missing protected sender verification step");
  // Also catch references passed under another variable name, in a run script, or at workflow scope.
  assert.ok(
    !workflow.replace(approvedStep, "").includes("RESEND_DOMAIN_READ_API_KEY"),
    "Domain-read key referenced outside protected sender verification step",
  );
}

test("notification jobs cannot inherit or use the domain-read credential", async () => {
  assertNotificationKeyBoundary(await readFile(workflowPath, "utf8"));
});

test("notification credential boundary rejects misplaced keys and missing send-only keys", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const notification = "      - name: Notify operators about failed launchpad preview\n        if: failure()\n        env:\n";
  assert.throws(
    () => assertNotificationKeyBoundary(workflow.replace(
      notification,
      `${notification}          RESEND_DOMAIN_READ_API_KEY: \${{ secrets.RESEND_DOMAIN_READ_API_KEY }}\n`,
    )),
    /Domain-read key exposed/,
  );
  assert.throws(
    () => assertNotificationKeyBoundary(workflow.replace(
      "  production-launchpad-preview:\n",
      "  production-launchpad-preview:\n    env:\n      RESEND_DOMAIN_READ_API_KEY: ${{ secrets.RESEND_DOMAIN_READ_API_KEY }}\n",
    )),
    /cannot be inherited/,
  );
  assert.throws(
    () => assertNotificationKeyBoundary(workflow.replace(
      "jobs:\n",
      "env:\n  RESEND_DOMAIN_READ_API_KEY: ${{ secrets.RESEND_DOMAIN_READ_API_KEY }}\njobs:\n",
    )),
    /cannot be workflow-wide/,
  );
  assert.throws(
    () => assertNotificationKeyBoundary(workflow.replace(
      "        run: npm run check:launchpad-preview -- --notify-failure",
      "        run: npm run check:launchpad-preview -- --notify-failure ${{ secrets.RESEND_DOMAIN_READ_API_KEY }}",
    )),
    /referenced outside protected sender verification step/,
  );
  assert.throws(
    () => assertNotificationKeyBoundary(workflow.replace(
      "      - name: Notify operators about failed Archive record verification\n        if: failure()\n        env:\n          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}",
      "      - name: Notify operators about failed Archive record verification\n        if: failure()\n        env:\n          RESEND_API_KEY: ${{ secrets.RESEND_DOMAIN_READ_API_KEY }}",
    )),
    /must use send-only key/,
  );
});

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
  assert.match(job, /\(github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'\)/);
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

test("homepage guide smoke check reads the live bundle and rendered menu after production deploys", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const job = indentedBlock(workflow, /^  production-homepage-guides:$/m, /^  [a-zA-Z0-9_-]+:$/m);
  assert.match(job, /github\.event_name == 'deployment_status'/);
  assert.match(job, /github\.event\.deployment_status\.state == 'success'/);
  assert.match(job, /github\.event\.deployment\.environment == 'production' \|\| github\.event\.deployment\.environment == 'Production'/);
  assert.match(job, /run: npx playwright install --with-deps chromium/);
  assert.match(job, /run: npm run check:homepage-guides/);
  assert.doesNotMatch(job, /schedule|workflow_dispatch|POST|deploy --prod/);
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
    /^    if: github\.event_name == 'schedule' \|\| \(github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'\)$/m,
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
  assert.match(filesStep, /^        if: steps\.netlify_cli\.outputs\.upgrade == 'true' \|\| inputs\.verification_only$/m);
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

test("Netlify proposal only stages a verification receipt when it exists", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const job = indentedBlock(workflow, /^  netlify-package-compatibility:$/m, /^  [a-zA-Z0-9_-]+:$/m);
  const step = workflowStep(job, "Select proposal files");
  const script = step.split("        run: |\n")[1]
    .split("\n")
    .map((line) => line.slice(10))
    .join("\n");
  assert.ok(script, "Expected a shell command selecting proposal files");
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
      assert.deepEqual(
        (await readFile(output, "utf8")).trim().split("\n"),
        ["paths<<EOF", ...expected, "EOF"],
      );
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
