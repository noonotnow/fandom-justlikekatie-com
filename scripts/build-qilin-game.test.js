import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

// Exercise the real release script without downloading tools or exporting WASM.
// The actual Godot suite is run by the build, not replaced by these gate tests.
const script = readFileSync(new URL('./build-qilin-game.sh', import.meta.url), 'utf8');

function run(mode) {
  const root = mkdtempSync(join(tmpdir(), 'qilin-release-'));
  try {
    for (const dir of ['scripts', 'bin', 'games/qilin-keeper/godot/assets',
      'home/.local/share/godot/export_templates/4.4.1.stable']) {
      mkdirSync(join(root, dir), { recursive: true });
    }
    writeFileSync(join(root, 'scripts/build-qilin-game.sh'), script);
    writeFileSync(join(root, 'scripts/package-qilin-source.py'), '# No source archive needed for gate tests.\n');
    writeFileSync(join(root, 'games/qilin-keeper/godot/assets/cover.jpg'), 'cover');
    writeFileSync(join(root, 'home/.local/share/godot/export_templates/4.4.1.stable/web_nothreads_release.zip'), '');
    writeFileSync(join(root, 'bin/timeout'), `#!/usr/bin/env bash
[[ "$1" == "--kill-after=5s" && "$2" == "90s" ]] || exit 99
shift 2
[[ "$MODE" == timeout ]] && exit 124
exec "$@"
`, { mode: 0o755 });
    writeFileSync(join(root, 'bin/godot'), `#!/usr/bin/env bash
echo "$*" >> "$CALLS"
if [[ "$*" == *"--editor --import"* ]]; then
  [[ "$MODE" == import-error ]] && echo "SCRIPT ERROR: import failed"
elif [[ "$*" == *"--script res://tests/cassette_checks.gd"* ]]; then
  case "$MODE" in
    engine-exit) exit 7 ;;
    script-error) echo "SCRIPT ERROR: invalid call" >&2 ;;
    assertion) echo "SCRIPT ERROR: Assertion failed." >&2 ;;
    failed-check) echo "FAIL: sticker crossed sign-out context" >&2 ;;
    missing-pass) exit 0 ;;
  esac
  echo "Qilin cassette checks: PASS"
elif [[ "$*" == *"--export-release"* ]]; then
  [[ "$MODE" == export-error ]] && echo "Parse Error: export failed"
fi
exit 0
`, { mode: 0o755 });
    const result = spawnSync('bash', ['scripts/build-qilin-game.sh'], {
      cwd: root,
      env: { ...process.env, HOME: join(root, 'home'), PATH: `${root}/bin:${process.env.PATH}`,
        MODE: mode, CALLS: join(root, 'calls') },
      encoding: 'utf8', timeout: 10000,
    });
    assert.ifError(result.error);
    return { ...result, calls: readFileSync(join(root, 'calls'), 'utf8') };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('release runs exactly one bounded cassette suite between import and export', () => {
  const result = run('pass');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const calls = result.calls.trim().split('\n');
  assert.equal(calls.length, 3);
  assert.match(calls[0], /--editor --import --quit/);
  assert.match(calls[1], /--headless .*--script res:\/\/tests\/cassette_checks.gd$/);
  assert.doesNotMatch(calls[1], /--quit/);
  assert.match(calls[2], /--export-release Web/);
});

for (const mode of ['engine-exit', 'script-error', 'assertion', 'failed-check', 'missing-pass', 'timeout', 'import-error']) {
  test(`${mode} blocks export, including errors with a zero engine exit`, () => {
    const result = run(mode);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.calls, /--export-release/);
    if (mode === 'timeout') assert.equal(result.status, 124);
  });
}

test('existing export error check is preserved', () => {
  assert.notEqual(run('export-error').status, 0);
});
