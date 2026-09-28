import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { notifyMigrationFailure } from "./notify-migration-failure.js";

const env = {
  RESEND_API_KEY: "private-api-key",
  FANDOM_AUTH_FROM_EMAIL: "Fandom Vibes <alerts@example.test>",
  FANDOM_ADMIN_EMAILS: "one@example.test, two@example.test",
  POSTGRES_CANDIDATE: "18",
  GITHUB_REPOSITORY: "owner/fandom-vibes",
  GITHUB_RUN_ID: "123456",
  GITHUB_RUN_ATTEMPT: "2",
  GITHUB_SERVER_URL: "https://github.example.test",
};

test("candidate failure notification identifies the version and failed run", async () => {
  let request;
  await notifyMigrationFailure(env, async (input, init) => {
    request = { input, init };
    return new Response(null, { status: 200 });
  });
  assert.equal(request.input, "https://api.resend.com/emails");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers.Authorization, "Bearer private-api-key");
  const message = JSON.parse(request.init.body);
  assert.deepEqual(message.to, ["one@example.test", "two@example.test"]);
  assert.match(message.subject, /PostgreSQL 18 candidate migration check failed/);
  assert.match(message.text, /PostgreSQL 18 candidate migration check failed/);
  assert.match(message.text, /Run: 123456 \(attempt 2\)/);
  assert.match(message.text, /https:\/\/github\.example\.test\/owner\/fandom-vibes\/actions\/runs\/123456/);
  assert.doesNotMatch(JSON.stringify(message), /private-api-key/);
});

test("candidate failure notification rejects missing configuration without sending", async () => {
  let called = false;
  await assert.rejects(
    notifyMigrationFailure({ ...env, FANDOM_ADMIN_EMAILS: "" }, async () => {
      called = true;
      return new Response(null, { status: 200 });
    }),
    /FANDOM_ADMIN_EMAILS/,
  );
  assert.equal(called, false);
});

test("candidate failure notification skips invalid recipients and rejects an invalid version", async () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    let message;
    await notifyMigrationFailure(
      { ...env, FANDOM_ADMIN_EMAILS: "one@example.test, invalid@@private.test" },
      async (_input, init) => {
        message = JSON.parse(init.body);
        return new Response(null, { status: 200 });
      },
    );
    assert.deepEqual(message.to, ["one@example.test"]);
    assert.match(warnings.join("\n"), /1 invalid recipient entry/);
    assert.doesNotMatch(warnings.join("\n"), /private\.test/);
    await assert.rejects(
      notifyMigrationFailure({ ...env, POSTGRES_CANDIDATE: "18\nother" }, async () => {
        throw new Error("Unexpected delivery attempt");
      }),
      /PostgreSQL candidate must be a major version/,
    );
  } finally {
    console.warn = originalWarn;
  }
});

test("candidate failure notification rejects provider errors without exposing response details", async () => {
  await assert.rejects(
    notifyMigrationFailure(env, async () => new Response("private response", { status: 422 })),
    error => {
      assert.match(String(error), /HTTP 422/);
      assert.doesNotMatch(String(error), /private response|private-api-key/);
      return true;
    },
  );
});

test("only the scheduled candidate job notifies operators about candidate failures", async () => {
  const workflow = await readFile(new URL("../.github/workflows/test.yml", import.meta.url), "utf8");
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const candidate = workflow.split("  migration-next-major:\n")[1].split("\n  shared-stripe-audit-consistency:")[0];
  const supported = workflow.split("  migration-retry:\n")[1].split("\n  migration-next-major:")[0];
  assert.match(candidate, /if: github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'/);
  assert.ok(candidate.includes(`postgres: ["${packageJson.postgresCompatibility.nextMajor}"]`));
  assert.match(candidate, /name: Apply every migration twice/);
  assert.match(candidate, /name: Notify operators about failed PostgreSQL candidate migration\n        if: failure\(\)/);
  assert.match(candidate, /POSTGRES_CANDIDATE: \$\{\{ matrix\.postgres \}\}/);
  for (const secret of ["RESEND_API_KEY", "FANDOM_AUTH_FROM_EMAIL", "FANDOM_ADMIN_EMAILS"]) {
    assert.match(candidate, new RegExp(`${secret}: \\$\\{\\{ secrets\\.${secret} \\}\\}`));
  }
  assert.match(candidate, /run: node scripts\/notify-migration-failure\.js/);
  assert.ok(supported.includes(`postgres: [${packageJson.postgresCompatibility.supportedMajors.map(value => `"${value}"`).join(", ")}]`));
  assert.doesNotMatch(supported, /notify-migration-failure|RESEND_API_KEY/);
});