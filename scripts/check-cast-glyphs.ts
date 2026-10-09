// Diagnostic only: never modifies public HTML/CSS or publishes anything.
// Usage: node --import tsx/esm scripts/check-cast-glyphs.ts baseline|native|proposal
// Native mode requires CJK_NATIVE_FONT_DIR containing an actual system TTF/OTF.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { BROWSER_ENGINES, launchBrowser } from '../tests/browser/browserEngines';

const mode = process.argv[2] ?? 'baseline';
assert(['baseline', 'native', 'proposal'].includes(mode), 'Unknown mode');
const output = process.env.CAST_GLYPH_OUTPUT ?? '/tmp/cast-font-audit';
await mkdir(output, { recursive: true });
if (mode === 'native') {
  const fontDir = process.env.CJK_NATIVE_FONT_DIR;
  assert(fontDir && !/[<>&"]/.test(fontDir), 'Set CJK_NATIVE_FONT_DIR to a system-font directory');
  const config = join(output, 'native-fonts.conf');
  await writeFile(config, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig><include>/etc/fonts/fonts.conf</include><dir>${resolve(fontDir)}</dir>
<cachedir>${output}/font-cache</cachedir></fontconfig>`);
  process.env.FONTCONFIG_FILE = config;
}
const nativeFonts = execFileSync('fc-list', [':lang=zh', 'family', 'file'], { encoding: 'utf8' }).trim();
assert(mode === 'native' ? nativeFonts.length > 0 : nativeFonts.length === 0,
  'This diagnostic requires a verified no-CJK baseline and a verified CJK native mode');
const baseline = mode === 'baseline' ? null
  : JSON.parse(await readFile(join(output, 'baseline.json'), 'utf8'));

const publicDir = resolve('public');
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://fixture');
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(publicDir, `.${path}`);
    if (!file.startsWith(`${publicDir}/`)) throw new Error('Outside public');
    const content = await readFile(file);
    const type = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2' }[extname(file)];
    res.writeHead(200, { 'Content-Type': type ?? 'application/octet-stream' }).end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const address = server.address();
assert(address && typeof address !== 'string');
const url = `http://127.0.0.1:${address.port}/c-dramas/love-between-fairy-and-devil/cast/`;
const results: unknown[] = [];
try {
  for (const engine of BROWSER_ENGINES) {
    const browser = await launchBrowser(engine.type);
    try {
      for (const device of [
        { name: 'desktop', width: 1440, height: 1000 },
        { name: 'phone', width: 390, height: 844 },
      ]) {
        const context = await browser.newContext({ viewport: device, reducedMotion: 'reduce' });
        try {
          // Do not emit staff pageviews or load provider content in this local diagnostic.
          await context.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin
            ? route.continue() : route.abort());
          const page = await context.newPage();
          await page.goto(url);
          const originalText = await page.locator('main').innerText();
          if (mode === 'proposal') {
            await page.addStyleTag({ content: `
@font-face { font-family: "Guide CJK"; src: url("/fonts/vibe-atlas-cjk.woff2") format("woff2");
font-weight: 100 900; font-style: normal; font-display: swap;
unicode-range: U+3000-303F, U+3400-4DBF, U+4E00-9FFF, U+FF00-FFEF; }
body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Guide CJK", sans-serif; }
.eyebrow { font-family: ui-monospace, SFMono-Regular, Menlo, "Guide CJK", monospace; }
` });
            await page.evaluate(() => document.fonts.load('17px "Guide CJK"', '小兰花虞书欣东方青苍王鹤棣'));
          }
          await page.evaluate(() => document.fonts.ready);
          await page.locator('#seven-roles').scrollIntoViewIfNeeded();
          await page.waitForTimeout(600);
          assert.equal(await page.locator('main').innerText(), originalText, 'Copy must remain unchanged');
          // A string keeps tsx's __name helper out of the browser realm.
          const glyphs = await page.evaluate(`(() => {
            const elements = [...document.querySelectorAll('.cast-key td:nth-child(1), .cast-key td:nth-child(2), .eyebrow, #quick-answer p, #name-notes p')];
            return elements.map(el => {
              const style = getComputedStyle(el);
              const chars = [...new Set((el.textContent ?? '').match(/[\\u3400-\\u9fff]/gu) ?? [])];
              const canvas = document.createElement('canvas');
              canvas.width = 80; canvas.height = 80;
              const ctx = canvas.getContext('2d');
              ctx.font = style.fontWeight + ' 32px ' + style.fontFamily;
              const raster = (char) => {
                ctx.clearRect(0, 0, 80, 80);
                ctx.fillText(char, 4, 50);
                return [...ctx.getImageData(0, 0, 80, 80).data].join(',');
              };
              const missing = raster('\u0378'); // Unicode-unassigned, known missing glyph control.
              const fingerprints = chars.map(c => {
                let hash = 2166136261;
                for (const byte of raster(c)) hash = Math.imul(hash ^ byte.charCodeAt(0), 16777619) >>> 0;
                return hash;
              });
              return { text: chars.join(''), font: style.fontFamily, tofu: chars.filter(c => raster(c) === missing), fingerprints };
            }).filter(row => row.text);
          })()`) as { text: string; font: string; tofu: string[]; fingerprints: number[] }[];
          const tested = glyphs.reduce((n, row) => n + row.text.length, 0);
          const tofu = glyphs.reduce((n, row) => n + row.tofu.length, 0);
          assert(tested > 30, 'Must exercise Chinese names, not just Latin text');
          // Firefox draws code-point-specific hexboxes, not a common tofu shape.
          // Its baseline requires visual inspection; zero raster matches is NOT a pass.
          assert(mode === 'baseline' ? (engine.id !== 'chromium' || tofu > 0) : tofu === 0,
            `${engine.id}/${device.name}: unexpected missing glyph result ${tofu}/${tested}`);
          if (baseline) {
            const previous = baseline.results.find((r: { engine: string; device: string }) =>
              r.engine === engine.id && r.device === device.name);
            assert(previous, 'Run baseline first for each engine/device');
            glyphs.forEach((row, i) => {
              assert.equal(row.text, previous.glyphs[i].text);
              row.fingerprints.forEach((hash, j) => assert.notEqual(hash, previous.glyphs[i].fingerprints[j],
                `${engine.id}/${device.name}: Chinese glyph still matches its fontless baseline`));
            });
          }
          let platformFonts: unknown;
          if (engine.id === 'chromium') {
            const cdp = await context.newCDPSession(page);
            await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
            const { root } = await cdp.send('DOM.getDocument');
            const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.cast-key td' });
            platformFonts = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts;
          }
          await page.locator('.cast-key').screenshot({ path: join(output, `${mode}-${engine.id}-${device.name}.png`) });
          const result = { mode, engine: engine.id, device: device.name, tested, tofu, glyphs, platformFonts };
          results.push(result);
          console.log(`${mode} ${engine.id} ${device.name}: ${tofu}/${tested} Chinese glyph instances match missing-glyph control`);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
  await writeFile(join(output, `${mode}.json`), JSON.stringify({ mode, nativeFonts, results }, null, 2));
} finally {
  await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
}
