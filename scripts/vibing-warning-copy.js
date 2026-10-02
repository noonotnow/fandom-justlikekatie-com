import assert from "node:assert/strict";
import { vibingNowArticleRoutes } from "../shared/public-routes.js";

// This is a copy contract, not a chronology check. Do not scan article analysis
// for plot keywords or treat a passing warning as editorial/source sign-off.
const reviewedWarnings = new Map([
  ["/c-drama-fandom/vibing-now/against-the-current-episode-21/", [
    "Spoiler boundary: Episode 21 · No preview, later-episode, novel, or endgame material included",
  ]],
]);

function approvedWarnings(route) {
  const episodes = route.path.match(/-episode(s?)-(\d+)(?:-(\d+))?\/$/);
  assert.ok(episodes, `${route.path}: warning boundary needs an episode route or a reviewed copy contract`);
  const [, plural, first, last] = episodes;
  const start = Number(first);
  const end = Number(last ?? first);
  assert.ok(start > 0 && Number.isSafeInteger(end) && end >= start
    && Boolean(plural) === Boolean(last),
  `${route.path}: invalid episode range for warning copy`);
  if (reviewedWarnings.has(route.path)) return reviewedWarnings.get(route.path);

  const warnings = [
    `Spoiler boundary: This installment stops at the end of Episode ${end}. No previews, later episodes, novel material, or endgame information.`,
  ];
  if (last) warnings.push(
    `Spoiler boundary: This installment discusses Episodes ${start}–${end} and includes spoilers through the end of Episode ${end}. No later episodes, previews, novel material, or endgame information.`,
  );
  return warnings;
}

export function assertVibingWarningCopy(html, route) {
  const expected = approvedWarnings(route);
  // Compare entire labeled paragraphs so a nested emphasis tag cannot conceal
  // extra event-specific wording. Comments and scripts are not visible notices.
  const visibleHtml = html.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const warnings = [...visibleHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi)]
    .map(([, paragraph]) => paragraph.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim())
    .filter((paragraph) => /spoiler\s+boundary\s*:/i.test(paragraph));
  assert.deepEqual(warnings, expected,
    `${route.path}: retain all approved event-free warning paragraphs and the correct episode endpoints; changed copy requires editorial approval`);
}

export function assertRegisteredVibingWarningCopy(readPage, routes) {
  for (const route of vibingNowArticleRoutes(routes)) {
    assert.ok(route.page, `${route.path}: a registered Vibing Now article must have a warning-checkable page`);
    assertVibingWarningCopy(readPage(route.page), route);
  }
}