import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const netlifyConfig = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');

test('membership client routes are mapped to the billing functions', () => {
  for (const [path, functionName] of [
    ['/api/membership/status', 'billing-status'],
    ['/api/membership/checkout', 'billing-checkout'],
    ['/api/membership/portal', 'billing-portal'],
  ]) {
    assert.match(netlifyConfig, new RegExp(
      `from = "${path}"[\\s\\S]*?to = "/\\.netlify/functions/${functionName}"`,
    ));
  }
});