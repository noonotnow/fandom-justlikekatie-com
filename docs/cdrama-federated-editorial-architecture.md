# CDRAMA Federated Editorial Architecture — Constitution & Case Law

**Status:** Constitution frozen; Cases 1–4 evaluated on 2026-09-06
**Scope:** Fandom Vibes, the CDRAMA Lens, CREATE, PLAN, EXECUTE, CONNECT,
domain operations, and diagnostics
**Implementation status:** Planning contract only. This document does not
authorize UI, schema, or migration work.

## Purpose

This document is the durable decision record for the federated CDRAMA editorial
system. It preserves the constitutional decisions, tests them against real
workflows, and records contradictions before physical hosting or interface work
begins.

The system is federated because a useful workspace may display records from
several products without absorbing their authority. Fandom retains records whose
meaning depends on fandom-specific rules. Creator OS develops communicative
expressions. PLAN decides placement and authorization. EXECUTE attempts native
publication. CONNECT verifies outcomes and returns non-destructive learning.

## The 14 locked decisions

1. **The system is federated, not centralized.** A unified workspace may compose
   several authorized projections without becoming the canonical store for all
   records it displays.
2. **Domain products retain domain truth.** First-watch entries, sealed evidence,
   public clock-ins, canon evidence, moderation decisions, and public domain
   state remain governed by Fandom rules.
3. **Visibility does not grant mutation authority.** A cockpit may display a
   Fandom record without permission to alter it.
4. **Capture precedes classification.** Creator OS uses Capture as the broad
   private intake primitive; classification may happen later.
5. **Promotion is additive.** Turning a Capture or selected domain passage into
   an Idea creates a linked derivative. It does not move, rewrite, or delete the
   source.
6. **Journal is a protocol, not a universal storage bucket.** A First-Watch
   Journal has immutable chronology and spoiler rules; a Waiting Room journal is
   a flexible Series practice. Their shared interface must not erase those
   differences.
7. **Series owns continuity.** A Series preserves recurring premise, source
   context, prior expressions, audience questions, and open editorial threads.
8. **CREATE is an embeddable capability.** CDRAMA work should be composable from
   its domain context without requiring Katie to leave for a separate generic
   workspace.
9. **Outputs have distinct contracts.** Platform Expressions, Domain
   Contributions, and Domain State Changes are not interchangeable and need not
   share one table.
10. **Lifecycle authority changes by stage.** CREATE owns creative composition;
    PLAN owns priority, placement, schedule, and authorization; EXECUTE owns the
    native attempt; CONNECT owns verification, reconciliation, and measurement.
11. **Planning intent is not publication truth.** Scheduling never invents a
    native ID, URL, timestamp, metric, or published state.
12. **Domain-native and external publication are separate branches.** Fandom may
    publish its own authoritative projection; optional social derivatives travel
    through CREATE → PLAN → EXECUTE → CONNECT.
13. **Evidence, current state, and cache are separate.** Immutable audience and
    curator evidence derives a replaceable curation projection; caches serve that
    projection and never become historical truth.
14. **Corrections are additive and fail closed.** Completed actions are
    superseded, invalidated, held, retracted, or reinterpreted through durable
    receipts. Historical evidence is never rewritten, and uncertain privacy or
    publication state reveals nothing.

## Product and authority map

```text
DOMAIN PRODUCTS
Preserve records whose meaning depends on domain rules
        │ narrow authorized projection or explicit promotion
        ▼
CREATE
Capture → Organize → Develop → Compose
        │ expression ready for placement
        ▼
PLAN
Select → Prioritize → Sequence → Schedule → Authorize
        │ execution request
        ▼
EXECUTE
Human or integration performs the native platform action
        │ attempt receipt or exception
        ▼
CONNECT
Verify → Reconcile → Measure → Learn → Recommend
        │
        └──► new Capture, Series learning, or reviewed recommendation
```

Handoffs change authority over lifecycle fields, not object identity. References
do not create copies. Analytics may recommend but may not silently mutate
creative or editorial truth.

## CDRAMA Lens product map

```text
CDRAMA Lens
├── Sources
│   ├── Dramas
│   ├── Actors and characters
│   ├── Episodes and scenes
│   ├── Canon evidence
│   ├── Media and references
│   └── Audience signals
├── Series
│   ├── Nian Wushuang Waiting Room
│   └── The Untamed First Watch
├── Kits / Treatments
│   ├── First-Watch Protocol
│   ├── Waiting Room
│   ├── C-drama Guide
│   ├── Xianxia Worldbuilding
│   ├── Game / Quiz
│   └── Article / Essay
├── Domain-native outputs
└── Contextual CREATE capability
```

- A **Lens** gathers authorized domain context.
- A **Kit or Treatment** supplies rules and creative grammar.
- A **Series** supplies continuity.
- **Source material** supplies evidence and inspiration.
- **CREATE** composes expressions without taking domain ownership.

The Lens's physical host remains unresolved. The contract must work whether the
Lens is hosted by Creator OS, Fandom, or a shared shell.

## Permissioned product planes

```text
Creative plane — CDRAMA Lens
Sources, Series, Kits, journals, articles, games, ideas, contextual creation

Editorial operations — CDRAMA Operations
Exact-board approval, moderation, public-boundary approval, domain publication,
holds, retirement, and other changes to authoritative public truth

System control — Admin / Diagnostics
Provider health, malformed blobs, cache repair, failed jobs, raw receipts,
migrations, permissions, and deployment/configuration inspection
```

“Katie-only” is a permission. It is not a product responsibility. A capability
belongs in Diagnostics only when it exists because machinery may fail. A
capability that remains meaningful when the software works perfectly belongs in
the creative or editorial-operations plane.

## Data and evidence map

```text
Immutable Evidence Ledger
├── audience behavior events
└── curator and audit receipts
        │ derive
        ▼
Derived Curation Projection
current eligibility, exclusions, preferences, rarity, and calibration
        │ served through
        ▼
Replaceable caches and indexes
        │ authorize candidates for
        ▼
Release Candidate Queue
        ├── Fandom-native production → Fandom publication ledger
        └── external composition → CREATE → PLAN → EXECUTE → CONNECT
                                      └── external publication ledger
```

Evidence teaches the curator. Corrections update current state. The cache serves
that state. None rewrites history.

The evidence ledger contains two families:

- **Audience behavior:** save, share, open, card export, grid export, and
  Collection activity.
- **Curator/audit receipts:** frozen audit runs, picks, exclusions, Misprints,
  Legendary decisions, rescue boards, blind comparisons, corrections,
  approvals, and eligibility decisions.

Legendary Misprints remain preserved anomalies. They must not teach the ordinary
curator that the failed identity or classification is valid.

## Output map

| Output | Examples | Authority path |
| --- | --- | --- |
| Platform Expression | Rednote post, Instagram carousel, Reel, Short, newsletter section | CREATE → PLAN → EXECUTE → CONNECT |
| Domain Contribution | Canon evidence, FAQ expansion, timeline entry, public dispatch proposal | CREATE may propose; Fandom accepts or rejects |
| Domain State Change | Evidence reveal, Waiting Room state, contribution approval | Fandom validates and authorizes |
| Domain-native publication | First-Watch public snapshot, Daily Drop edition | Fandom production and publication contract |

Fandom-native publication may be calendar-triggered, boundary-triggered,
event-triggered, manually authorized, or immediate. External platform placement
belongs to PLAN regardless of the domain trigger.

## Shared expression lifecycle

| Authority | Fields governed |
| --- | --- |
| CREATE | Concept, copy, media, format, creative lineage, creative readiness |
| PLAN | Priority, platform placement, schedule, authorization |
| EXECUTE | Attempt, native response, native identifier, execution time |
| CONNECT | Verified publication state, canonical receipt, metrics, reconciliation |
| CREATE / Series | Human-reviewed interpretation and next creative decision |

One concrete social expression remains one record while field authority changes.
The system must not duplicate it at each handoff.

## Contract-matrix template

Every case action must answer every column.

| Column | Question answered |
| --- | --- |
| Action | What is happening? |
| Authority | Who may decide it? |
| Canonical record affected | Where does truth live? |
| Input projection allowed | What may the acting surface see? |
| Mutation allowed | What may it actually change? |
| Privacy boundary | What must remain hidden or summarized? |
| Lineage / idempotency key | How is origin preserved and duplication prevented? |
| Stale/conflict behavior | What happens if the source changes before completion? |
| Correction/reversal path | How is a completed action superseded without rewriting history? |
| Receipt/event produced | What durable evidence records the outcome? |
| Downstream effect | What becomes possible next? |
| Current surface | Where does this happen now? |
| Future surface | Where should it happen? |

## Case-law sequence

1. *The Untamed* First-Watch Journal
2. *Nian Wushuang* Waiting Room
3. Vibe Atlas candidate lifecycle
4. Misprint correction and cache rebuild
5. Daily Drop with optional external derivatives
6. Rednote execution and reconciliation

Each case must prove authority, projection, privacy, mutation scope, lineage,
concurrency, receipts, downstream effects, and reversal behavior.

## Case 1 — The Untamed First-Watch Journal

### Governing purpose

The journal preserves Katie's changing state of knowledge. Filed entries advance
contiguously from Episode 1. Original predictions and their first verdict are
receipts rather than editable prose. Veteran evidence remains separate and
sealed until its explicit boundary. Public readers receive only a server-filtered
projection of an explicitly approved snapshot.

The current implementation is grounded in:

- `src/utils/watchJournal.ts`
- `src/components/FandomAdmin/WatchJournalCapture.tsx`
- `netlify/functions/lib/watch-journal.js`
- `netlify/functions/lib/watch-journal.test.js`
- `netlify/functions/lib/watch-journal-submissions.test.js`
- `.agents/memory/field-journal-spoiler-integrity.md`

### Case 1 contract summary

| ID | Action | Current result | Case-law result |
| --- | --- | --- | --- |
| C1.1 | File an episode-bound first-watch entry | Implemented with admin authority, contiguous boundaries, and optimistic concurrency | Passes core integrity; retry idempotency is missing |
| C1.2 | Save an immutable prediction | Implemented atomically with entry filing; original text and filing boundary are immutable | Passes core integrity; creation retry identity is missing |
| C1.3 | Attach sealed veteran evidence | Implemented for direct operator evidence and moderated public submissions | Passes privacy; direct evidence retry identity is missing |
| C1.4 | Display a safe CDRAMA projection | Implemented as a server-filtered reader snapshot | Passes; future cockpit must consume the same narrow projection |
| C1.5 | Promote a selected passage into an Editorial Idea | Not implemented | Missing federated promotion contract |
| C1.6 | Release evidence when the watch boundary advances | Boundary unlocks moderation; approval and explicit publication release it publicly | Passes only with this non-automatic interpretation |
| C1.7 | Correct an incorrectly filed episode boundary | Not implemented; filed entries are immutable | Missing additive correction contract |
| C1.8 | Retract or supersede a moderation/reveal decision | Raising an approved unlock can retract public evidence, but decisions are mutable state rather than an immutable ledger | Partial; missing receipt-backed reversal |

### C1.1 — File an episode-bound first-watch entry

| Contract field | Decision |
| --- | --- |
| Authority | Katie, authenticated as the Fandom operator |
| Canonical record affected | Private Fandom watch journal for the authenticated account and `the-untamed` series |
| Input projection allowed | Latest contiguous filed boundary and Katie's unfiled local form values |
| Mutation allowed | Append one entry beginning exactly at the prior boundary + 1; append its submitted predictions in the same journal mutation |
| Privacy boundary | The complete private journal is operator-only. No draft, account identity, later entry, or unknown field enters the public snapshot |
| Lineage / idempotency key | Current entry and prediction IDs are server-generated UUIDs. Contiguous validation prevents an exact retry from duplicating the range, but **gap:** there is no client action key that lets an ambiguous retry return the original successful receipt |
| Stale/conflict behavior | Compare-and-swap retries against the latest journal. A now-invalid start boundary fails validation; persistent contention returns `409` |
| Receipt/event produced | The entry and its predictions are durable point-in-time records. **Gap:** there is no separate filing receipt or caller-supplied idempotency key |
| Downstream effect | Advances the private watch boundary; creates public submission targets; permits later prediction resolution and eligible evidence review |
| Correction/reversal path | The filed entry is not edited or deleted. A future boundary-correction receipt must supersede its effective episode metadata and force all affected projections to rebuild fail closed |
| Current surface | Operator Console → Field Journal / First-Watch capture |
| Future surface | CDRAMA Lens → *The Untamed* → private First-Watch studio |

### C1.2 — Save an immutable prediction

| Contract field | Decision |
| --- | --- |
| Authority | Katie at entry filing; Katie later records one final verdict after reaching the relevant boundary |
| Canonical record affected | Fandom prediction record linked to the immutable journal entry |
| Input projection allowed | The filed entry, original prediction text, current watch boundary, and later resolution form |
| Mutation allowed | Creation appends original text and filing boundary. Resolution may fill the previously null resolution exactly once; it cannot replace the original |
| Privacy boundary | A resolution above a reader's safe boundary is projected as null. Prediction-linked evidence remains sealed until both the evidence and resolution boundaries are safe |
| Lineage / idempotency key | Prediction ID plus entry ID. Resolution retries converge because a second final verdict returns `409`. **Gap:** initial prediction creation shares the filing action's missing retry key |
| Stale/conflict behavior | A resolution beyond the latest contiguous boundary fails. Concurrent journal mutation retries against current state; a competing resolution wins and the other request conflicts |
| Receipt/event produced | Original prediction record plus additive final resolution fields and timestamp |
| Downstream effect | Enables later verdict display, veteran evidence linkage, and safe editorial selection |
| Correction/reversal path | Original prediction and first final verdict remain unchanged. A disputed verdict requires a future additive interpretation or correction receipt, not another resolution overwrite |
| Current surface | Operator Console → First-Watch prediction ledger |
| Future surface | CDRAMA Lens → *The Untamed* → First-Watch prediction ledger |

### C1.3 — Attach sealed veteran evidence

| Contract field | Decision |
| --- | --- |
| Authority | Katie may add direct evidence. A veteran may submit only to public target metadata; Katie alone may approve it into the journal |
| Canonical record affected | Direct evidence lives in the private Fandom journal. Public submissions first live in the separate operator-scoped submission archive; approved text is projected into journal evidence by stable `sourceSubmissionId` |
| Input projection allowed | Katie may see the full related record and eligible submission text. Veterans see only opaque journal identity and structural target metadata, never prediction text or theories |
| Mutation allowed | Append direct evidence, append a pending submission, or append approved evidence linked to the source submission. A moderator may correct unlock metadata but not rewrite interpretation text |
| Privacy boundary | Pending text remains outside the journal and invisible to Katie until the contiguous boundary reaches its unlock episode. It is never public until approved and included in an explicit publication snapshot |
| Lineage / idempotency key | Public approval uses `sourceSubmissionId` and is repairably idempotent across stores. **Gap:** direct evidence and initial public submission creation use random IDs without caller retry keys |
| Stale/conflict behavior | Invalid or missing relations fail. Submission and journal writes use compare-and-swap. Approval archives the decision before adding evidence so partial failure remains private and a retry repairs it |
| Receipt/event produced | Pending submission record; moderation metadata; approved evidence linked to the source submission |
| Downstream effect | Makes evidence eligible for a later safe projection and possible editorial promotion |
| Correction/reversal path | Unlock corrections may alter effective visibility. The source submission and original text remain preserved. A future decision ledger must append correction or retraction decisions rather than mutate moderation state |
| Current surface | Public veteran form plus Operator Console moderation and evidence panels |
| Future surface | Public Fandom contribution form plus CDRAMA Operations → First-Watch moderation |

### C1.4 — Display a safe projection in the CDRAMA cockpit

| Contract field | Decision |
| --- | --- |
| Authority | Fandom computes the projection; the viewer chooses a safe-through boundary within the route or workspace limit |
| Canonical record affected | None. The projection is derived from the latest explicitly published Fandom snapshot |
| Input projection allowed | Entries at or below the safe boundary, original predictions for those entries, resolutions at or below the boundary, and evidence whose unlock and linked records are safe |
| Mutation allowed | None |
| Privacy boundary | Missing or malformed boundaries reveal nothing. A route boundary is a hard maximum. Private drafts, later entries, pending/rejected submissions, account data, and unknown fields are excluded server-side |
| Lineage / idempotency key | Published snapshot identity, approved boundary, and requested safe-through episode. **Gap:** the current publication object lacks an immutable publication receipt ID |
| Stale/conflict behavior | The cockpit must render the returned projection as one snapshot and must not merge it with fresher private data. Invalid publication metadata yields an empty journal |
| Receipt/event produced | Read-only access may produce ordinary bounded analytics, but no editorial mutation or implied publication receipt |
| Downstream effect | Supports spoiler-safe reading and selection of an explicitly visible passage for a separate promotion action |
| Correction/reversal path | A superseding public snapshot or fail-closed retraction changes the derived projection; prior publication history must remain available privately |
| Current surface | Public Watch Journal route and operator reader preview |
| Future surface | CDRAMA Lens cockpit and public Watch Journal, both using the same Fandom-owned projection contract |

### C1.5 — Promote one selected passage into an Editorial Idea

| Contract field | Decision |
| --- | --- |
| Authority | Katie explicitly selects and promotes the passage |
| Canonical record affected | A new Creator OS Editorial Idea is created. The Fandom journal remains canonical and unchanged |
| Input projection allowed | Only the selected passage, minimal series/episode context, its spoiler classification, source record ID, and authorized provenance |
| Mutation allowed | CREATE may create and develop the linked Idea. It may not edit the source entry, prediction, evidence, boundary, moderation state, or public snapshot |
| Privacy boundary | Private or sealed material crosses only after explicit Katie selection. The Idea inherits the strictest source spoiler boundary and remains private until separately authorized |
| Lineage / idempotency key | Required key: source system + source record ID + selected passage digest + promotion action ID. Retrying the same action returns the same Idea |
| Stale/conflict behavior | If source visibility or correction state changes before completion, promotion fails or creates a held Idea requiring review; it never silently copies the newer source |
| Receipt/event produced | Fandom promotion receipt and Creator OS intake receipt sharing one lineage ID |
| Downstream effect | The Idea may be developed into one or more Platform Expressions, then passed to PLAN |
| Correction/reversal path | A source correction marks the Idea lineage stale or invalidated. Existing creative history remains, but further authorization is blocked until human review |
| Current surface | Not implemented |
| Future surface | Contextual “Turn into an Idea” action inside the CDRAMA Lens with embedded CREATE |

### C1.6 — Release evidence when the watch boundary advances

| Contract field | Decision |
| --- | --- |
| Authority | Filing advances Katie's private watch boundary. Katie separately approves veteran evidence and separately authorizes a public snapshot |
| Canonical record affected | Private journal boundary, submission moderation record, approved evidence, and public Fandom snapshot |
| Input projection allowed | Newly eligible submission text becomes visible only to the operator. Public readers receive only the explicitly published safe projection |
| Mutation allowed | Boundary filing does not automatically publish. Approval may append evidence; publication may replace the current public projection with a sanitized snapshot through an exact filed boundary |
| Privacy boundary | “Boundary reached” means eligible for review, not public. Evidence remains hidden when approval or publication is absent, malformed, stale, or partially failed |
| Lineage / idempotency key | Approved evidence uses source submission identity. **Gap:** public snapshot writes use a singleton key and compare-and-swap but no immutable publication receipt ID |
| Stale/conflict behavior | Publication requires an exact current filed boundary. Concurrent public writes retry and eventually return `409`. Private changes after publication remain private until republished |
| Receipt/event produced | Current publication object records approved boundary and publication time. **Gap:** overwriting the singleton projection does not preserve a publication ledger |
| Downstream effect | Readers may access the newly authorized material subject to their own safe-through boundary |
| Correction/reversal path | Unsafe evidence must first disappear from the current public projection, then private effective state is corrected. A later explicit publication may reintroduce it when safe |
| Current surface | Operator Console → publish approved boundary; public Watch Journal |
| Future surface | CDRAMA Operations → First-Watch public boundary authorization; public Fandom projection |

### C1.7 — Correct an incorrectly filed episode boundary

| Contract field | Decision |
| --- | --- |
| Authority | Katie as domain operator, with an explicit reason |
| Canonical record affected | A new Fandom boundary-correction receipt linked to the immutable filed entry; never the original entry itself |
| Input projection allowed | The original entry, dependent predictions/evidence, current effective boundary, affected public snapshots, and downstream promotion lineage |
| Mutation allowed | Append a correction that changes the effective boundary projection. It may invalidate dependent eligibility and publication, but may not rewrite original text, timestamps, or filing metadata |
| Privacy boundary | Correction processing fails closed. Any evidence made unsafe by the correction is removed from current public delivery before or atomically with effective-state change |
| Lineage / idempotency key | Entry ID + correction action ID. A reason and superseded correction ID are required when correcting a prior correction |
| Stale/conflict behavior | Compare against the current correction chain and publication version. A stale action returns conflict with no partial widening of visibility |
| Receipt/event produced | Append-only boundary-correction receipt, affected-record inventory, projection rebuild receipt, and public retraction/supersession receipt when needed |
| Downstream effect | Recomputes effective watch boundary, moderation eligibility, evidence visibility, public projection, and stale status of promoted Ideas |
| Correction/reversal path | A later correction supersedes the prior correction. Original filing and every correction remain inspectable |
| Current surface | Not implemented; current filed boundaries are immutable and contiguous |
| Future surface | CDRAMA Operations → First-Watch corrections, with diagnostics only for failed rebuilds |

### C1.8 — Retract or supersede a moderation/reveal decision

| Contract field | Decision |
| --- | --- |
| Authority | Katie as Fandom moderator and public-boundary authority |
| Canonical record affected | Append-only moderation-decision ledger, effective evidence projection, and Fandom publication ledger |
| Input projection allowed | Source submission, full decision history, current effective evidence, affected public snapshots, and downstream lineage |
| Mutation allowed | Append approve, reject, correct-unlock, retract, or supersede decisions. Rebuild effective evidence and current public projection; never rewrite source submission or prior decisions |
| Privacy boundary | A restrictive correction or retraction removes unsafe public delivery before any fallible private follow-up. Widening visibility requires complete validation and explicit republication |
| Lineage / idempotency key | Submission ID + moderation action ID; publication corrections link the decision receipt and affected snapshot |
| Stale/conflict behavior | Compare against the latest moderation decision and publication version. Conflicts preserve the more restrictive public state until retried |
| Receipt/event produced | Moderation decision receipt, effective-projection rebuild receipt, and public retraction or superseding-publication receipt |
| Downstream effect | Updates eligibility for future snapshots and marks linked Ideas or Expressions stale when their source authority changed |
| Correction/reversal path | Every later decision points to the decision it supersedes. Retraction changes effective state without deleting approval history |
| Current surface | Partial support in Operator Console: `correct-unlock` can move the boundary, and raising an approved unlock retracts evidence from the current snapshot |
| Future surface | CDRAMA Operations → First-Watch moderation history and public reveal controls |

### Case 1 verdict

**Result: Does not yet pass the complete federated contract. Core spoiler
integrity passes; federation and reversal are incomplete.**

Passing behavior:

- Fandom owns the journal and derives server-side reader projections.
- Filing is contiguous and append-oriented.
- Original prediction text and filing boundaries are immutable.
- Resolution and evidence visibility are cross-gated by safe episode boundaries.
- Public submissions are operator-scoped and separated from the private journal.
- Moderation and publication fail closed around partial failures.
- Public readers consume only an approved snapshot, never live private state.

Missing contracts:

1. **Promotion lineage:** no additive, idempotent passage → Editorial Idea
   contract exists.
2. **Boundary correction:** no append-only way to correct an incorrectly filed
   episode range and recompute all dependent projections.
3. **Decision history:** moderation status and approved evidence unlock metadata
   are currently updated in place rather than derived from an immutable decision
   ledger.
4. **Publication history:** the current public snapshot is compare-and-swap safe
   but overwrites one singleton projection without an immutable publication and
   supersession ledger.
5. **Creation idempotency:** entry filing, direct evidence creation, and initial
   public submissions do not accept stable action keys for ambiguous retries.

These are implementation-contract gaps, not contradictions in the frozen
constitution. No constitutional amendment is required after Case 1.

Case 2 may begin only after these gaps are carried forward as explicit
requirements rather than silently treated as solved.

## Case 2 — Nian Wushuang Waiting Room

### Governing purpose

The Waiting Room is a durable fan/editorial property for a continuation that
has not been officially announced. It began with the unresolved possibility in
the original *Nian Wushuang* ending. Yuan Zhong's later appearance in *Fate
Chooses You* strengthens the case by showing that the shared universe is still
playing with his unfinished search; it does not prove that another season or
installment exists.

Its canonical framing is:

> The story itself has not accepted that it is over, so neither have I.

> The story is already there. Just film it.

“Clock In” means:

> I believe this continuation should exist. I am still waiting. Make the show.

The Waiting Room is not an official petition, popularity vote, release
countdown, sequel announcement, or claim of influence. Its recurring public
question — “Is Season 2 real?” — is onboarding evidence:

> No continuation has been officially announced. Not yet. Welcome to the
> Waiting Room.

The current repository contains normalization posts and PLAN-ready social
material in `docs/vibe-atlas-normalization-runway.md`, but no canonical Waiting
Room record, Clock In ledger, website treatment, evidence model, or federated
promotion contract. Case 2 therefore tests the intended operating contract
rather than claiming that these capabilities already exist.

### Evidence classes

The Waiting Room may accumulate different evidence without flattening their
authority:

| Evidence class | Example | What it can establish |
| --- | --- | --- |
| Canon evidence | The original ending leaves Wushuang's return narratively plausible | Why the story feels unfinished |
| Universe development | Yuan Zhong appears in *Fate Chooses You* still carrying the unresolved search | The shared universe continues to invoke the thread |
| Audience signal | Repeated Rednote comments asking whether Season 2 is real | The premise is legible and requires clear onboarding |
| Editorial argument | Katie's explanation of why the continuation already has a story | A reasoned Waiting Room dispatch or website expansion |
| Official event | A verified production announcement, denial, casting notice, or release date | May justify a reviewed domain-state change |

Only a verified official event may be presented as official status. Canon,
universe, audience, and editorial evidence support the argument for
continuation; they do not manufacture an announcement.

### Case 2 contract summary

| ID | Action | Current result | Case-law result |
| --- | --- | --- | --- |
| C2.1 | Capture a private Waiting Room observation | Happens informally; no canonical Capture contract | Contract defined; requires federated Capture implementation |
| C2.2 | Record an audience question | Rednote comments provide source material, but no bounded signal record exists | Contract defined with privacy-preserving citation |
| C2.3 | Attach canon evidence from the original ending | Not modeled as Waiting Room evidence | Contract defined as Fandom-owned evidence |
| C2.4 | Add the *Fate Chooses You* cameo as universe evidence | Editorially recognized, not canonically recorded | Contract defined without treating it as sequel confirmation |
| C2.5 | Promote selected material into an Editorial Idea | Not implemented | Reuses the additive promotion contract identified in Case 1 |
| C2.6 | Compose optional platform expressions | Existing runway anticipates PLAN drafts and platform edits | Passes with blank-platform slots and one-expression identity |
| C2.7 | Propose a durable website contribution | Not implemented | Contract defined as a Domain Contribution, not a social Post |
| C2.8 | Accept a public Clock In | Not implemented | Contract defined as Fandom participation, not a vote |
| C2.9 | Change public state after an official event or correction | Not implemented | Contract defined as a receipted Domain State Change |
| C2.10 | Retract evidence or supersede an argument | Not implemented | Contract defined through additive correction and supersession |

### C2.1 — Capture a private Waiting Room observation

| Contract field | Decision |
| --- | --- |
| Authority | Katie |
| Canonical record affected | A private Creator OS Capture linked to the Fandom-owned Waiting Room Series |
| Input projection allowed | Minimal Series identity, current public premise/status, and explicitly requested Fandom source references |
| Mutation allowed | Append private observation text, source links, rough treatment, and optional classification. It may link to the Series but cannot alter Fandom evidence or public state |
| Privacy boundary | The Capture remains private by default. A Series link does not expose its text to Fandom, PLAN, public readers, or other creators |
| Lineage / idempotency key | Capture action ID plus optional source record IDs. Retrying one save returns the same Capture; later thoughts create revisions or new Captures according to the Capture contract |
| Stale/conflict behavior | A changed Series projection does not rewrite the Capture. It marks source context stale and requests review before promotion or authorization |
| Receipt/event produced | Creator OS Capture receipt with Series reference, author, timestamp, and source-projection version |
| Downstream effect | May remain private, join Series development, or be explicitly promoted into an Editorial Idea |
| Correction/reversal path | Corrections append a Capture revision or annotation. If the premise changes, the original thought remains historical and becomes stale or superseded |
| Current surface | Informal notes and social planning; no durable cross-product Capture |
| Future surface | CDRAMA Lens → *Nian Wushuang* Waiting Room → private capture |

### C2.2 — Record a Rednote audience question

| Contract field | Decision |
| --- | --- |
| Authority | Katie selects the comment as editorially useful; CONNECT may import a bounded reference but may not interpret it as truth |
| Canonical record affected | A private audience-signal Capture or CONNECT event reference linked to the Waiting Room Series; the native comment remains canonical on Rednote |
| Input projection allowed | Comment text or excerpt, native platform, native comment/post identifier, timestamp, public display name only when needed, and source URL where available |
| Mutation allowed | Save a reference, classify the recurring question, and aggregate repeated themes. It may not alter the native comment or silently convert one comment into a broad audience claim |
| Privacy boundary | Do not import private profile data, unrelated account history, or hidden identifiers. Public presentation should quote minimally, anonymize by default, and follow platform/content permissions |
| Lineage / idempotency key | Platform + native comment ID; a manual excerpt without a native ID uses source post ID + excerpt digest |
| Stale/conflict behavior | Deleted, edited, or unavailable comments remain historical references marked unavailable or changed. They are not silently refreshed into different source text |
| Receipt/event produced | Audience-signal capture receipt with source identity, capture time, consent/quotation status, and interpretation status |
| Downstream effect | Can inform FAQ wording, dispatch topics, and Series learning after human review |
| Correction/reversal path | Retract quotation permission or supersede an interpretation while preserving the fact that a signal was captured. Aggregates are recomputed without the retracted quotation |
| Current surface | Manual reading of Rednote comments |
| Future surface | CONNECT-projected Signals inside the CDRAMA Lens, with explicit “Save as audience signal” |

### C2.3 — Attach canon evidence from the original ending

| Contract field | Decision |
| --- | --- |
| Authority | Katie proposes the evidence; Fandom domain stewardship accepts its source, spoiler classification, and public use |
| Canonical record affected | Fandom Waiting Room canon-evidence record |
| Input projection allowed | Bounded episode/scene reference, Katie's original paraphrase, source provenance, spoiler level, and any rights-safe media reference |
| Mutation allowed | Append an evidence record and later annotations. It cannot rewrite the drama, claim certainty beyond the source, or silently change official status |
| Privacy boundary | Spoiler-bearing evidence is omitted or summarized for contexts that have not opted into spoilers. Rights-restricted media remains private even when the paraphrased evidence is public |
| Lineage / idempotency key | Series + source work + episode/scene anchor + evidence digest |
| Stale/conflict behavior | Competing interpretations coexist as annotations or reviewed alternatives. A source/provenance failure holds the evidence from public projection |
| Receipt/event produced | Evidence acceptance receipt with provenance, spoiler level, curator, and accepted interpretation scope |
| Downstream effect | Supports the canonical “why we are waiting” argument, website expansion, and selected creative expressions |
| Correction/reversal path | Append correction, narrower interpretation, provenance withdrawal, or invalidation. Existing expressions become stale for review but are not rewritten automatically |
| Current surface | Editorial premise and social copy; no canonical evidence record |
| Future surface | CDRAMA Lens → Sources and CDRAMA Operations → Waiting Room evidence |

### C2.4 — Add the Fate Chooses You cameo as universe evidence

| Contract field | Decision |
| --- | --- |
| Authority | Katie proposes; Fandom domain stewardship verifies identity, source, and claim strength |
| Canonical record affected | Fandom universe-development evidence linked to the Waiting Room Series and the relevant actor/character/drama identities |
| Input projection allowed | Verified work identity, Yuan Zhong character identity, bounded appearance reference, source provenance, and Katie's interpretation |
| Mutation allowed | Append later-universe evidence stating that the unresolved thread is invoked again. It may not declare a sequel, renewal, official plan, or production status |
| Privacy boundary | Unverified leaks, private screeners, and rights-unsafe media do not enter the public projection. Spoiler summaries remain appropriately labeled |
| Lineage / idempotency key | Source work + appearance/scene anchor + Yuan Zhong identity + evidence digest |
| Stale/conflict behavior | Identity or translation disputes hold the evidence. A stronger verified source may supersede the interpretation without deleting the original receipt |
| Receipt/event produced | Universe-evidence acceptance receipt with claim-strength label: supports unfinished-thread argument, not sequel confirmation |
| Downstream effect | Enables a new Waiting Room dispatch, timeline entry, website argument expansion, or selected platform expression |
| Correction/reversal path | Append identity correction, interpretation narrowing, or invalidation; mark dependent contributions and Ideas stale for human review |
| Current surface | Editorial discussion and source material; no canonical evidence record |
| Future surface | CDRAMA Lens → Waiting Room evidence timeline |

### C2.5 — Promote selected material into an Editorial Idea

| Contract field | Decision |
| --- | --- |
| Authority | Katie explicitly selects a private Capture or authorized Fandom projection |
| Canonical record affected | New Creator OS Editorial Idea; source records remain canonical in their original systems |
| Input projection allowed | Selected text/evidence only, Series identity, source IDs, public/spoiler classification, claim-strength limits, and minimal provenance |
| Mutation allowed | CREATE may develop angle, thesis, treatment, copy, and possible outputs. It may not change source evidence, audience signals, Clock Ins, or Waiting Room state |
| Privacy boundary | Private Captures cross only by Katie's action. Fandom evidence crosses through its authorized projection. The Idea inherits all source restrictions |
| Lineage / idempotency key | Source system + source record/version + selection digest + promotion action ID |
| Stale/conflict behavior | Changed, corrected, or withdrawn sources mark the Idea stale/held. CREATE never refreshes source claims silently |
| Receipt/event produced | Source promotion receipt and Creator OS intake receipt sharing one lineage ID |
| Downstream effect | Enables optional Platform Expressions or a proposed Domain Contribution |
| Correction/reversal path | Source correction blocks further authorization until reviewed. Idea revisions preserve prior creative history and updated lineage |
| Current surface | Not implemented |
| Future surface | Contextual CREATE capability inside the CDRAMA Lens |

### C2.6 — Compose optional platform expressions

| Contract field | Decision |
| --- | --- |
| Authority | CREATE composes; Katie approves creative readiness; PLAN separately authorizes placement |
| Canonical record affected | One Creator OS expression per concrete platform treatment, linked to one Editorial Idea and the Waiting Room Series |
| Input projection allowed | Approved Idea, authorized source excerpts, platform constraints, prior Series expressions, and bounded performance learning |
| Mutation allowed | Develop platform-native copy, media direction, format, and CTA. Blank channel slots are valid; one Idea need not produce every platform treatment |
| Privacy boundary | Only material authorized for that expression crosses to PLAN or an execution adapter. Private Captures and unused source context stay behind |
| Lineage / idempotency key | Idea ID + platform + treatment/variant ID. Retries preserve one expression identity and version history |
| Stale/conflict behavior | Source correction, duplicate scheduling, or changed Series state places the expression on hold. Concurrent edits require version-aware conflict resolution |
| Receipt/event produced | Creative readiness receipt; later PLAN authorization, execution, and CONNECT receipts remain separate |
| Downstream effect | PLAN may prioritize and place a Rednote diary entry, Instagram visual argument, or selective Reel/Short |
| Correction/reversal path | Revise or retire the expression; do not alter the Idea or source. Published corrections travel through the platform-specific reconciliation contract |
| Current surface | PLAN-ready runway drafts and manual platform adaptation |
| Future surface | CDRAMA Lens → embedded CREATE, then PLAN |

### C2.7 — Propose a durable website contribution

| Contract field | Decision |
| --- | --- |
| Authority | CREATE may propose; Fandom domain stewardship decides whether and how it enters authoritative public content |
| Canonical record affected | Proposed Domain Contribution in Creator OS or an intake queue; accepted content becomes a versioned Fandom Waiting Room contribution |
| Input projection allowed | Proposed copy, source lineage, intended placement, spoiler level, evidence references, and update type |
| Mutation allowed | Propose one of: add evidence, expand argument, record universe development, add FAQ/audience question, preserve excerpt, or intentionally publish a substantial adaptation. It may not directly mutate the live site |
| Privacy boundary | Draft rationale and unused source context remain private. Only accepted, rights-safe, spoiler-appropriate content enters the public domain projection |
| Lineage / idempotency key | Proposal action ID + target Waiting Room section + source lineage digest |
| Stale/conflict behavior | If the target section or source changes, acceptance requires rebase/review. Duplicate proposals converge or are explicitly related; they do not overwrite live content |
| Receipt/event produced | Contribution proposal receipt; Fandom acceptance/rejection receipt; public version/publication receipt when accepted |
| Downstream effect | Expands the canonical case, FAQ, evidence timeline, or selected editorial dispatch without mirroring every social caption |
| Correction/reversal path | Supersede, retract, or narrow the accepted contribution through a new Fandom version and correction receipt. Preserve the original public-history record |
| Current surface | Not implemented; current public C-drama site has no Waiting Room contribution workflow |
| Future surface | CDRAMA Lens → website contribution proposal; CDRAMA Operations → review and publish |

### C2.8 — Accept a public Clock In

| Contract field | Decision |
| --- | --- |
| Authority | A visitor chooses to Clock In; Fandom defines validity, abuse controls, and public aggregation |
| Canonical record affected | Fandom Waiting Room participation ledger |
| Input projection allowed | Current public premise, explicit statement of meaning, privacy notice, and minimal participation form |
| Mutation allowed | Append one participation receipt under the chosen privacy model. It may update a derived aggregate, but it cannot claim official voting power or alter production status |
| Privacy boundary | Collect the minimum needed for abuse prevention and chosen acknowledgement. Private identifiers never appear in public aggregates; public names require explicit opt-in |
| Lineage / idempotency key | Privacy-preserving participant/session identity + Waiting Room campaign version, with rate limiting and replay protection |
| Stale/conflict behavior | If the campaign meaning or privacy terms change mid-action, reject and request renewed consent. Duplicate submissions converge on one effective Clock In |
| Receipt/event produced | Participation receipt and aggregate-update receipt |
| Downstream effect | Supports a truthful count or participation display and may produce aggregate audience signals |
| Correction/reversal path | A participant may withdraw where identity permits; append a withdrawal receipt and decrement the derived aggregate without deleting the historical operational receipt |
| Current surface | Social “clock in” language only; no canonical participation mechanism |
| Future surface | Public Fandom Waiting Room |

### C2.9 — Change Waiting Room public state

| Contract field | Decision |
| --- | --- |
| Authority | Fandom domain stewardship verifies the event; Katie authorizes the public state change |
| Canonical record affected | Fandom Waiting Room domain-state ledger and current public-state projection |
| Input projection allowed | Current state/history, verified official source, effective date, affected website language, and dependent scheduled expressions |
| Mutation allowed | Append a transition such as continued waiting, announcement watch, officially announced, release-dated, contradicted, or closed/archived. Exact vocabulary remains a later product decision |
| Privacy boundary | Unverified reports remain private evidence or held proposals. No public state changes from analytics, audience enthusiasm, or a social rumor |
| Lineage / idempotency key | Official event/source identity + state-transition action ID |
| Stale/conflict behavior | Compare against current state and source verification. Competing events or stale transitions fail for operator review |
| Receipt/event produced | Domain-state transition receipt, public projection version, and invalidation notices for affected scheduled expressions |
| Downstream effect | Changes website framing and may create reviewed recommendations for CREATE/PLAN; it never auto-publishes external posts |
| Correction/reversal path | Append a corrected or superseding state transition linked to the prior receipt. Preserve every prior public state and its effective interval |
| Current surface | Not implemented |
| Future surface | CDRAMA Operations → Waiting Room state; public Fandom projection |

### C2.10 — Retract evidence or supersede an argument

| Contract field | Decision |
| --- | --- |
| Authority | Fandom domain stewardship corrects accepted evidence/contributions; Katie revises editorial arguments; native platforms govern external post correction mechanics |
| Canonical record affected | Fandom evidence/contribution correction ledger, Creator OS Idea/expression history, and applicable publication ledgers |
| Input projection allowed | Source record, correction reason, dependency graph, current public versions, derived Ideas/expressions, and publication receipts |
| Mutation allowed | Append correction, invalidation, retraction, or superseding interpretation; rebuild current projections and hold dependent unpublished work |
| Privacy boundary | Rights or spoiler corrections remove unsafe current delivery first. Internal reasons remain private when public disclosure would expose protected information |
| Lineage / idempotency key | Corrected record ID + correction action ID; every dependent notice references that correction |
| Stale/conflict behavior | Compare against current correction chain and publication versions. Conflicts preserve the more restrictive public state |
| Receipt/event produced | Correction receipt, projection rebuild receipt, dependent-work stale notices, and publication correction/reconciliation receipts as applicable |
| Downstream effect | Keeps the current Waiting Room trustworthy while retaining the history of how its argument evolved |
| Correction/reversal path | A later receipt may supersede the correction; no prior evidence, argument, or publication receipt is deleted |
| Current surface | Not implemented |
| Future surface | CDRAMA Operations for domain truth; embedded CREATE for editorial revisions; CONNECT for external reconciliation |

### Cross-case ruling — First Watch versus Waiting Room

| Concern | Reusable contract | First-Watch specialization | Waiting Room specialization |
| --- | --- | --- | --- |
| Capture | Private capture with explicit source lineage | Filing creates a domain record only at a contiguous episode boundary | Observations may remain informal Captures and be classified later |
| Promotion | Additive, selected, idempotent source → Idea handoff | Passage carries an immutable episode/spoiler boundary | Selection carries evidence class, claim strength, and Series context |
| Evidence | Accepted evidence remains source-governed and correction-aware | Sealed until explicit episode and linked-resolution boundaries | Accumulates over time; official, canon, universe, audience, and editorial evidence retain distinct authority |
| Participation | Minimal data, durable receipt, abuse controls, truthful meaning | Veteran contribution is sealed testimony subject to moderation | Clock In is present-tense participation, not evidence or a vote |
| Public state | Domain-owned, receipt-backed projection | Reader-safe boundary and explicit publication snapshot | Evolving Waiting Room status driven only by verified events |
| Expressions | Optional CREATE derivatives; blank platform slots are valid | Must not leak knowledge beyond the source boundary | May adapt the argument differently for Rednote, Meta, video, and the website |
| Correction | Additive receipts, dependency invalidation, fail-closed projection rebuild | Boundary and reveal corrections prioritize spoiler containment | Evidence and argument corrections preserve the evolution of the public case |

**Ruling:** Capture, selection, additive promotion, lineage, stale-source
handling, optional expressions, and receipt-backed correction are reusable
federated contracts. Contiguous chronology, immutable predictions, and sealed
reader boundaries remain First-Watch-specific. Flexible evidence accumulation,
Clock Ins, evolving public argument, and verified-event state transitions remain
Waiting-Room-specific.

Neither Journal type should be flattened into the other.

### Case 2 verdict

**Result: Passes the frozen architecture on paper. No constitutional amendment
is required.**

Case 2 establishes complete authority and reversal contracts for all ten
actions. It also confirms that the missing Case 1 capabilities are shared
infrastructure where appropriate, not reasons to generalize away First-Watch
rules.

Implementation remains absent for the Waiting Room itself. That is expected at
this phase and does not authorize UI or schema work.

### Cumulative required-contract register after Case 2

| Contract | Origin | Required behavior | Needed again |
| --- | --- | --- | --- |
| Additive source promotion | Cases 1 and 2 | Create one derivative Idea from a selected authorized projection; preserve source authority and shared lineage | Cases 5 and 6 |
| Stable creation idempotency | Cases 1 and 2 | Ambiguous retries return the original receipt instead of creating another semantic action | All mutation cases |
| Append-only correction chain | Cases 1 and 2 | Preserve original records; derive effective state from corrections and supersessions | Cases 3–6 |
| Immutable publication ledger | Cases 1 and 2 | Separate historical publication receipts from the replaceable current public projection | Cases 3, 5, and 6 |
| Dependency invalidation | Cases 1 and 2 | Source corrections mark derived Ideas, contributions, expressions, and projections stale or held | Cases 3–6 |
| Minimal authorized projection | Cases 1 and 2 | Send only selected text, required context, restrictions, and lineage across product boundaries | All remaining cases |
| Fail-closed restrictive correction | Cases 1 and 2 | Remove unsafe current delivery before fallible widening or rebuild work | Cases 3 and 4 |
| Domain contribution intake | Case 2 | CREATE proposes; Fandom accepts, versions, publishes, corrects, or rejects | Case 5 |
| Domain-state transition ledger | Case 2 | Verified events produce explicit transitions; analytics and rumors cannot mutate public truth | Case 5 |
| Participation ledger | Case 2 | Preserve truthful participation meaning, privacy, withdrawal, aggregation, and abuse controls | Waiting Room-specific unless another case proves reuse |

## Case 3 — Vibe Atlas candidate lifecycle

### Governing purpose

The Vibe Atlas candidate lifecycle turns frozen curation evidence into an exact
approved board, derives whether that approval remains currently eligible, and
tracks the separate operational work required before PLAN may schedule it.

The governing distinction is:

```text
Frozen audit evidence
→ exact-board approval
→ current Approved Candidate projection
→ Production Readiness receipts
→ ready for scheduling
```

An Approved Candidate is not necessarily production-complete. A Remaining Gate
is not necessarily a system failure. “Inventory” currently means the shelf of
current approved actor × Vibe candidates, not all media, all saved grids, or all
audit blobs.

The implemented contract is grounded in:

- `netlify/functions/lib/actor-audit.js`
- `netlify/functions/lib/actor-eligibility.js`
- `netlify/functions/lib/actor-audit.test.js`
- `netlify/functions/lib/actor-eligibility.test.js`
- `src/components/FandomAdmin/ActorPreflightLab.tsx`
- `src/components/FandomAdmin/ReleaseDesk.tsx`
- `docs/release-desk-architecture.md`
- `docs/misprint-correction-contract.md`

### Candidate identity

A release candidate is the exact approved edition, not merely an actor × Vibe
pair:

```text
actor ID
+ Vibe key
+ current audit run ID
+ pairing fingerprint
+ publication source
+ exact board hash
+ approval decision ID
```

The actor × Vibe pair remains useful for inventory grouping and future curation,
but a new audit run or a different exact nine creates a different candidate
edition. Production receipts must remain bound to that exact run and
fingerprint.

### Case 3 contract summary

| ID | Action | Current result | Case-law result |
| --- | --- | --- | --- |
| C3.1 | Freeze an actor × Vibe audit run | Implemented as immutable run evidence | Passes |
| C3.2 | Record blind comparison and curator calibration | Implemented with immutable first choice and required disagreement reasons | Passes |
| C3.3 | Approve one exact nine-card edition | Implemented with immutable verdict, board source, confirmations, and board hash | Passes |
| C3.4 | Derive the current Approved Candidate shelf | Implemented through fail-closed eligibility validation and recent-use context | Passes; current “release-ready” wording is too strong |
| C3.5 | Record Production Readiness work | Implemented as chained immutable receipts for five stages | Passes core history; ambiguous retry identity is incomplete |
| C3.6 | Declare the candidate ready for scheduling | Implemented as a derived condition after every gate is complete | Passes; PLAN remains scheduling authority |
| C3.7 | Hold and later resume a candidate | A blocked production stage can stop readiness, but no explicit hold contract exists | Partial; hold ledger required |
| C3.8 | Retire an edition or actor × Vibe pairing | Calibration evidence can be retired, but candidate/edition/pairing retirement is not implemented | Missing lifecycle exception contract |
| C3.9 | Supersede a candidate with a fresh audit | Implemented indirectly through current-run/fingerprint validation | Passes preservation; explicit supersession lineage should be projected |
| C3.10 | Invalidate a candidate after a Misprint | Implemented through append-only correction and derived invalidation | Passes boundary; detailed correction behavior belongs to Case 4 |

### C3.1 — Freeze an actor × Vibe audit run

| Contract field | Decision |
| --- | --- |
| Authority | Fandom curation machinery gathers evidence; Katie initiates the run and later interprets it |
| Canonical record affected | Immutable Fandom actor-audit run, its query/source evidence, curation receipt, proposed boards, pairing fingerprint, and contract versions |
| Input projection allowed | Actor identity profile, Vibe promise, current query ladder, active curator corrections/calibration, and bounded provider results |
| Mutation allowed | Append a new run and advance the current-run head. It may not rewrite a prior run |
| Privacy boundary | Raw provider evidence, rejected candidates, internal scores, query spells, and diagnostics remain operator-only. Public surfaces receive no audit payload |
| Lineage / idempotency key | Actor ID + Vibe key + run ID, with pairing/profile/curation contract fingerprints. A run ID identifies one frozen evidence set |
| Stale/conflict behavior | A newer run may become current while an older run remains historical. Verdicts against a non-current or legacy-contract run fail |
| Receipt/event produced | Frozen audit run and current-head update |
| Downstream effect | Enables blind review, rescue-board work, exact-board approval, and a new eligibility decision |
| Correction/reversal path | Never edit the frozen run. Append Misprint, calibration-retirement, or signal-retirement receipts and require a fresh run |
| Current surface | Actor Preflight Lab |
| Future surface | Vibe Atlas Curator Lab inside the CDRAMA Lens; provider failures remain in Diagnostics |

### C3.2 — Record blind comparison and curator calibration

| Contract field | Decision |
| --- | --- |
| Authority | Katie as canonical curator |
| Canonical record affected | Fandom blind-choice, disagreement-reason, and calibration receipts linked to the audit run |
| Input projection allowed | Blinded Event and Compiled boards, then system winner and relevant evidence after Katie commits the independent choice |
| Mutation allowed | Record the first choice once; append required reason codes/notes and calibration evidence. It cannot revise the frozen candidate evidence |
| Privacy boundary | System scores and winner remain hidden until the independent choice is made. Detailed curator teaching signals remain operator-only |
| Lineage / idempotency key | Audit run ID + board hashes + presentation order + curator action identity |
| Stale/conflict behavior | Non-current, legacy-contract, incomplete, or already-decided runs reject a new choice. Identical retries return the existing decision |
| Receipt/event produced | Immutable blind-review and calibration receipts, including agreement/disagreement |
| Downstream effect | Teaches the derived curator profile and satisfies approval prerequisites |
| Correction/reversal path | Retire a calibration receipt or specific learned signal with a reason; require a fresh audit under the active evidence set |
| Current surface | Actor Preflight Lab |
| Future surface | Vibe Atlas Curator Lab |

### C3.3 — Approve one exact nine-card edition

| Contract field | Decision |
| --- | --- |
| Authority | Katie as Fandom editorial approver |
| Canonical record affected | Immutable verdict receipt plus immutable eligibility-decision history for the exact current run |
| Input projection allowed | Current run, committed blind review, disagreement reasons, complete curated or saved rescue board, active Misprint corrections, and explicit Vibe/publishability confirmations |
| Mutation allowed | Record one final verdict for the run and append an eligibility decision. Approval must identify one complete nine-card publication board |
| Privacy boundary | Approval receipts and rejected evidence remain private. A downstream package receives only the approved exact board and authorized provenance |
| Lineage / idempotency key | Run ID + verdict + confirmation flags + publication source + exact board hash + rescue preference identity |
| Stale/conflict behavior | Approval fails if the run is no longer current, its contract changed, its rescue board is stale, another verdict won, or an active Misprint matches the board |
| Receipt/event produced | Immutable verdict, preference/calibration receipts where applicable, and immutable eligibility decision |
| Downstream effect | Creates a current Approved Candidate projection and permits Production Readiness work |
| Correction/reversal path | The approval remains historical. New evidence or correction appends an invalidating eligibility decision; a fresh run and new approval are required |
| Current surface | Actor Preflight Lab |
| Future surface | Vibe Atlas Curator Lab / CDRAMA Operations approval boundary |

### C3.4 — Derive the current Approved Candidate shelf

| Contract field | Decision |
| --- | --- |
| Authority | Fandom derives the shelf; no operator manually edits membership |
| Canonical record affected | None. This is a projection of current valid approvals plus publication history |
| Input projection allowed | Strongly read current audit head, eligibility snapshot/history, exact approved board, pairing fingerprint, active retirements/corrections, and recent Daily Drop manifests |
| Mutation allowed | None |
| Privacy boundary | The private shelf may show actor/Vibe grouping, source type, backup availability, and repeat-use context. It does not expose raw evidence publicly |
| Lineage / idempotency key | Current eligibility decision ID + run ID + pairing fingerprint + exact board source/hash |
| Stale/conflict behavior | Missing, mismatched, superseded, legacy, or correction-invalidated evidence yields no current candidate. Projection fails closed rather than guessing |
| Receipt/event produced | Read-only projection; no new editorial receipt |
| Downstream effect | Makes the exact edition available to Production Readiness and shows recent actor/pair use without scheduling it |
| Correction/reversal path | Recompute from immutable decisions. Removed candidates remain inspectable through audit/decision history |
| Current surface | Release Desk → Inventory |
| Future surface | Vibe Atlas Studio → Approved Candidates |

The current label “release-ready actor × Vibe pairing” means “currently
editorially approved and eligible to enter production.” It must not be read as
“finished and ready to publish.”

### C3.5 — Record Production Readiness work

| Contract field | Decision |
| --- | --- |
| Authority | Katie or an authorized Fandom production operator |
| Canonical record affected | Chained immutable Production Readiness receipts bound to the exact actor/Vibe/run/fingerprint candidate; a replaceable state pointer names the current receipt |
| Input projection allowed | Exact approved candidate, current stage states, relevant production artifacts, and private provenance/rights information |
| Mutation allowed | Append a receipt setting one stage to pending, blocked, or complete for asset, enhancement, render, copy, or provenance/rights |
| Privacy boundary | Rights notes, source problems, internal asset locations, and operator identity remain private. PLAN receives only readiness and bounded reasons needed for placement |
| Lineage / idempotency key | Candidate identity + previous receipt ID + stage + status + reason determine the immutable receipt ID. **Gap:** a repeated request after an ambiguous success sees a new previous receipt and can append a redundant semantic transition |
| Stale/conflict behavior | Only the current approved edition may transition. Compare-and-swap on the state pointer rejects concurrent updates; the operator refreshes and retries |
| Receipt/event produced | Immutable stage-transition receipt linked to its predecessor and current-state pointer |
| Downstream effect | Recomputes Remaining Gates and, when all complete, readiness for PLAN |
| Correction/reversal path | Append another stage receipt with corrected status/reason; never edit the prior receipt |
| Current surface | Release Desk → Production |
| Future surface | Vibe Atlas Studio → Production Readiness |

### C3.6 — Declare the candidate ready for scheduling

| Contract field | Decision |
| --- | --- |
| Authority | Fandom derives readiness; PLAN remains the only scheduling and placement authority |
| Canonical record affected | None beyond the underlying approval and production receipts; `scheduleEligible` is derived |
| Input projection allowed | Current valid approval, exact-nine validation, and latest state of every production stage |
| Mutation allowed | None. Readiness becomes true only when no gate remains |
| Privacy boundary | PLAN may see candidate identity, authorized assets/copy, readiness, bounded constraints, and repeat-use warnings; it need not receive raw audit or diagnostic evidence |
| Lineage / idempotency key | Exact candidate identity + current Production Readiness receipt ID |
| Stale/conflict behavior | Any invalidated approval or newly blocked stage immediately makes the derived projection not ready. PLAN must revalidate before schedule authorization |
| Receipt/event produced | No independent receipt merely for the derived boolean. PLAN later produces a separate scheduling-intent receipt |
| Downstream effect | Allows PLAN to consider, prioritize, sequence, and schedule the candidate |
| Correction/reversal path | A new production or eligibility receipt removes readiness without rewriting earlier complete-stage history or PLAN history |
| Current surface | Release Desk → Production; PLAN reads its own scheduling contract |
| Future surface | Vibe Atlas Studio → Production Readiness, then PLAN |

### C3.7 — Hold and later resume a candidate

| Contract field | Decision |
| --- | --- |
| Authority | Katie or an authorized Fandom release operator |
| Canonical record affected | Append-only candidate hold ledger and derived active-candidate projection |
| Input projection allowed | Exact candidate identity, readiness, repeat-use context, current PLAN intent, hold history, and bounded reason taxonomy |
| Mutation allowed | Append a hold with reason, scope, optional review date, and operator; append a later release-from-hold receipt. It does not alter approval or completed production work |
| Privacy boundary | Sensitive rights or personnel details remain private; PLAN receives only that the candidate is held and any safe operational reason |
| Lineage / idempotency key | Candidate identity + hold action ID; release receipt links the active hold |
| Stale/conflict behavior | A hold against a superseded candidate is historical only. Concurrent hold/release actions compare against the current effective hold |
| Receipt/event produced | Hold or release-from-hold receipt |
| Downstream effect | Held candidates remain inspectable but are excluded from scheduling authorization |
| Correction/reversal path | Release the hold through a new receipt or supersede an incorrect hold reason; never delete the hold history |
| Current surface | Not implemented. Marking a production stage blocked can stop readiness but does not express an editorial/operational hold |
| Future surface | Vibe Atlas Studio → Held / Retired |

### C3.8 — Retire an edition or actor × Vibe pairing

| Contract field | Decision |
| --- | --- |
| Authority | Katie as Fandom editorial steward; rights withdrawal may require a distinct authorized operator path |
| Canonical record affected | Edition-retirement or pairing-retirement ledger linked to the exact candidate or actor × Vibe identity |
| Input projection allowed | Approval/publication history, active candidates, replacement candidates, saved-member impact, and rights/provenance constraints |
| Mutation allowed | Edition retirement removes one exact edition from active production/scheduling. Pairing retirement blocks future suggestions for the pair. Neither deletes historical approvals, publications, or member saves |
| Privacy boundary | Private reason may differ from public explanation. Rights withdrawal may remove current asset delivery while preserving private receipts |
| Lineage / idempotency key | Retirement action ID + exact edition ID or actor/Vibe pairing identity; optional successor link |
| Stale/conflict behavior | Reject retirement against an ambiguous target. A published edition follows publication-correction rules rather than disappearing silently |
| Receipt/event produced | Retirement receipt, projection rebuild receipt, and affected-surface inventory |
| Downstream effect | Excludes the edition or pairing from future candidate/scheduling projections while preserving history |
| Correction/reversal path | Append reinstatement or successor receipt after review. A retracted correction does not automatically restore an invalidated approval; fresh approval may still be required |
| Current surface | Not implemented for candidates. Rescue-calibration evidence and signals have separate retirement receipts |
| Future surface | Vibe Atlas Studio → Held / Retired; Diagnostics only for failed rebuilds |

### C3.9 — Supersede a candidate with a fresh audit

| Contract field | Decision |
| --- | --- |
| Authority | Fandom advances the current audit head when a new run is accepted; Katie approves the new exact edition |
| Canonical record affected | New immutable run, verdict, eligibility decision, and candidate identity; old run and production receipts remain historical |
| Input projection allowed | Current actor/Vibe contract, active evidence/corrections, and prior run as comparison history |
| Mutation allowed | Advance the current-run and current-eligibility pointers. It may not reuse old production readiness for a different run/fingerprint |
| Privacy boundary | Historical evidence and reasons remain operator-only. Downstream systems receive only explicit supersession and current candidate identity |
| Lineage / idempotency key | New run ID and fingerprint; an optional `supersedesCandidateId` should make the relationship explicit |
| Stale/conflict behavior | Old-run verdicts and production transitions fail. Any scheduled but unexecuted placement for the old candidate becomes stale and requires review |
| Receipt/event produced | New run/verdict/eligibility receipts; **gap:** explicit candidate-supersession receipt is not currently projected |
| Downstream effect | Removes the old edition from current candidate/readiness views and starts a distinct readiness chain for the new edition |
| Correction/reversal path | Returning to earlier material requires a new current run/approval, not repointing history silently |
| Current surface | Actor Preflight and derived Release Desk behavior |
| Future surface | Curator Lab with explicit supersession shown in Approved Candidates |

### C3.10 — Invalidate a candidate after a Misprint

| Contract field | Decision |
| --- | --- |
| Authority | Trusted operator correction, or operator approval of pending signed-in feedback |
| Canonical record affected | Immutable Misprint correction/decision ledger and a new derived eligibility decision; the original approval remains unchanged |
| Input projection allowed | Strong candidate identity, actor/Vibe scope, correction reason, current approval, production state, and matching publication manifests |
| Mutation allowed | Activate future exclusion, invalidate current eligibility, fail closed for backfill, and append publication-correction notices where already published |
| Privacy boundary | Raw correction evidence remains private. Public correction language is separately authored and must not expose protected provenance |
| Lineage / idempotency key | Deterministic correction identity from action, source object, actor/Vibe, reason, principal, and strongest candidate identity |
| Stale/conflict behavior | Correction activation and publication share a lock and revalidate eligibility. The winner is recorded; the later operation observes and handles the new immutable state |
| Receipt/event produced | Misprint receipt/decision, invalidating eligibility decision, and publication-correction receipt when applicable |
| Downstream effect | Candidate leaves current inventory/readiness; fresh corrected audit and approval are required |
| Correction/reversal path | A reasoned retraction stops future exclusion but does not resurrect the invalidated approval. Case 4 tests the complete cache/projection rebuild path |
| Current surface | Actor Preflight / Collection correction flows with effects visible in Release Desk |
| Future surface | Curator Lab correction; derived Approved Candidates and Production Readiness projections |

### Case 3 verdict

**Result: Core candidate lifecycle passes the frozen architecture. Exception
management is incomplete but requires no constitutional amendment.**

Implemented strengths:

- Audit runs and final curator choices are immutable.
- Exact approval is tied to a current run, current contracts, explicit
  confirmations, publication source, and exact board hash.
- Eligibility history is immutable while current eligibility remains a
  fail-closed projection.
- Production work appends candidate-bound receipts without modifying the audit.
- Ready for scheduling is derived; it does not usurp PLAN or claim publication.
- Fresh runs and Misprints invalidate current eligibility without rewriting
  approval history.

Required lifecycle contracts:

1. Add explicit candidate identity and supersession lineage to projections.
2. Add action-level idempotency to Production Readiness transitions.
3. Add append-only candidate hold/release behavior.
4. Add edition, pairing, and rights-withdrawal retirement behavior.
5. Keep Signals separate from Data Health and out of candidate authority.

The case confirms the clearer future progression:

```text
Curator Lab
→ Approved Candidates
→ Production Readiness
→ PLAN
→ Published Editions
→ Held / Retired
```

It does not settle whether the compatibility shell keeps the name “Release
Desk.”

### Cumulative required-contract register after Case 3

| Contract | Origin | Required behavior | Needed again |
| --- | --- | --- | --- |
| Additive source promotion | Cases 1 and 2 | Create one derivative Idea from a selected authorized projection; preserve source authority and shared lineage | Cases 5 and 6 |
| Stable action idempotency | Cases 1–3 | Ambiguous retries return the original receipt instead of appending duplicate semantic actions | All mutation cases |
| Append-only correction chain | Cases 1–3 | Preserve original records; derive effective state from corrections and supersessions | Cases 4–6 |
| Immutable publication ledger | Cases 1–3 | Separate historical publication receipts from replaceable current public projections | Cases 4–6 |
| Dependency invalidation | Cases 1–3 | Source corrections mark derived candidates, Ideas, contributions, expressions, and projections stale or held | Cases 4–6 |
| Minimal authorized projection | Cases 1–3 | Send only selected content, required context, restrictions, readiness, and lineage across boundaries | All remaining cases |
| Fail-closed restrictive correction | Cases 1–3 | Remove unsafe or invalid current delivery before fallible widening or rebuild work | Case 4 |
| Candidate identity and supersession | Case 3 | Bind readiness to exact run/fingerprint/board/approval and record successor relationships | Cases 4 and 5 |
| Hold and release ledger | Case 3 | Pause scheduling without altering approval or readiness history | Case 5 |
| Retirement and rights withdrawal | Case 3 | Remove editions/pairings/assets from active use while preserving historical records | Cases 4 and 5 |
| Domain contribution intake | Case 2 | CREATE proposes; Fandom accepts, versions, publishes, corrects, or rejects | Case 5 |
| Domain-state transition ledger | Case 2 | Verified events produce explicit transitions; analytics and rumors cannot mutate public truth | Case 5 |
| Participation ledger | Case 2 | Preserve truthful participation meaning, privacy, withdrawal, aggregation, and abuse controls | Waiting Room-specific unless another case proves reuse |

## Case 4 — Misprint correction and cache rebuild

### Governing purpose

Misprints are both collectible artifacts and structured negative evidence.
Correction must improve future curation without deleting the thing Katie or a
visitor saved, laundering it into an ordinary result, or rewriting any audit,
approval, or publication that used it.

The governing flow is:

```text
Saved or observed artifact
→ immutable correction receipt
→ trusted review / effective correction status
→ append-only eligibility invalidation
→ corrected future audit projection
→ transient-cache rejection and rebuild
```

Already published editions follow a separate branch:

```text
Immutable publication manifest
→ append-only publication-correction receipt
→ explicit human-authored superseding edition
```

### Four independent states

| State | Meaning | May affect ordinary curation? |
| --- | --- | --- |
| Saved collectible | Someone kept the artifact | No |
| Legendary promotion | Katie or evidence marks exceptional value | No, not by itself |
| Misprint correction | The artifact is invalid ordinary evidence under a reason/scope | Yes |
| Legendary Misprint | A failed result is culturally valuable enough to preserve prominently | The correction still excludes it from ordinary curation |

Deleting, moving, recovering, or promoting the collectible must not review,
retract, or weaken the server correction.

### Case 4 contract summary

| ID | Action | Current result | Case-law result |
| --- | --- | --- | --- |
| C4.1 | Preserve a Misprint collectible and file correction evidence | Implemented as independent Collection artifact and correction receipt | Passes; partial cross-store completion needs a repair receipt |
| C4.2 | Review community-filed correction evidence | Implemented as inert pending review with append-only operator decision | Passes |
| C4.3 | Activate future exclusion by reason and scope | Implemented with deterministic receipt identity and scoped matching | Passes with known perceptual-identity limit |
| C4.4 | Invalidate current approved candidates | Implemented through immutable eligibility decision plus replaceable current projection | Passes |
| C4.5 | Rebuild future audit/curator projections | Active corrections filter later runs while frozen evidence remains visible and annotated | Passes core pedagogy |
| C4.6 | Reject and rebuild transient Daily Drop caches | Cached payloads revalidate current eligibility and are deleted when stale; manual rebuild also revalidates | Passes fail-closed serving; proactive rebuild inventory/receipt is incomplete |
| C4.7 | Correct an immutable published edition | Implemented as append-only publication-correction receipt without manifest rewrite | Passes preservation; public notice rendering and superseding edition are missing |
| C4.8 | Retract an incorrect correction | Implemented as reasoned append-only retraction | Passes; invalidated approvals intentionally remain invalid |
| C4.9 | Preserve Legendary Misprint value without teaching false ordinary truth | Implemented in Collection provenance and kept independent from server correction | Passes |

### C4.1 — Preserve a Misprint collectible and file correction evidence

| Contract field | Decision |
| --- | --- |
| Authority | Katie may file trusted operator correction immediately. Signed-in visitors may submit evidence for review but cannot activate it |
| Canonical record affected | Collection owns the saved artifact; Fandom curator ledger owns the immutable correction receipt |
| Input projection allowed | Candidate identity, source/query provenance, intended actor/Vibe, selected reason, optional actual identity, and source collection/grid/run identity |
| Mutation allowed | Append correction receipt and separately save/preserve the artifact. Neither operation edits the original search result or audit run |
| Privacy boundary | Public Collection may show safe artifact provenance. Operator identity, internal query diagnostics, and private notes remain private |
| Lineage / idempotency key | Action + source object + actor/Vibe + reason + principal + strongest candidate identity; concurrent retries converge on one receipt |
| Stale/conflict behavior | If correction succeeds but collectible persistence fails, correction remains authoritative and the UI reports partial completion. The reverse must not silently claim curation was corrected |
| Receipt/event produced | Misprint correction receipt plus independent Collection mutation receipt |
| Downstream effect | Trusted future-excluding reasons can invalidate eligibility and filter future curation; collectible remains available under its actual tier |
| Correction/reversal path | Append review/retraction decision to the correction; use normal Collection history for artifact changes |
| Current surface | Actor Preflight and Collection |
| Future surface | Curator Lab correction control plus Collection artifact view |

### C4.2 — Review community-filed correction evidence

| Contract field | Decision |
| --- | --- |
| Authority | Signed-in visitor submits; Katie or authorized curator approves/rejects |
| Canonical record affected | Immutable source correction receipt and append-only Misprint decision ledger |
| Input projection allowed | Candidate/source identity, proposed reason/scope, submitter-safe identity, prior decisions, and current effective status |
| Mutation allowed | Append one approval or rejection decision. Pending evidence is inert until approval |
| Privacy boundary | Anonymous submissions are rejected. Submitter identity and review notes remain operator-only unless separately summarized |
| Lineage / idempotency key | Source receipt ID + decision kind. An identical retry returns the authoritative decision |
| Stale/conflict behavior | Only pending feedback may be reviewed. A conflicting second decision is rejected rather than replacing the first |
| Receipt/event produced | Immutable review decision |
| Downstream effect | Approved evidence becomes active correction; rejected evidence remains preserved but inert |
| Correction/reversal path | An active approved correction may later receive a reasoned retraction; the review decision itself remains historical |
| Current surface | Actor Preflight review queue |
| Future surface | CDRAMA Moderation / Curator Lab review queue |

### C4.3 — Activate future exclusion by reason and scope

| Contract field | Decision |
| --- | --- |
| Authority | Trusted operator correction or operator-approved community evidence |
| Canonical record affected | Effective correction projection derived from immutable source and decision receipts |
| Input projection allowed | Correction reason taxonomy, canonical candidate identity, actor/Vibe context, current approval, and publication catalogs |
| Mutation allowed | Apply exclusion at global asset, actor identity, actor/Vibe, result-set, metadata, or diagnostic/local scope according to the reason contract |
| Privacy boundary | Only the minimum correction status and safe reason need leave the curator system |
| Lineage / idempotency key | Correction receipt ID and its deterministic candidate identity chain: exact digest, canonical upstream URL, then candidate ID |
| Stale/conflict behavior | Activation shares the publication compare-and-swap lock. Eligibility and manifests are strongly reread before consequences commit |
| Receipt/event produced | Effective activation is represented by the correction and decision receipts; affected eligibility/publication receipts are appended separately |
| Downstream effect | Matching current candidates are invalidated and matching evidence is excluded from ordinary future curation |
| Correction/reversal path | Reasoned retraction stops future exclusion. It does not delete the correction or restore decisions made while it was active |
| Current surface | Actor Preflight / Collection correction flow |
| Future surface | Curator Lab with scoped correction explanation |

Known limit: matching cannot yet reliably recognize unrelated rehosts, crops, or
recompressions that share neither digest nor canonical upstream identity.
Perceptual identity requires a future explicit contract.

### C4.4 — Invalidate current approved candidates

| Contract field | Decision |
| --- | --- |
| Authority | Fandom derives invalidation from active correction evidence |
| Canonical record affected | Immutable eligibility-decision history; replaceable current eligibility projection |
| Input projection allowed | Active scoped correction and strongly validated current approved board |
| Mutation allowed | Append `invalidated_by_misprint` decision and repoint current eligibility to ineligible. Never edit the approval |
| Privacy boundary | Release/PLAN projections need candidate invalidation and bounded reason, not the full correction evidence |
| Lineage / idempotency key | Candidate decision identity + correction receipt ID |
| Stale/conflict behavior | If no current approved board matches, no candidate is invalidated. Global/actor scopes evaluate every affected pair |
| Receipt/event produced | Immutable invalidating eligibility decision |
| Downstream effect | Candidate leaves Approved Candidates, Production Readiness, backfill publication, and schedule eligibility |
| Correction/reversal path | Retraction does not restore approval. A fresh corrected audit and explicit approval create a new candidate |
| Current surface | Derived effect across Actor Preflight and Release Desk |
| Future surface | Curator Lab receipt with visible downstream-impact inventory |

### C4.5 — Rebuild future audit and curator projections

| Contract field | Decision |
| --- | --- |
| Authority | Fandom curation machinery derives; Katie reviews and approves a new run |
| Canonical record affected | New immutable audit run and any later approval; old runs remain byte-for-byte unchanged |
| Input projection allowed | Active correction ledger, current actor/Vibe contracts, source evidence, and retired teaching signals |
| Mutation allowed | Filter corrected candidates from ordinary proposals while retaining them in frozen display evidence with correction receipt and `curator_misprint` reason |
| Privacy boundary | Raw correction evidence remains operator-only. Public output receives only a newly approved board, never the rejected training candidates |
| Lineage / idempotency key | New audit run ID + active correction set/hash + current curation contract versions |
| Stale/conflict behavior | If correction state changes during the run, the resulting contract fingerprint becomes stale and cannot be approved as current |
| Receipt/event produced | New audit run and later explicit approval/eligibility receipts |
| Downstream effect | Curator learns what to exclude without being taught that Legendary Misprint identity is valid ordinary evidence |
| Correction/reversal path | Retracted corrections stop affecting later runs; previous corrected runs and decisions remain historical |
| Current surface | Actor Preflight rerun |
| Future surface | Curator Lab rebuild/review |

### C4.6 — Reject and rebuild transient Daily Drop caches

| Contract field | Decision |
| --- | --- |
| Authority | Fandom serving code validates; operator may request manual rebuild |
| Canonical record affected | None. Daily cache entries and locks are replaceable projections |
| Input projection allowed | Cached actor/Vibe identity, strongly validated current eligibility, current actor-pack fingerprint, approved cohort, and immutable publication manifest when one exists |
| Mutation allowed | Delete stale transient cache, build a new candidate, revalidate before and after write, or return no acceptable result |
| Privacy boundary | Cache responses exclude audit, eligibility, internal identity profile, and recent-use internals |
| Lineage / idempotency key | Cache version + Shanghai publication date. Build lock serializes ordinary builders |
| Stale/conflict behavior | Every current-cache read rechecks eligibility. In-flight builds are discarded if approval changes. Invalid cache is deleted before fallback/rebuild |
| Receipt/event produced | Current implementation returns an operational response but has no durable cache-rebuild/invalidation receipt or affected-key inventory |
| Downstream effect | Invalid transient content stops serving; a valid eligible payload may replace it |
| Correction/reversal path | Rebuild from current truth. Never edit correction or eligibility history to make an old cache valid |
| Current surface | Automatic Star of Day serving plus secret-protected manual rebuild endpoint |
| Future surface | Diagnostics → Derived State / Cache Health, with curator-facing impact summary only |

An immutable publication manifest outranks a transient cache. If the correction
arrives after publication, the system preserves that manifest and follows C4.7
instead of pretending the edition never shipped.

### C4.7 — Correct an immutable published edition

| Contract field | Decision |
| --- | --- |
| Authority | Trusted correction activates consequences; Katie authorizes any public explanation or replacement edition |
| Canonical record affected | Immutable publication manifest plus append-only publication-correction ledger |
| Input projection allowed | Manifest date/ID, original board hash, correction receipt, reason, and affected card positions |
| Mutation allowed | Append correction receipt marked `requires_explicit_supersession`. Do not alter manifest, board hash, or original receipt |
| Privacy boundary | Public notice uses safe authored language. Internal correction evidence and rights details remain private |
| Lineage / idempotency key | Publication manifest identity + correction receipt ID + affected positions |
| Stale/conflict behavior | Publication and correction activation serialize. If publication wins, correction must append its notice before returning |
| Receipt/event produced | Immutable publication-correction receipt |
| Downstream effect | Historical edition remains auditable; future derivatives are held pending explicit treatment |
| Correction/reversal path | Publish a separately authored successor linked to the original, or append a reasoned retraction/interpretation. Never silently swap the old edition |
| Current surface | Durable backend correction ledger; public rendering is not implemented |
| Future surface | Published Editions → Corrections / Superseding Editions |

### C4.8 — Retract an incorrect correction

| Contract field | Decision |
| --- | --- |
| Authority | Katie or authorized curator |
| Canonical record affected | Append-only Misprint decision ledger |
| Input projection allowed | Active correction, source receipt, all prior decisions, downstream impact summary, and required retraction note |
| Mutation allowed | Append one reasoned retraction; do not delete or revise source/review receipts |
| Privacy boundary | Internal reason can remain private; public interpretation is separately authored if the correction had public effects |
| Lineage / idempotency key | Source receipt ID + retraction kind |
| Stale/conflict behavior | Only an active correction may be retracted. Conflicting repeated decisions fail |
| Receipt/event produced | Immutable retraction decision |
| Downstream effect | Future runs stop applying the exclusion |
| Correction/reversal path | Invalidated approvals stay invalid. Reconsideration requires fresh audit and approval; published correction notices require explicit interpretation/supersession |
| Current surface | Actor Preflight |
| Future surface | Curator Lab correction history |

### C4.9 — Preserve Legendary Misprint value

| Contract field | Decision |
| --- | --- |
| Authority | Katie confirms Legendary Misprint promotion; visitor saves/exports remain audience evidence only |
| Canonical record affected | Collection artifact and provenance, independent engagement events, and unchanged curator correction ledger |
| Input projection allowed | Intended identity, unexpected identity, source provenance, saved/export behavior, and active correction status |
| Mutation allowed | Promote or demote collectible presentation, move between Collection lenses, export, or recover media. None may alter correction status |
| Privacy boundary | Public artifact may explain the mismatch without exposing private curator notes or visitor identity |
| Lineage / idempotency key | Stable Collection artifact/local identity + promotion timestamp/mutation identity; correction retains its separate receipt ID |
| Stale/conflict behavior | Cross-device Collection sync preserves structured Misprint and Legendary Misprint provenance. Correction lookup remains server-authoritative |
| Receipt/event produced | Collection mutation and engagement events; no curator-learning receipt is inferred |
| Downstream effect | Artifact can teach the culture of the project while remaining excluded from standard Vibe Atlas pools |
| Correction/reversal path | Remove Legendary promotion without retracting Misprint; retract Misprint without erasing collectible history |
| Current surface | Collection and Grid Builder Legendary Misprint lens |
| Future surface | Collection plus CONNECT signals; Curator Lab consumes only explicit correction/teaching receipts |

### Case 4 verdict

**Result: The correction constitution passes. Current-state repair is strong;
operational rebuild and public supersession remain incomplete.**

Implemented strengths:

- Correction receipts and decisions are deterministic, append-only, and
  independently reviewable.
- Frozen audits, approvals, manifests, saved artifacts, and Legendary promotion
  remain historically intact.
- Active corrections invalidate current eligibility and are applied to future
  curator runs.
- Transient Daily Drop caches revalidate current approval before serving and
  before/after rebuilding.
- Publication and correction activation serialize, preventing an in-flight
  edition from escaping its correction notice.
- Retraction stops future exclusion without resurrecting a now-untrustworthy
  approval.

Required contracts:

1. Durable derived-state rebuild receipts and affected-key inventories.
2. Repair workflow for partial correction/collectible persistence.
3. Perceptual identity for crops, recompressions, and unrelated rehosts.
4. Public rendering of publication-correction status.
5. Explicit superseding-edition publication and lineage.
6. Dependency-impact projection for Ideas, handoffs, scheduled placements, and
   platform expressions that used corrected evidence.

No constitutional amendment is required. Case 4 confirms:

```text
Evidence is durable.
Effective correction state is derived.
Eligibility is a replaceable projection with immutable decision history.
Cache is disposable.
Publication history is append-only.
```

### Cumulative required-contract register after Case 4

| Contract | Origin | Required behavior | Needed again |
| --- | --- | --- | --- |
| Additive source promotion | Cases 1 and 2 | Create one derivative Idea from a selected authorized projection; preserve source authority and shared lineage | Cases 5 and 6 |
| Stable action idempotency | Cases 1–4 | Ambiguous retries return the original receipt instead of appending duplicate semantic actions | Cases 5 and 6 |
| Append-only correction chain | Cases 1–4 | Preserve original records; derive effective state from corrections and supersessions | Cases 5 and 6 |
| Immutable publication ledger | Cases 1–4 | Separate historical publication receipts from replaceable current public projections | Cases 5 and 6 |
| Dependency invalidation | Cases 1–4 | Source corrections mark candidates, Ideas, handoffs, schedules, expressions, and projections stale or held | Cases 5 and 6 |
| Minimal authorized projection | Cases 1–4 | Send only selected content, required context, restrictions, readiness, and lineage across boundaries | Cases 5 and 6 |
| Fail-closed restrictive correction | Cases 1–4 | Remove unsafe or invalid current delivery before fallible widening or rebuild work | Cases 5 and 6 |
| Candidate identity and supersession | Cases 3 and 4 | Bind readiness to exact edition and record successor relationships | Case 5 |
| Hold and release ledger | Case 3 | Pause scheduling without altering approval or readiness history | Case 5 |
| Retirement and rights withdrawal | Cases 3 and 4 | Remove editions/pairings/assets from active use while preserving historical records | Case 5 |
| Derived-state rebuild receipt | Case 4 | Record correction impact, affected projections/cache keys, rebuild result, and unresolved failures | Cases 5 and 6 |
| Publication correction and superseding edition | Case 4 | Preserve original manifest; visibly interpret, replace, or retire through explicit linked action | Case 5 |
| Perceptual asset identity | Case 4 | Match materially identical crops/recompressions/rehosts without collapsing distinct variants | Vibe Atlas-specific unless another case proves reuse |
| Domain contribution intake | Case 2 | CREATE proposes; Fandom accepts, versions, publishes, corrects, or rejects | Case 5 |
| Domain-state transition ledger | Case 2 | Verified events produce explicit transitions; analytics and rumors cannot mutate public truth | Case 5 |
| Participation ledger | Case 2 | Preserve truthful participation meaning, privacy, withdrawal, aggregation, and abuse controls | Waiting Room-specific unless another case proves reuse |

## Unresolved-decisions register

| Decision | Why unresolved | Evidence needed | Decision point |
| --- | --- | --- | --- |
| Physical host of the CDRAMA Lens | Fandom, Creator OS, or a shared shell could all render the conceptual Lens | Results of all six cases, required projections, privacy boundaries, failure isolation, and duplication cost | After Case 6 passes |
| Domain-native scheduling mechanism | Different outputs need calendar, boundary, event, manual, or immediate triggers | Cases 1, 2, and 5 | Before paper cockpit |
| Final Release Desk name and decomposition | Current vocabulary mixes approved candidates, production readiness, scheduling, receipts, and handoff | Cases 3–5 plus current-control migration map | Before implementation planning |
| Posts DB scope | Non-social expressions and domain state changes may make “Post” dishonest | Cases 2, 5, and 6 | Before any schema proposal |
| Projection transport | The required data is known conceptually, but API ownership and failure behavior are not | All six contract matrices | After physical-host decision |

## Architecture pass conditions

A case passes only when every action has:

1. One authoritative decision-maker.
2. One canonical record, or an explicit additive derivative.
3. A minimal authorized projection.
4. No implicit private-content transfer.
5. Durable lineage.
6. Defined stale/conflict behavior.
7. Idempotent retries where retry is possible.
8. A receipt for every meaningful state change.
9. No false declaration of publication.
10. No analytics process silently rewriting editorial truth.
11. A correction/reversal path that preserves history.

## Gate after the six cases

When all six cases pass:

1. Decide the CDRAMA Lens's physical host.
2. Map every current Fandom operator control to its future surface.
3. Draw a paper cockpit using real records.
4. Operate several representative outputs manually through that cockpit.
5. Identify repeated friction.
6. Evaluate the smallest implementation justified by that friction.

Until then: no UI, schema, or migration work.
