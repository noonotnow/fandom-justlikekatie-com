import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { notifySitemapInventoryFailure } from "./notify-sitemap-inventory-failure.js";

const env = {
  RESEND_API_KEY: "private-api-key",
  FANDOM_AUTH_FROM_EMAIL: "Fandom Vibes <alerts@example.test>",
  FANDOM_ADMIN_EMAILS: "one@example.test",
  PUBLIC_SITEMAP_INVENTORY_STATUS: "publication-history-mismatch",
  GITHUB_REPOSITORY: "owner/fandom-vibes",
  GITHUB_RUN_ID: "123456",
  GITHUB_SERVER_URL: "https://github.example.test",
};

test("alerts contain a bounded public status and workflow link, no inventory or credentials", async () => {
  for (const status of ["release-history-unavailable", "publication-history-mismatch"]) {
    let request;
    await notifySitemapInventoryFailure({ ...env, PUBLIC_SITEMAP_INVENTORY_STATUS: status }, async (url, init) => {
      request = { url, init };
      return new Response(null, { status: 200 });
    });
    assert.equal(request.url, "https://api.resend.com/emails");
    const message = JSON.parse(request.init.body);
    assert.deepEqual(message.to, ["one@example.test"]);
    assert.match(message.subject, new RegExp(status));
    assert.match(message.text, /reconcile them/);
    assert.match(message.text, /actions\/runs\/123456/);
    assert.doesNotMatch(JSON.stringify(message), /private-api-key|archive=1|publicRecord|Collector/);
  }
});

test("refuses unknown status, healthy status, missing recipients, and rejected delivery", async () => {
  for (const status of ["complete", "injected\nvalue", "", undefined]) {
    await assert.rejects(
      notifySitemapInventoryFailure({ ...env, PUBLIC_SITEMAP_INVENTORY_STATUS: status }, async () => {
        throw new Error("must not send");
      }),
      /known failing public sitemap inventory status/,
    );
  }
  await assert.rejects(
    notifySitemapInventoryFailure({ ...env, FANDOM_ADMIN_EMAILS: "" }),
    /FANDOM_ADMIN_EMAILS/,
  );
  await assert.rejects(
    notifySitemapInventoryFailure(env, async () => new Response("private response", { status: 422 })),
    error => {
      assert.match(String(error), /HTTP 422/);
      assert.doesNotMatch(String(error), /private response/);
      return true;
    },
  );
});

test("main-branch weekly and manual runs retry the public inventory check before notifying", async () => {
  const workflow = await readFile(new URL("../.github/workflows/test.yml", import.meta.url), "utf8");
  const job = workflow.split("  weekly-public-sitemap-inventory:\n")[1].split("\n  production-archive-records:")[0];
  assert.match(job, /github\.event_name == 'schedule'/);
  assert.match(job, /github\.ref == 'refs\/heads\/main'/);
  assert.match(job, /for attempt in 1 2 3; do[\s\S]*check:public-records -- --inventory-only[\s\S]*sleep 20[\s\S]*exit 1/);
  assert.match(job, /if: failure\(\) && steps\.inventory\.outcome == 'failure'/);
  assert.match(job, /PUBLIC_SITEMAP_INVENTORY_STATUS: \$\{\{ steps\.inventory\.outputs\.status \}\}/);
  assert.match(job, /run: node scripts\/notify-sitemap-inventory-failure\.js/);
  assert.doesNotMatch(job.split("      - name: Notify operators")[0], /RESEND_API_KEY/);
});