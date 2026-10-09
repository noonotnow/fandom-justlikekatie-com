import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from '@playwright/test';
import {
  BROWSER_ENGINES,
  gotoTestPage,
  closeBrowserAndServer,
  launchBrowserWithServer,
  startViteTestServer,
} from './browserEngines.ts';
import { checkNameKeyNavigation } from './untamedNameKeyChecks.ts';

const NAME_KEY_PATH = '/c-drama-fandom/untamed-names-and-performers/';
const BOUNDARY_KEY = 'fandom-watch-journal-safe-through:the-untamed';
const APPROVED_NAMES = [
  'Wei Wuxian (魏无羡)', 'Wei Ying (魏婴)', 'Wuxian (无羡)', 'Xiao Zhan (肖战)',
  'Lan Wangji (蓝忘机)', 'Lan Zhan (蓝湛)', 'Wangji (忘机)', 'Wang Yibo (王一博)',
  'Wen Qing (温情)', 'Meng Ziyi (孟子义)',
];

async function inspectChineseGlyphs(page: Page) {
  return page.locator('tbody strong').evaluateAll(async elements => {
    await document.fonts.ready;
    const missing: string[] = [];
    for (const element of elements) {
      const style = getComputedStyle(element);
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 96;
      const context = canvas.getContext('2d')!;
      context.font = `${style.fontWeight} 48px ${style.fontFamily}`;
      context.fillText('\uFFFF', 8, 64);
      const missingGlyph = canvas.toDataURL();
      const fingerprints = new Set<string>();
      for (const character of element.textContent!.match(/[\u3400-\u9fff]/g) ?? []) {
        context.clearRect(0, 0, 96, 96);
        context.fillText(character, 8, 64);
        const pixels = context.getImageData(0, 0, 96, 96).data;
        const ink = pixels.some((value, index) => index % 4 === 3 && value > 0);
        const fingerprint = canvas.toDataURL();
        if (!ink || fingerprint === missingGlyph || fingerprints.has(fingerprint)) {
          missing.push(character);
        }
        fingerprints.add(fingerprint);
      }
    }
    return missing;
  });
}

for (const engine of BROWSER_ENGINES) {
test(`the approved name key stays readable and journal-independent in ${engine.name}`, { timeout: 60_000 }, async t => {
  const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer(), engine.type);
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await page.route('https://www.googletagmanager.com/**', route => route.abort());
    await gotoTestPage(page, origin);
    const journalRequests: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/.netlify/functions/watch-journal')) journalRequests.push(request.url());
    });
    await page.route('**/.netlify/functions/watch-journal**', route => route.abort());
    await page.evaluate(key => localStorage.setItem(key, '3'), BOUNDARY_KEY);
    await gotoTestPage(page, `${origin}${NAME_KEY_PATH}`);
    assert.equal(await page.locator('h1').innerText(), 'The Untamed: three characters, three performers');
    assert.equal(await page.locator('tbody tr').count(), 3);
    assert.deepEqual(await page.locator('tbody strong').allTextContents(), APPROVED_NAMES);

    // Nix browsers can have no native CJK fonts. Do not mistake textContent
    // for glyph readability, or present a test-only fallback as native evidence.
    if (process.env.REPLIT_PID2) {
      t.diagnostic(`${engine.name}: Nix glyph/layout checks use the licensed test-only CJK font, not native-device font evidence.`);
      await page.addStyleTag({ content: `
        @font-face {
          font-family: UntamedVerificationCJK;
          src: url('/fonts/vibe-atlas-cjk.woff2') format('woff2');
          font-weight: 100 900;
          unicode-range: U+3400-4DBF, U+4E00-9FFF;
        }
        .comparison-table strong {
          font-family: UntamedVerificationCJK, Inter, ui-sans-serif, system-ui, sans-serif;
        }
      ` });
      await page.evaluate(async () => {
        await document.fonts.load('700 48px UntamedVerificationCJK', '魏无羡魏婴肖战蓝忘机蓝湛王一博温情孟子义');
      });
    }
    assert.deepEqual(await inspectChineseGlyphs(page), [], 'Every Chinese name must render distinct visible glyphs, not tofu');

    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 812 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `No page-wide overflow at ${width}px`);
      const region = page.getByRole('region', { name: /Character and performer names/ }).first();
      if (width <= 375) {
        await region.evaluate(node => { node.scrollLeft = 0; });
        assert.ok(await region.evaluate(node => node.scrollWidth > node.clientWidth), 'Lead table scrolls inside its region');
        await region.scrollIntoViewIfNeeded();
        await region.focus();
        assert.ok(await region.evaluate(node => node === document.activeElement), 'Table region receives focus');
        // WebKit's Linux port does not arrow-scroll focused overflow regions.
        // Exercise its native horizontal wheel gesture instead, not a JS scroll.
        if (engine.id === 'webkit') {
          const box = (await region.boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.wheel(160, 0);
        } else {
          await page.keyboard.press('ArrowRight');
        }
        await page.waitForFunction(() => (document.querySelector('.comparison-table')?.scrollLeft ?? 0) > 0);
        const afterRight = await region.evaluate(node => node.scrollLeft);
        if (engine.id === 'webkit') {
          await page.mouse.wheel(-160, 0);
        } else {
          await page.keyboard.press('ArrowLeft');
        }
        await page.waitForFunction(previous => (
          (document.querySelector('.comparison-table')?.scrollLeft ?? Infinity) < previous
        ), afterRight);
        assert.ok(await region.evaluate(node => node === document.activeElement), 'Scrolling keeps focus in the table');
        await page.keyboard.press('Tab');
        assert.equal(await region.evaluate(node => node === document.activeElement), false, 'Table does not trap keyboard focus');
      }
      for (const name of APPROVED_NAMES) {
        const label = page.locator('tbody strong').getByText(name, { exact: true });
        await label.scrollIntoViewIfNeeded();
        assert.ok(await label.isVisible(), `${name} is visible at ${width}px`);
        const geometry = await label.evaluate(node => {
          const region = node.closest('.comparison-table')!.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(node);
          const style = getComputedStyle(node);
          return {
            readableStyle: Number.parseFloat(style.fontSize) >= 14
              && style.visibility === 'visible' && Number.parseFloat(style.opacity) > 0,
            fits: Array.from(range.getClientRects()).every(rect => (
              rect.width > 0 && rect.height > 0
              && rect.left >= Math.max(0, region.left) - 1
              && rect.right <= Math.min(innerWidth, region.right) + 1
            )),
          };
        });
        assert.ok(geometry.readableStyle && geometry.fits, `${name} is fully readable after revealing it at ${width}px`);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `Revealing names does not scroll the whole page at ${width}px`);
    }
    assert.equal(await page.evaluate(key => localStorage.getItem(key), BOUNDARY_KEY), '3');
    assert.equal(await page.getByRole('link', { name: "today's Daily Drop in Vibe Atlas" }).getAttribute('href'), '/vibe-atlas');
    for (const boundary of ['3', '999']) {
      await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: BOUNDARY_KEY, value: boundary });
      await gotoTestPage(page, `${origin}${NAME_KEY_PATH}`);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), BOUNDARY_KEY), boundary, 'Direct reference visit preserves the boundary');
      await page.getByRole('link', { name: 'three-group pre-watch board' }).click();
      await page.waitForURL(`${origin}/c-drama-fandom/untamed-name-board/`);
      await page.locator('.name-board__card').last().waitFor();
      assert.equal(await page.locator('.name-board__card').count(), 3);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), BOUNDARY_KEY), boundary, 'Board visit preserves the boundary');
      await page.getByRole('link', { name: 'Looking for character and actor names? Read the three-character name key →' }).click();
      await page.waitForURL(`${origin}${NAME_KEY_PATH}`);
      await page.locator('tbody tr').last().waitFor();
      assert.equal(await page.locator('tbody tr').count(), 3);
      assert.deepEqual(await page.locator('tbody strong').allTextContents(), APPROVED_NAMES);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), BOUNDARY_KEY), boundary, 'Returning to the reference preserves the boundary');
      assert.deepEqual(journalRequests, [], 'Neither direct visits nor the board round-trip may request journal records');
    }
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});
}

for (const engine of BROWSER_ENGINES) {
  test(`${engine.name}: the approved three-character key reads on mobile without changing Journal boundaries`, { timeout: 60_000 }, async () => {
    const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer(), engine.type);
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
      await checkNameKeyNavigation(page, origin);
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}