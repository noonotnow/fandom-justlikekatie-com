import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = 'public/c-drama-fandom/vibing-now/';
const landing = readFileSync(root + 'index.html', 'utf8');
const net = readFileSync('netlify.toml', 'utf8');
const visible = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

for (const ep of [23, 24, 25, 26]) test(`episode ${ep}: boundary, routes, sources and no editorial notes`, () => {
  const route = `/c-drama-fandom/vibing-now/where-the-mask-ends-episode-${ep}/`;
  const text = readFileSync(`public${route}index.html`, 'utf8');
  assert.match(text, new RegExp(`Spoilers through Episode ${ep}`));
  assert.match(text, new RegExp(`Spoiler boundary:</strong> This installment stops at the end of Episode ${ep}\\.`));
  assert.match(text, new RegExp(`wherethemaskends\\.com/episode-${ep}/`));
  assert.match(text, new RegExp(`cpophome\\.com/where-the-mask-ends-tian-xiwei-yan-an/recap/${ep}/`));
  assert.match(text, new RegExp(`where-the-mask-ends-episode-${ep - 1}/">← Episode ${ep - 1}`));
  // The heroine is Wei Rao from Episode 17 on; no source-name drift.
  assert.doesNotMatch(visible(text), /A[ -]?Chou|Hong Xian/);
  assert.doesNotMatch(text, /Editorial notes · not for publication|Source and verification/);
  assert.ok(landing.includes(route));
  assert.ok(net.indexOf(`from = "${route.slice(0, -1)}"`) < net.indexOf('from = "/*"'));
  assert.ok(net.includes(`to = "${route}index.html"`));
});

test('episode 23 carries the approved content note above the article', () => {
  const text = readFileSync(root + 'where-the-mask-ends-episode-23/index.html', 'utf8');
  const note = text.indexOf('<strong>Content note:</strong> This recap describes sexual violence. Please read with care.');
  assert.ok(note > 0 && note < text.indexOf('<article'));
  for (const ep of [24, 25, 26]) {
    assert.doesNotMatch(readFileSync(root + `where-the-mask-ends-episode-${ep}/index.html`, 'utf8'), /Content note:/);
  }
});

test('episode 22 links forward to 23; 26 has no forward link yet', () => {
  assert.match(readFileSync(root + 'where-the-mask-ends-episode-22/index.html', 'utf8'), /where-the-mask-ends-episode-23\/">Episode 23 →/);
  assert.doesNotMatch(readFileSync(root + 'where-the-mask-ends-episode-26/index.html', 'utf8'), /Episode 27 →/);
});
