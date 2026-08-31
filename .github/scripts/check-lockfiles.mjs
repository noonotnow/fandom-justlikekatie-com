import { spawnSync } from "node:child_process";

const checks = [
  {
    lockfile: "package-lock.json",
    command: "npm",
    args: ["ci", "--dry-run", "--ignore-scripts"],
    repairCommand: "npm install",
  },
  {
    lockfile: "pnpm-lock.yaml",
    command: "pnpm",
    args: ["install", "--frozen-lockfile", "--lockfile-only", "--ignore-scripts"],
    repairCommand: "pnpm install",
  },
];

const failures = [];

for (const check of checks) {
  const result = spawnSync(check.command, check.args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error || result.status !== 0) {
    failures.push({
      ...check,
      output: [result.stdout, result.stderr, result.error?.message]
        .filter(Boolean)
        .join("\n")
        .trim(),
    });
  }
}

if (failures.length > 0) {
  console.error("Lockfile synchronization check failed.");
  for (const failure of failures) {
    console.error(`\n${failure.lockfile} is not synchronized with package.json.`);
    console.error(`Run "${failure.repairCommand}" and commit the updated lockfile.`);
    if (failure.output) {
      console.error(`\n${failure.output}`);
    }
  }
  process.exitCode = 1;
} else {
  console.log("package-lock.json and pnpm-lock.yaml are synchronized with package.json.");
}