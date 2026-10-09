import { spawnSync } from "node:child_process";

// Check paths in the proposed commit, not the checkout: ignored local files
// must not fail CI, while tracked files cannot be hidden by .gitignore.
export function findReleaseTreeViolations(paths) {
  const files = new Set(paths);
  const violations = [];
  const directories = new Set();

  for (const path of files) {
    if (/(^|\/)(Crash Reports|Crashpad)(\/|$)/i.test(path) || /\.dmp$/i.test(path)) {
      violations.push(`Browser crash report: ${path}`);
    }
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      directories.add(parts.slice(0, i).join("/"));
    }
  }

  for (const dir of directories) {
    // A complete copy of this site's source has these project-specific root
    // markers. Unlike package.json + src, these do not match real sub-apps.
    const markers = ["package.json", ".gitignore", "netlify.toml", "replit.md", ".github/workflows/test.yml"];
    if (markers.every((marker) => files.has(`${dir}/${marker}`))) {
      violations.push(`Nested copy of the project: ${dir}/`);
    }
  }
  return violations.sort();
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const tree = spawnSync("git", ["ls-tree", "-r", "--name-only", "-z", "HEAD"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (tree.error || tree.status !== 0) {
    console.error("Could not read the proposed release tree:", tree.stderr || tree.error);
    process.exitCode = 1;
  } else {
    const paths = tree.stdout.split("\0").filter(Boolean);
    const violations = findReleaseTreeViolations(paths);
    if (violations.length) {
      console.error("Release tree contains local workspace or browser crash state:");
      for (const violation of violations) console.error(`- ${violation}`);
      console.error("Remove these paths from the proposed commit (keep local files and backup refs intact).");
      process.exitCode = 1;
    } else {
      console.log(`Release tree clean (${paths.length} committed paths checked).`);
    }
  }
}