import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root='public/c-drama-fandom/vibing-now/';
const landing=readFileSync(root+'index.html','utf8');
const net=readFileSync('netlify.toml','utf8');
for (const ep of [17,18]) test(`episode ${ep}: images, boundary, routes and no editorial notes`,()=>{
 const route=`/c-drama-fandom/vibing-now/where-the-mask-ends-episode-${ep}/`;
 const text=readFileSync(`public${route}index.html`,'utf8');
 assert.match(text,new RegExp(`Spoilers through Episode ${ep}`));
 assert.match(text,new RegExp(`Spoiler boundary:</strong> This installment stops at the end of Episode ${ep}\\.`));
 assert.equal((text.match(/<figure/g)||[]).length,ep===17?4:5);
 assert.equal((text.match(/<figcaption/g)||[]).length,ep===17?4:5);
 assert.doesNotMatch(text,/Editorial notes · not for publication|Source and verification|Katie’s MemeForge creations/);
 assert.ok(landing.includes(route));
 assert.ok(net.indexOf(`from = "${route.slice(0,-1)}"`) < net.indexOf('from = "/*"'));
 assert.ok(net.includes(`to = "${route}index.html"`));
});
