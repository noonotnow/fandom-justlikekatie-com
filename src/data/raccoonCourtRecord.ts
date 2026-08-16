/**
 * Raccoon Court Record — official rulings of the raccoon judiciary.
 * Edit here to add, amend, or overturn any case. Court is always in session.
 *
 * IMPORTANT: Do not add empty or whitespace-only strings.
 * A TypeScript static assertion below will fail the build (`tsc -b`) if any
 * entry is the exact empty string "". A lint-time script
 * (scripts/check-court-record.js, run by `npm run lint`) catches
 * whitespace-only strings such as "   " that TypeScript cannot distinguish
 * from a valid non-empty literal.
 */
export const RACCOON_COURT_RECORD = [
  "Case #001: Motion to adjourn denied. — Chief Justice 🦝",
  "Case #017: Plaintiff's evidence (a shiny bottle cap) deemed inadmissible. — Clerk 🦝",
  "Case #034: Order in the court. The trash shall not be disturbed till morning. — Bailiff 🦝",
  "Case #052: Appeal upheld. The dumpster remains neutral territory. — Associate Justice 🦝",
  "Case #089: Verdict reserved pending further investigation of the compost bin. — Chief Justice 🦝",
  "Case #103: Eviction notice overturned. Defendant had prior claim to the crawl space by ancestral right. — Associate Justice 🦝",
  "Case #118: Sentence commuted from three nights to one. Good behaviour noted; plaintiff's lid was already loose. — Chief Justice 🦝",
  "Case #141: Evidence log amended. Half a hot dog does not constitute 'substantial property damage.' — Clerk 🦝",
  "Case #156: Motion to declare the recycling bin a protected habitat granted. Court adjourns at dusk. — Bailiff 🦝",
  "Case #172: Disputed paw prints ruled inconclusive. The defendant is notably small-handed. — Associate Justice 🦝",
  "Case #190: Sentencing deferred. The court acknowledges the chicken bones were technically unsecured. — Chief Justice 🦝",
  "Case #204: Counter-claim dismissed. You cannot sue a raccoon for emotional distress when you left the lid off. — Clerk 🦝",
  "Case #217: Trespass acquittal upheld. The fence had a gap. Intent cannot be inferred from a gap. — Associate Justice 🦝",
  "Case #233: The defence of 'it smelled like an invitation' is hereby recognised as a valid plea. — Chief Justice 🦝",
  "Case #251: Unanimous ruling: the bin belongs to no one. The bin belongs to all. Court dismissed. — Full Bench 🦝🦝🦝",
] as const;

// ---------------------------------------------------------------------------
// Compile-time guard — fails `tsc -b` (and therefore `npm run build`) the
// moment an empty string is added to the array above.
//
// How it works: `as const` narrows each element to its exact string literal
// type. If "" is ever introduced, it joins the union
// `(typeof RACCOON_COURT_RECORD)[number]`, making the conditional true and
// collapsing `_AssertNoEmptyRulings` to `never`. Assigning `true` to `never`
// is a type error that TypeScript reports on save in any editor with ts-server.
// ---------------------------------------------------------------------------
type _AssertNoEmptyRulings =
  "" extends (typeof RACCOON_COURT_RECORD)[number] ? never : true;
// If this line shows a type error, a ruling was set to "".
const _assertNoEmptyRulings: _AssertNoEmptyRulings = true;
// Suppress "declared but never read" — this variable exists only for its type.
void _assertNoEmptyRulings;

// ---------------------------------------------------------------------------
// Module-init guard for whitespace-only strings.
// Throws immediately when the module is first imported, so any test that
// imports this file will fail with a clear message. This covers the gap that
// TypeScript's type system cannot catch (e.g. "   " is a non-empty string
// literal, but it still produces a blank popup).
// ---------------------------------------------------------------------------
for (const ruling of RACCOON_COURT_RECORD) {
  if (!ruling.trim()) {
    throw new Error(
      `raccoonCourtRecord.ts: entry ${JSON.stringify(ruling)} is blank or whitespace-only. ` +
      'Every ruling must have visible content.',
    );
  }
}
