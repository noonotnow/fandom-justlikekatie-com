import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('the second-agent packet contains every current English and Chinese decoder diagnosis', async () => {
  const [english, chinese, handoff] = await Promise.all([
    readFile(new URL('../public/c-drama-fandom/trope-decoder/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/zh-cn/c-drama-fandom/trope-decoder/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../docs/simplified-chinese-review.html', import.meta.url), 'utf8'),
  ]);
  for (const source of [english, chinese]) {
    const diagnoses = [...source.matchAll(
      /<p class="trope-card__veteran"><strong>[^<]+<\/strong>\s*([^<]+)<\/p>/g,
    )];
    assert.equal(diagnoses.length, 14);
    for (const diagnosis of diagnoses) {
      assert.ok(handoff.includes(diagnosis[1].trim()), 'handoff must reflect the current card, not stale copy');
    }
    const ids = [...source.matchAll(/<article class="trope-card" id="([^"]+)"/g)];
    assert.equal(ids.length, 14);
    for (const id of ids) assert.ok(handoff.includes(`<strong>${id[1]}</strong>`));
  }
  assert.ok(handoff.includes('Distinguish objective errors from optional style changes'));
  assert.ok(handoff.includes('do not call it native-speaker approval'));
});