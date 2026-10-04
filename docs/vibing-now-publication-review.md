# Vibing Now publication review: episode boundaries

Use this checklist **before publishing or substantively revising** a Vibing Now installment. The episode label, the article's own spoiler disclaimer, a deploy preview, and `scripts/public-pages.test.js` are not evidence of plot chronology. This is a human editorial gate, not a keyword scan.

## Start a review record for each article revision

Copy the blank record below into an editorial review note alongside the draft (not into the public article). Keep the completed record with the publication decision. Do not copy private watch notes or later-episode plot details into the public page, public PR description, or reader-facing metadata. Link to the creator's watched/source notes using an internal reference accessible to the reviewer; if those notes are unavailable, the review remains **blocked**. A prior sign-off does not cover changed prose or a new episode boundary.

```
Article route:
Draft revision / commit:
Declared safe-through episode:
Watch-note set and version/location:
Reviewer:
Review date:
Status: BLOCKED (until every claim is checked and editorial sign-off is recorded)

| Location (section + paragraph / headline / teaser) | Consequential claim or plot-dependent interpretation | First episode that supports it | Watched/source note locator (episode + scene/time or note heading) | Decision (keep / revise / move / remove) | Reviewer initials |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

Unresolved claims or source discrepancies:
Changes made after review (reopen affected rows):
Editorial sign-off (name, date, reviewed revision, explicit APPROVED / BLOCKED):
```

## Release gate

1. Record the article route, exact draft revision, and declared last episode before reviewing. Include the headline, lede, metadata and shelf teaser as well as the body and any discussion prompt. A "spoilers through Episode N" label is not a substitute for checking these surfaces.
2. Read the **entire draft sentence by sentence** alongside episode-specific watched/source notes. Add a row for each factual event, outcome, revelation, relationship change, chronology-dependent comparison, or interpretation whose premise depends on a plot event. Split sentences that combine events from different episodes into separate rows. Purely connective prose may share a row with its factual premise; do not skip a section just because its heading says the correct range.
3. For each row, record the earliest episode that actually supplies the claim and a *locatable* watch-note reference, not simply the article's advertised range or another published recap. Check that the notes support the exact level of certainty in the prose. Flag uncertain chronology, missing notes, previews, novel knowledge, and any later-episode context as **unresolved**. Do not guess an episode to make the row pass.
4. Compare every row's first supporting episode against the declared safe-through episode. If it is later, **block publication** and remove, rewrite without the future knowledge, or move the claim to an installment with a suitable boundary. Recheck neighboring interpretations, teaser text, and links after removal; later-episode links must be clearly labeled and must not reveal the later event in an earlier installment.
5. The reviewer and editor resolve every flagged row against the source notes, check that every plot-dependent passage has coverage, and record an explicit editorial **APPROVED** sign-off with date and reviewed revision. Any remaining blank locator, uncertain episode, unresolved row, or changed prose after sign-off means **BLOCKED** until reviewed again. Only then run the route/HTML tests and publish. Tests can catch broken pages and known strings, not chronology.

## Bounded warning-copy check (not source review)

Before the registry-driven checks, `scripts/public-pages.test.js` also compares
every descendant `index.html` file under `public/c-drama-fandom/vibing-now/`
with the exact file and expected route in `shared/public-routes.js`. An omitted
article fails with its file path and expected route, so a new installment cannot
bypass the warning, canonical, sitemap, and routing checks by missing the registry.
The shelf's own `index.html` is excluded. Draft directory names and `noindex`
metadata are not exemptions.

`scripts/generate-public-pages.js` also runs this inventory during `prepare:public`
and therefore `prebuild`, after journal generation and before sitemap output.
Skipping tests cannot bypass article registration. This does not replace the
separate warning-copy contract or editorial/source-review approval.

There are currently **no non-public fixture exemptions** in this public tree.
Keep synthetic tests in temporary directories outside `public/`. If a non-public
fixture must be kept in this tree, list its exact file path and reason in
`scripts/vibing-public-inventory.js` and document the same path and reason here;
never exempt a whole directory. An inventory exemption is not access control or
permission to publish an unreviewed draft.

`scripts/public-pages.test.js` runs the warning-copy contract in
`scripts/vibing-warning-copy.js` for **every registered route beneath
`/c-drama-fandom/vibing-now/`**, excluding the shelf itself. New registered
installments are included automatically; missing pages, missing warnings, extra
labeled warning paragraphs, and unreviewed formats fail closed.

The check compares the entire text of each `Spoiler boundary:` paragraph, in
order, against event-free copy. It permits formatting tags and whitespace changes,
not additional prose. It does **not** scan article analysis for event keywords or
verify that any event occurs before the declared boundary.

- Preserve Episode 21's reviewed short format:
  `Spoiler boundary: Episode 21 · No preview, later-episode, novel, or endgame material included`.
  This is a route-specific reviewed exception, not permission to rewrite its copy.
- For episode routes ending in `-episode-N/`, the approved opening template is:
  `Spoiler boundary: This installment stops at the end of Episode N. No previews, later episodes, novel material, or endgame information.`
- For routes ending in `-episodes-A-B/`, use that opening template with `N = B`,
  followed by the approved closing template:
  `Spoiler boundary: This installment discusses Episodes A–B and includes spoilers through the end of Episode B. No later episodes, previews, novel material, or endgame information.`
  These retain the existing Episodes 22–25 and 26–30 formats.
- Never name excluded events or use scene cutoffs in a warning, even to say the
  event is absent. If a different route convention or warning format is needed,
  obtain editorial copy approval before adding a reviewed contract. Do not loosen
  the check to a keyword denylist or automatically bless the current HTML.

Run `node --test scripts/public-pages.test.js` after checking copy. Passing this
check covers only these labeled article-warning paragraphs. The release gate
above still covers all consequential claims, metadata, shelf teasers, discussion
prompts, and source chronology; passing tests cannot replace its signed review.

### Known boundary failure to use when training reviewers

An earlier Episodes 22–25 draft discussed Zheng-family punishment/consequences. The creator's notes locate that material in Episode 26, so it was removed from the Episode 25 reading with the creator's approval and addressed in the Episodes 26–30 installment. In a review record the row would have **first supporting episode: 26**, **declared boundary: 25**, **decision: remove or move**, and **status: BLOCKED** until the revision is checked. This is an example of a known incident, **not** a newly verified citation to the creator's private notes or a retrospective sign-off on the current HTML.

For the existing public installments at `public/c-drama-fandom/vibing-now/against-the-current-episodes-22-25/index.html` and `public/c-drama-fandom/vibing-now/against-the-current-episodes-26-30/index.html`, the published "Source-reviewed" dates are historical page copy. This checklist does not assert that a row-by-row register exists for those revisions. A future substantive edit to either page needs a new record and sign-off.

## Retrospective source availability — October 4, 2026

**Full retrospective audit: BLOCKED. No new editorial sign-off.**

The creator confirmed that the Episode 21 installment was a starting point,
watching is unfinished, and the missing episode notes were never recorded.
Any notes recorded now would be from a second watch or later. This is an
evidence limitation, not a connection problem or a request to reconstruct
original viewing notes.

The authorized Notion inspection found the following source coverage:

| Notion article record | Available Watch Notes | Limitation |
| --- | --- | --- |
| Episodes 1–6 draft | Entries for Episodes 1–6 | Does not establish later chronology |
| Episodes 7–14 draft | Entries for Episodes 7–9 | Episodes 10–14 have blank headings |
| Episodes 15–20 draft | Blank episode headings only | No recorded viewing evidence for Episodes 15–20 |
| Through Episode 21 master | Empty Watch Notes field | Article prose is not an independent source for its own claims |
| Episodes 22–25 draft | Entries for Episodes 22–25 | Availability does not constitute complete claim coverage or approval |
| Episodes 26–30 working record | Entries for Episodes 26–30 | Availability does not constitute complete claim coverage or approval |

Private note text remains in Notion; this inventory does not reproduce it.
Headline, metadata, and main content of all three live installments matched
the repository when checked on October 4, 2026. That copy comparison establishes
which prose needs review, not whether its claims are correct.

The creator subsequently approved a **review of available notes only**, leaving
uncovered claims unresolved. That bounded review is recorded below; it is not
complete factual certification, discrepancy resolution, or new approval.
Public copy and historical review labels were left unchanged. In particular,
the missing Episodes 10–21 evidence also affects later articles when they
depend on earlier events.

A narrower review of the available notes requires an explicit scope decision
and must leave uncovered claims unresolved. The creator gave that scope
approval, not approval to revise or publish copy. If later verification uses a
rewatch or an approved alternative source, record its actual provenance,
episode locator, review date, exact article revision, and editorial approval.
Do not describe later evidence as contemporaneous first-watch notes, overwrite
original observations, or treat it as proof that the historical publication
already passed this gate.

### Bounded available-notes review record

- **Date:** October 4, 2026.
- **Reviewer:** Replit Agent (RA).
- **Reviewed repository revision:** `2ed079d9d3d157c564096df9421511df29ad2063`.
- **Private record:** Notion child of the existing Episode 21 master, titled
  *Against the Current — Available-notes review · 2026-10-04*. Source links,
  property versions, note hashes, segment locators, quoted surface snapshots,
  row-level findings, and proposed editorial decisions belong there, not in
  this repository or public HTML.
- **Coverage:** all three article headlines, ledes, title/description metadata,
  structured-data headlines/descriptions, body headings and passages, discussion
  questions, administrative/boundary surfaces, and the shelf's metadata,
  structured data, teaser, and visible passages.
- **Method:** assess the exact certainty of each plot-dependent assertion;
  split mixed-event passages into separate assessments where necessary;
  distinguish supported facts, premise-supported interpretations, partial
  support, unresolved claims, and non-plot copy.
- **Chronology limitation:** a supporting *available* episode is not proof of
  the first onscreen occurrence. Missing or ambiguous first-occurrence evidence
  remains unresolved; later notes do not substantiate an earlier boundary.
- **Disposition:** bounded available-notes review completed; full factual and
  spoiler-boundary certification **BLOCKED**.
- **Editorial sign-off:** **NOT GRANTED**. Scope approval is not copy approval.
  Proposed revisions remain pending; no public edits or release were made.

The register has **346 inventoried surface occurrences and 439 assessment
rows**. These are not counts of unique factual claims: they include repeated
metadata, interpretive passages, and non-plot administrative copy.

| Surface | Inventoried occurrences | Assessment rows | Factual rows supported in available notes | Premise-supported interpretations | Partial rows | Unresolved rows | Non-plot rows |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Through Episode 21 | 92 | 133 | 9 | 18 | 17 | 51 | 38 |
| Episodes 22–25 | 83 | 107 | 21 | 36 | 17 | 10 | 23 |
| Episodes 26–30 | 126 | 154 | 37 | 62 | 27 | 3 | 25 |
| Shelf | 45 | 45 | 0 | 0 | 3 | 0 | 42 |

These counts describe the register's evidence assessments, not editorial
approval or proof that a public article is safe. Absence of an exact source
locator is not by itself a confirmed factual error or spoiler leak.

The following full-file hashes bind the register to the reviewed copy even
when a later documentation commit changes the repository revision:

| File under `public/c-drama-fandom/vibing-now/` | SHA256 |
| --- | --- |
| `against-the-current-episode-21/index.html` | `5f09d04509c210c9d2c4834b5d1d77f440ce06bd332262d884b1110ef3fe7c76` |
| `against-the-current-episodes-22-25/index.html` | `debe69d324b36971bdb0527527841a84b0f2c8eaa87c4706344b04df02417563` |
| `against-the-current-episodes-26-30/index.html` | `660c4bca43eabf5d94678ddc8b1e37068e6e86b8f09214eeb5b30a3b72008267` |
| `index.html` (shelf) | `5f59cddee6218ece829b7ee1ad14171e2652558c084476d2de980a8254862bf5` |

**Verification:** the saved Notion register was reread and compared against
every expected block, table cell, and surface snapshot: 80 top-level blocks,
8 tables, and 439 assessment rows. The four source Watch Notes properties
were unchanged on reread; the review page had no public publication URL.
All four reviewed file hashes still matched. The existing public-page test
command passed all 42 tests, and the Episode 21 preview rendered. These
checks establish persistence and page integrity, not plot chronology,
editorial approval, or the absence of future spoilers.

Before any substantive revision, an editor must decide the flagged wording,
approve exact replacements against appropriate evidence, reopen affected
claims and neighboring interpretations/metadata, and issue a dated sign-off
for the resulting revision. Remaining evidence gaps need separately authorized
verification; they do not require recreating nonexistent original notes.

### Selected wording revision — October 4, 2026

- **Editorial decision:** the creator explicitly approved three proposed
  change groups, comprising five exact surface replacements, in the editorial
  approval form. **APPROVED applies only to those replacements**, not to either
  article as a whole, historical source-review labels, or publication.
- **Affected installments:** Episodes 22–25 and Episodes 26–30. Episode 21,
  the shelf, article metadata, discussion prompts, episode boundaries, and
  historical review/publication dates are unchanged.
- **Revision identity:** the resulting full-file SHA256 values below identify
  the approved wording revision; the original register and its snapshots remain
  historical evidence, not current certification of the changed files.
- **Private decision record:** an appended revision/sign-off record in the
  same private Notion review child preserves selected row IDs, exact approved
  replacements, source-version checks, reopened assessments, and neighboring
  interpretation findings. No private source text is reproduced here.
- **Recheck:** affected claims and adjacent interpretations were reopened
  against the available notes. Metadata and shelf surfaces were checked for
  dependencies. Other partial/unresolved findings remain unresolved; unchanged
  prose has not acquired approval through this bounded revision.
- **Full factual and spoiler-boundary certification:** **BLOCKED**. The creator's
  limited wording approval does not close the missing-evidence gaps.
- **Release:** **NOT AUTHORIZED**. No deployment was performed.

| File under `public/c-drama-fandom/vibing-now/` | Approved wording revision SHA256 |
| --- | --- |
| `against-the-current-episodes-22-25/index.html` | `d4aebd0f747a62588896ce176d6952039fe35d892a6a99ab80c192802fca6fed` |
| `against-the-current-episodes-26-30/index.html` | `c025d84259c9e59707074f7a67cfc54c3173a0dc2d5974bd869e235db7d27476` |

**Validation:** `node --test scripts/public-pages.test.js` passed all 42 tests,
including the event-free warning contracts. This establishes page integrity
and warning-copy conformity only, not plot chronology or release approval.