import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { findReleaseTreeViolations } from "./check-release-tree.mjs";

const script = fileURLToPath(new URL("./check-release-tree.mjs", import.meta.url));
const markers = ["package.json", ".gitignore", "netlify.toml", "replit.md", ".github/workflows/test.yml"];

test("rejects a complete nested project regardless of its directory name", () => {
  for (const dir of ["feature-copy", "scratch/other-name"]) {
    const issues = findReleaseTreeViolations(markers.map((marker) => `${dir}/${marker}`));
    assert.deepEqual(issues, [`Nested copy of the project: ${dir}/`]);
  }
});

test("accepts actual sub-apps and partial source directories", () => {
  assert.deepEqual(findReleaseTreeViolations([
    "artifacts/mockup-sandbox/package.json",
    "artifacts/mockup-sandbox/src/App.tsx",
    "artifacts/mockup-sandbox/index.html",
    "public/c-drama-fandom/index.html",
    "scratch/package.json",
    "scratch/src/App.tsx",
  ]), []);
});

test("rejects browser crash reports at any depth", () => {
  assert.deepEqual(findReleaseTreeViolations([
    ".config/chromium/Crash Reports/completed/report.meta",
    "copy/.config/chromium/Crashpad/pending/abc",
    "logs/browser.dmp",
  ]), [
    "Browser crash report: .config/chromium/Crash Reports/completed/report.meta",
    "Browser crash report: copy/.config/chromium/Crashpad/pending/abc",
    "Browser crash report: logs/browser.dmp",
  ]);
});

test("required test job runs release guard before dependency installation", () => {
  const workflow = readFileSync(new URL("../workflows/test.yml", import.meta.url), "utf8");
  const requiredCheck = readFileSync(new URL("../workflows/branch-protection-check.yml", import.meta.url), "utf8");
  const job = workflow.split(/^  (?=[a-z][\w-]*:)/m).find((section) => section.startsWith("test:\n"));
  assert.ok(job, "test job must exist");
  assert.match(job, /github\.event_name == 'push' \|\| github\.event_name == 'pull_request'/);
  assert.match(requiredCheck, /select\(\. == "test"\)/);
  const guard = job.indexOf("node .github/scripts/check-release-tree.mjs");
  const install = job.indexOf("run: npm ci");
  assert.ok(guard !== -1 && install !== -1 && guard < install, "release guard must run before install in required test job");
});

test("CLI checks committed HEAD, not untracked files or ignored paths", () => {
  const dir = mkdtempSync(join(tmpdir(), "release-tree-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  const add = (path) => {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), "test");
    git("add", path);
  };
  try {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    add("README.md");
    git("commit", "-qm", "base");
    mkdirSync(join(dir, "untracked", "Crash Reports"), { recursive: true });
    writeFileSync(join(dir, "untracked", "Crash Reports", "report"), "local");
    assert.equal(spawnSync("node", [script], { cwd: dir }).status, 0);

    for (const marker of markers) add(`copy/${marker}`);
    git("commit", "-qm", "bad nested copy");
    const bad = spawnSync("node", [script], { cwd: dir, encoding: "utf8" });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /Nested copy of the project: copy\//);

    git("rm", "-rq", "copy");
    const report = ".config/chromium/Crash Reports/completed/report.meta";
    mkdirSync(join(dir, report, ".."), { recursive: true });
    writeFileSync(join(dir, report), "test");
    git("add", "-f", report);
    git("commit", "-qm", "bad crash report");
    const crash = spawnSync("node", [script], { cwd: dir, encoding: "utf8" });
    assert.equal(crash.status, 1);
    assert.match(crash.stderr, /Browser crash report: .config\/chromium\/Crash Reports\/completed\/report.meta/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});