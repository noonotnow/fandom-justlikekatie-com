import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = 'public/c-drama-fandom/vibing-now/';
const landing = readFileSync(root + 'index.html', 'utf8');
const net = readFileSync('netlify.toml', 'utf8');
const page = (ep) => readFileSync(root + `where-the-mask-ends-episode-${ep}/index.html`, 'utf8');
const visible = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

for (const ep of [27, 28, 29, 30]) test(`episode ${ep}: routes, sources, names and no editorial notes`, () => {
  const route = `/c-drama-fandom/vibing-now/where-the-mask-ends-episode-${ep}/`;
  const text = page(ep);
  assert.match(text, new RegExp(`wherethemaskends\\.com/episode-${ep}/`));
  assert.match(text, new RegExp(`cpophome\\.com/where-the-mask-ends-tian-xiwei-yan-an/recap/${ep}/`));
  assert.match(text, new RegExp(`where-the-mask-ends-episode-${ep - 1}/">← Episode ${ep - 1}`));
  assert.doesNotMatch(visible(text), /A[ -]?Chou|Hong Xian|Liu Shou\b/);
  assert.doesNotMatch(text, /Editorial notes · not for publication|Source and verification/);
  assert.ok(landing.includes(route));
  assert.ok(net.indexOf(`from = "${route.slice(0, -1)}"`) < net.indexOf('from = "/*"'));
  assert.ok(net.includes(`to = "${route}index.html"`));
});

test('episodes 27–29 keep the standard per-episode boundary', () => {
  for (const ep of [27, 28, 29]) {
    const text = page(ep);
    assert.match(text, new RegExp(`Spoilers through Episode ${ep}`));
    assert.match(text, new RegExp(`This installment stops at the end of Episode ${ep}\\.`));
    assert.doesNotMatch(text, /ending spoilers/i);
  }
});

test('episode 30 declares ending spoilers and keeps the epilogue out of metadata and the shelf', () => {
  const text = page(30);
  assert.match(text, /<strong>Spoiler boundary:<\/strong> This installment covers Episode 30, the finale, and includes ending spoilers\./);
  const head = text.slice(0, text.indexOf('<body'));
  for (const sensitive of [/Liu Shuo/, /three years/i, /Prince Fu/, /dies|death/i]) assert.doesNotMatch(head, sensitive);
  const h1 = text.match(/<h1>([^<]*)<\/h1>/)[1];
  const dek = text.match(/<p class="dek">([^<]*)<\/p>/)[1];
  assert.doesNotMatch(h1 + dek, /Liu Shuo|three years|Prince Fu/i);
  const shelf = landing.match(/<p><a href="\/c-drama-fandom\/vibing-now\/where-the-mask-ends-episode-30\/">[^<]*<\/a>[^]*?<\/p>/)[0];
  assert.match(shelf, /Episode 30 — ending spoilers/);
  assert.doesNotMatch(shelf, /Where the Mask Ends|Liu Shuo|Prince Fu/);
});

test('episode 29 does not wink at what episode 30 reveals', () => {
  const body = visible(page(29));
  assert.doesNotMatch(body, /appears to|seems to (?:die|fall)|staged|faked|alive/i);
  assert.match(body, /where-the-mask-ends-episode-30\/">Episode 30 →/);
});

test('forward links: 26 → 27, and 30 has none', () => {
  assert.match(page(26), /where-the-mask-ends-episode-27\/">Episode 27 →/);
  assert.doesNotMatch(page(30), /Episode 31 →/);
});
