import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const article = readFileSync('public/c-drama-fandom/vibing-now/where-the-mask-ends-episodes-1-16/index.html', 'utf8');
const guide = readFileSync('public/c-drama-fandom/where-to-watch/where-the-mask-ends/index.html', 'utf8');
const landing = readFileSync('public/c-drama-fandom/vibing-now/index.html', 'utf8');
const routes = readFileSync('netlify.toml', 'utf8');
test('approved reading keeps episode boundary, all six images, and music placement', () => {
 assert.match(article,/Spoilers through Episode 16/); assert.equal((article.match(/<img /g)||[]).length,6);
 assert.ok(article.indexOf('The slow clap. The admission.') < article.indexOf('the fire starter when they discover'));
 assert.ok(article.indexOf('The opening starts, Liu Yuning') < article.indexOf('Liu Yuning on the cover'));
 assert.doesNotMatch(article,/Layout preview only|Nothing has been published/);
});
test('guide includes 14 country listings and soundtrack', () => {
 assert.equal((guide.match(/https:\/\/www\.justwatch\.com\//g)||[]).length,14); assert.match(guide,/Release schedule/);
 assert.match(guide,/original soundtrack artwork/); assert.doesNotMatch(guide,/human in the relevant country|Thailand|Vietnam/);
});
test('feature and guide link together and routes resolve before SPA fallback', () => {
 const a='/c-drama-fandom/vibing-now/where-the-mask-ends-episodes-1-16/'; const g='/c-drama-fandom/where-to-watch/where-the-mask-ends/';
 assert.ok(landing.includes(a) && landing.includes(g) && article.includes(g) && guide.includes(a));
 assert.ok(routes.indexOf('from = "'+a.slice(0,-1)+'"') < routes.indexOf('from = "/*"'));
 assert.ok(routes.indexOf('from = "'+g.slice(0,-1)+'"') < routes.indexOf('from = "/*"'));
});
