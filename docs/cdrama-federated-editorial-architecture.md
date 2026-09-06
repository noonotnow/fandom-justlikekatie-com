# CDRAMA Federated Editorial Architecture — Constitution & Case Law

**Status:** Constitution frozen; all six cases evaluated; Creator OS Lens
placement and capability map decided on 2026-09-06
**Scope:** Fandom Vibes, the CDRAMA Lens, CAPTURE, CREATE, PLAN, CONNECT,
EXECUTE/PUBLISH contract boundaries, domain operations, and diagnostics
**Implementation status:** Planning contract only. This document does not
authorize UI, schema, or migration work.

## Purpose

This document is the durable decision record for the federated CDRAMA editorial
system. It preserves the constitutional decisions, tests them against real
workflows, records the physical-host and capability-placement rulings, and
defines the gate before interface work begins.

The system is federated because a useful workspace may display records from
several products without absorbing their authority. Fandom retains records whose
meaning depends on fandom-specific rules. Creator OS develops communicative
expressions. PLAN decides placement and authorization. EXECUTE and PUBLISH
describe authority handoffs for discrete attempts and public artifacts. CONNECT
receives those outcomes, verifies them, and returns non-destructive learning.

## The 14 locked decisions

1. **The system is federated, not centralized.** A unified workspace may compose
   several authorized projections without becoming the canonical store for all
   records it displays.
2. **Domain products retain domain truth.** First-watch entries, sealed evidence,
   public clock-ins, canon evidence, moderation decisions, and public domain
   state remain governed by Fandom rules.
3. **Visibility does not grant mutation authority.** A cockpit may display a
   Fandom record without permission to alter it.
4. **Capture precedes classification.** The active Lens organizes domain
   material before any deliverable commitment. Some records remain complete in
   CAPTURE or their domain protocol forever; only selected material is promoted.
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
    PLAN owns priority, placement, schedule, and authorization; EXECUTE/PUBLISH
    receipts mark the handoff; CONNECT owns verification, reconciliation,
    public-outcome projection, and measurement.
11. **Planning intent is not publication truth.** Scheduling never invents a
    native ID, URL, timestamp, metric, or published state.
12. **Domain-native and external publication are separate branches.** Fandom may
    publish its own authoritative projection; optional social derivatives travel
    through CREATE → PLAN → an EXECUTE/PUBLISH boundary → CONNECT.
13. **Evidence, current state, and cache are separate.** Immutable audience and
    curator evidence derives a replaceable curation projection; caches serve that
    projection and never become historical truth.
14. **Corrections are additive and fail closed.** Completed actions are
    superseded, invalidated, held, retracted, or reinterpreted through durable
    receipts. Historical evidence is never rewritten, and uncertain privacy or
    publication state reveals nothing.

## Product and authority map

```text
ACTIVE LENS
Selects relevant context, tools, projections, and actions
├──► CAPTURE
│    Preserve or file material without requiring a future artifact
│    ├──► owner-native record may be complete here
│    └──► selected material needing shape ─────────┐
└──► direct post-shaped intent ───────────────────┤
                                                  ▼
                                                CREATE
                                      Develop → Shape → Compose
                                                  │ expression ready
                                                  ▼
PLAN
Select → Prioritize → Sequence → Schedule → Authorize
        │ authorized execution request
        ▼
[EXECUTE / PUBLISH contract boundary]
A discrete attempt, result, or rendered public artifact crosses authority
        │ receipt, exception, or native-result evidence
        ▼
CONNECT
Verify → Reconcile → Project public truth → Measure → Learn → Recommend
        │
        └──► new Capture, CREATE input, or reviewed Series learning
```

Handoffs change authority over lifecycle fields, not object identity. References
do not create copies. Analytics may recommend but may not silently mutate
creative or editorial truth.

This is an authority path, not a mandatory funnel. Domain filings may end with
their canonical owner, Captures may remain Captures forever, and an inherently
post-shaped intent may begin directly in CREATE without manufacturing an
upstream Capture.

## CDRAMA Lens product map

```text
CDRAMA Lens
├── CAPTURE
│   └── CDRAMA-organized sources, reactions, journals, evidence, and signals;
│       many records end their lifecycle here
├── CREATE
│   └── Ideas, Series, Kits/Treatments, contributions, and expressions
├── PLAN
│   └── Priorities, release conditions, external placement, and authorization
└── CONNECT
    └── Publication truth, reconciliation, metrics, audience evidence,
        learning, and recommendations
```

- A **Lens** organizes context and selects the modules, engines, projections,
  and actions visible in each Creator OS lifecycle surface.
- **CAPTURE** accepts and routes domain material without implying that it will
  become a creative artifact.
- A **Kit or Treatment** supplies rules and creative grammar.
- A **Series** supplies continuity.
- **Source material** supplies evidence and inspiration.
- **CREATE** begins only after explicit promotion into a shaped creative object.
- **EXECUTE and PUBLISH** are handoff/action boundaries, not surfaces.

The Lens is physically hosted by Creator OS. Fandom and other domain products
remain authoritative through narrow projections, explicit commands, and linked
specialist surfaces.

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
        └── external composition → CREATE → PLAN
                                   → [EXECUTE / PUBLISH boundary] → CONNECT
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
| Platform Expression | Rednote post, Instagram carousel, Reel, Short, newsletter section | CREATE → PLAN → EXECUTE/PUBLISH boundary → CONNECT |
| Domain Contribution | Canon evidence, FAQ expansion, timeline entry, public dispatch proposal | CREATE may propose; Fandom accepts or rejects |
| Domain State Change | Evidence reveal, Waiting Room state, contribution approval | Fandom validates and authorizes |
| Domain-native publication | First-Watch public snapshot, Daily Drop edition | Fandom production and publication contract |

Fandom-native publication may be calendar-triggered, boundary-triggered,
event-triggered, manually authorized, or immediate. External platform placement
belongs to PLAN regardless of the domain trigger.

## Shared expression lifecycle and handoff boundaries

| Module or boundary | Fields governed or represented |
| --- | --- |
| CAPTURE | Lens-organized domain intake; records may remain complete here or with their domain owner |
| CREATE | Concept, copy, media, format, creative lineage, creative readiness |
| PLAN | Priority, platform placement, schedule, authorization |
| EXECUTE boundary | Attempt, native response, execution time, retry/idempotency history |
| PUBLISH boundary | Platform-specific rendered artifact, available native identity, and claimed public outcome |
| CONNECT | Verified publication projection, canonical receipt, metrics, reconciliation |
| CREATE / Series | Human-reviewed interpretation and next creative decision |

One concrete social expression retains one lineage while format, media,
platform, and public state change. Boundary artifacts represent discrete actions
or events; they do not become lifecycle modules or duplicate the underlying
Idea.

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

## Case 5 — Daily Drop with optional external derivatives

### Governing purpose

A Daily Drop is first a Fandom-native edition. Rednote, Instagram, Weibo,
YouTube, or another channel may receive a related expression, but none is
required to make the Fandom edition real.

```text
Approved exact edition
→ Fandom publication manifest
   ├── no external derivative
   ├── Rednote expression
   ├── Instagram expression
   ├── YouTube expression
   └── other explicitly supported expression
```

Each external branch follows its own lifecycle:

```text
Fandom edition projection
→ CREATE expression
→ PLAN placement and authorization
→ EXECUTE native attempt
→ CONNECT verification and reconciliation
```

Failure on one branch does not roll back Fandom publication or another
platform. “Optional” applies both to the existence of derivatives and to every
individual channel.

### Edition and expression identity

The canonical edition identity is:

```text
Fandom manifest ID
+ publication date
+ board hash
+ actor × Vibe identity
+ exact ordered candidate IDs
```

An external expression has its own identity:

```text
expression ID
+ source manifest ID
+ source board hash
+ platform
+ treatment / format
+ source version
```

The expression may transform copy, crop, pacing, sequencing, and argument for
its channel. It may not silently replace the approved nine, claim a different
canonical Vibe, or become the sole record that the Fandom edition exists.

### Case 5 contract summary

| ID | Action | Current result | Case-law result |
| --- | --- | --- | --- |
| C5.1 | Publish one canonical Fandom Daily Drop | Implemented as an immutable nine-card manifest with permanent MEDIA references | Passes |
| C5.2 | Choose zero or more derivative destinations | Saved-grid handoff supports Rednote, Weibo, and Instagram lists; canonical-edition selection is not implemented | Passes constitution; implementation contract incomplete |
| C5.3 | Hand an edition projection to CREATE | Current direct Workstation handoff originates from a saved grid, not the immutable publication manifest | Missing canonical publication-package handoff |
| C5.4 | Compose platform-specific expressions | Workstation owns draft development after handoff | Partial; expression-to-edition lineage and YouTube format are missing |
| C5.5 | Place and authorize an expression in PLAN | PLAN owns status and schedule with stale-write checks | Passes for represented Posts; general non-social/output representation remains unresolved |
| C5.6 | Execute and reconcile Rednote publication | Implemented operator-scheduled and reconciled states with idempotency and fail-closed availability | Passes Rednote boundary; Case 6 tests it fully |
| C5.7 | Record external publication receipts | Manual Rednote, Weibo, and Instagram receipts attach one URL per channel to a manifest | Partial; receipt lacks expression/version/attempt lineage |
| C5.8 | Survive external failure independently | Fandom manifest and channel receipts are separate stores/lifecycles | Passes architecture; durable per-expression failure receipts remain incomplete |
| C5.9 | Correct or supersede an edition with derivatives | Publication correction exists, but derivative-impact projection and successor propagation do not | Missing cross-system correction contract |
| C5.10 | Publish no derivative | No external receipt is required for Fandom publication | Passes; UI must not imply incompleteness |

### C5.1 — Publish one canonical Fandom Daily Drop

| Contract field | Decision |
| --- | --- |
| Authority | Fandom release authority publishes after current approval and Production Readiness permit it |
| Canonical record affected | Immutable Fandom Daily Drop publication manifest |
| Input projection allowed | Exact approved candidate, current eligibility, nine verified MEDIA assets, actor/Vibe metadata, provenance, publication date, and readiness |
| Mutation allowed | Create one manifest for the publication date using `onlyIfNew`; update derived actor/date indexes separately |
| Privacy boundary | Public manifest projection includes the edition and safe provenance. Raw curator evidence, internal rights notes, and production receipts remain private |
| Lineage / idempotency key | `vibe-atlas:daily-drop:{date}` plus manifest ID derived from date and board hash |
| Stale/conflict behavior | Eligibility is revalidated inside the shared correction/publication lock. A different board already occupying the date wins and causes conflict |
| Receipt/event produced | Immutable publication manifest with exact board hash, ordered source candidate IDs, permanent asset references, and published timestamp |
| Downstream effect | Fandom can serve/archive the edition and optionally offer a minimal projection for external expression work |
| Correction/reversal path | Append publication correction, rights withdrawal, hold, or superseding-edition receipt. Never rewrite the manifest |
| Current surface | Automatic Daily Drop publication and Fandom archive |
| Future surface | Fandom Published Editions within the CDRAMA Lens |

### C5.2 — Choose zero or more derivative destinations

| Contract field | Decision |
| --- | --- |
| Authority | Katie in CREATE chooses whether the edition needs an external expression and which channels deserve one |
| Canonical record affected | Optional derivative-intent record linked to the edition; Fandom manifest remains unchanged |
| Input projection allowed | Minimal edition projection, Series context, prior expressions, audience questions, platform strategy, and current channel constraints |
| Mutation allowed | Select or omit destinations independently. Blank platform slots are valid |
| Privacy boundary | CREATE may receive approved assets and safe editorial context, not private curator telemetry or unrelated audience identities |
| Lineage / idempotency key | Source manifest ID + derivative-intent ID; each platform expression receives a distinct identity |
| Stale/conflict behavior | Destination choice against a corrected, withdrawn, or superseded source becomes stale before composition/authorization |
| Receipt/event produced | Derivative-intent receipt, including explicit selected destinations. Absence is not an error |
| Downstream effect | Opens only the selected CREATE work; does not schedule or publish anything |
| Correction/reversal path | Add/remove a planned destination before execution; after execution, preserve its receipt and use correction/retraction rules |
| Current surface | Saved-grid handoff accepts Rednote, Weibo, and Instagram destinations |
| Future surface | CDRAMA Lens → Make / Adapt, with “no external expression” as an ordinary outcome |

Current support does not include YouTube. Adding Shorts, long-form video, or a
community post requires a platform/format contract rather than treating
“YouTube” as one interchangeable slot.

### C5.3 — Hand an edition projection to CREATE

| Contract field | Decision |
| --- | --- |
| Authority | Fandom authorizes the projection; CREATE accepts a derivative source without acquiring Fandom authority |
| Canonical record affected | Fandom handoff receipt and CREATE source-link record |
| Input projection allowed | Manifest ID, board hash, actor/Vibe, exact ordered assets, hero position, safe copy/credits, provenance/rights status, constraints, correction status, and source version |
| Mutation allowed | CREATE creates or updates a linked derivative source/draft. It may not mutate the manifest, exact-board approval, or Fandom publication state |
| Privacy boundary | Only cleared assets and minimum necessary provenance cross the boundary. Private audit evidence and sensitive rights notes remain in Fandom |
| Lineage / idempotency key | `fandom/publication/{manifestId}/{outputId}/{platform}/{format}` with source version and expected prior version |
| Stale/conflict behavior | A changed source version, correction, rights withdrawal, or operator-diverged CREATE draft requires explicit refresh/merge; no silent overwrite |
| Receipt/event produced | Durable handoff receipt containing derivative ID, source version, disposition, media-sync state, and warnings |
| Downstream effect | CREATE can compose platform-specific expressions while Fandom remains independently published |
| Correction/reversal path | Append stale/withdrawn/superseded source notice to the handoff; preserve prior drafts and handoff history |
| Current surface | **Not implemented for canonical editions.** Existing direct handoff uses saved Collection grids and stable `fandom/direct/grid/...` identity |
| Future surface | Published Edition → Create Expression |

The saved-grid handoff is useful prior art for versioning, HMAC authorization,
durable media, idempotency, and operator-diverged drafts. It must not be
misrepresented as publication-manifest lineage.

### C5.4 — Compose platform-specific expressions

| Contract field | Decision |
| --- | --- |
| Authority | CREATE owns derivative composition; Katie approves creative content |
| Canonical record affected | Platform Expression draft/version history in Creator OS |
| Input projection allowed | Authorized edition projection, Series memory, selected editorial angle, treatment, and platform constraints |
| Mutation allowed | Change caption, title, hook, crop, pacing, asset subset/order where the treatment permits it, and platform metadata. It may not redefine the Fandom edition |
| Privacy boundary | Draft content remains private until PLAN/EXECUTE authorization. Platform credentials never enter Fandom or the draft payload |
| Lineage / idempotency key | Expression ID + source manifest/version + platform + format + draft version |
| Stale/conflict behavior | Source correction or supersession marks the expression stale/held. Operator-diverged drafts require explicit merge rather than source overwrite |
| Receipt/event produced | Draft creation/update receipt with source lineage and divergence status |
| Downstream effect | Approved expression may enter PLAN; other selected channels can remain blank or unfinished |
| Correction/reversal path | Create a new expression version, hold it, retire it, or link a successor. Never rewrite native publication receipts |
| Current surface | Workstation direct drafts for saved grids |
| Future surface | Embedded CREATE inside the CDRAMA Lens |

### C5.5 — Place and authorize an expression in PLAN

| Contract field | Decision |
| --- | --- |
| Authority | PLAN owns platform placement, priority, schedule, and authorization for external expressions |
| Canonical record affected | PLAN placement/schedule record linked to the expression and source edition |
| Input projection allowed | Approved expression, target platform, required assets/copy, constraints, readiness, correction status, and source lineage |
| Mutation allowed | Set sequence, schedule, status, and authorization. PLAN may not alter the source edition or silently edit expression content |
| Privacy boundary | PLAN receives publication-ready materials and constraints, not raw Fandom audits or platform credentials |
| Lineage / idempotency key | PLAN record ID + expression version + expected PLAN version |
| Stale/conflict behavior | Notion/PLAN edits use expected versions. Once native operator scheduling is recorded, schedule/status lock pending reconciliation |
| Receipt/event produced | Placement and scheduling-intent receipts |
| Downstream effect | Authorized expression becomes eligible for EXECUTE on its channel |
| Correction/reversal path | Unschedule or hold before execution; after attempt, preserve execution history and reconcile through CONNECT |
| Current surface | PLAN Posts and Rednote execution integration |
| Future surface | PLAN with explicit expression and source-edition lineage |

PLAN governs external placement only. The Fandom-native Daily Drop publication
does not become a PLAN-owned record merely because derivatives exist.

### C5.6 — Execute and reconcile Rednote publication

| Contract field | Decision |
| --- | --- |
| Authority | EXECUTE/XHS integration performs the native action; CONNECT verifies the result |
| Canonical record affected | Native execution receipt and reconciled external-publication state |
| Input projection allowed | Authorized PLAN post ID/version, timezone-bearing schedule, approved assets/copy, and platform-specific credentials held by the executor |
| Mutation allowed | Record operator scheduling, native attempt, and reconciliation. It may not fabricate publication success in PLAN |
| Privacy boundary | Integration secret and platform credentials stay server-side. Fandom receives at most safe receipt projection |
| Lineage / idempotency key | PLAN post ID + expected Notion version/schedule + `Idempotency-Key` |
| Stale/conflict behavior | Schedule mismatch, stale PLAN version, unavailable execution state, or duplicate conflicting request fails closed |
| Receipt/event produced | Operator-scheduled receipt, then reconciled native ID/URL/timestamps through the executor contract |
| Downstream effect | PLAN/CONNECT may truthfully show Published only after reconciliation |
| Correction/reversal path | Append failure, cancellation, deletion, replacement, or corrected-post receipt according to platform capability |
| Current surface | PLAN → XHS integration |
| Future surface | Same lifecycle, surfaced in the CDRAMA Lens without relocating authority |

Case 6 examines this path in full. Instagram, Weibo, and YouTube do not inherit
Rednote’s execution guarantees merely because they can be named as destinations.

### C5.7 — Record an external publication receipt

| Contract field | Decision |
| --- | --- |
| Authority | CONNECT/integration records verified native facts; a trusted operator may enter a manual receipt |
| Canonical record affected | Append-only external publication ledger linked to both expression and Fandom edition |
| Input projection allowed | Native platform, account, post ID/URL, published timestamp, expression version, source manifest ID/board hash, and verification method |
| Mutation allowed | Append or idempotently replay a verified receipt. It may not change the Fandom manifest or mark another channel published |
| Privacy boundary | Public URL and safe account identity may be shown. Credentials, private drafts, and internal failure payloads remain private |
| Lineage / idempotency key | Platform + native account/post ID, with expression ID/version and source manifest ID |
| Stale/conflict behavior | Conflicting URL/native identity for the same receipt key requires reconciliation rather than overwrite |
| Receipt/event produced | Verified or manual external-publication receipt |
| Downstream effect | CONNECT can measure the expression and the Release Desk can show optional derivative coverage |
| Correction/reversal path | Append corrected URL, deletion, retraction, or successor receipt; preserve the original publication fact |
| Current surface | Release Desk manually records one Rednote, Weibo, or Instagram URL per Fandom publication date |
| Future surface | CONNECT-owned publication ledger projected into Published Editions |

The current receipt proves that a channel URL was attached to a manifest. It
does not prove which Workstation draft/version produced it, which native account
published it, or whether a later verification reconciled the result.

### C5.8 — Survive external publication failure independently

| Contract field | Decision |
| --- | --- |
| Authority | EXECUTE reports failure; PLAN decides retry/reschedule; Fandom retains its own publication |
| Canonical record affected | External attempt/failure ledger and PLAN exception state only |
| Input projection allowed | Expression and placement identity, attempt metadata, safe error classification, retry policy, and source correction state |
| Mutation allowed | Record failure, pending receipt, timeout, retry, abandonment, or manual-reconciliation requirement |
| Privacy boundary | Platform error details and credentials remain within EXECUTE/CONNECT; safe status may project to PLAN/Fandom |
| Lineage / idempotency key | Execution request/attempt ID linked to expression and placement |
| Stale/conflict behavior | Unknown outcome remains pending/unavailable, never success-shaped. Retry must use platform-safe idempotency or explicit reconciliation |
| Receipt/event produced | Attempt/failure/timeout receipt |
| Downstream effect | Only the affected derivative is blocked. Fandom edition and other channel expressions remain valid |
| Correction/reversal path | Reconcile late success, retry as a linked attempt, reschedule, or abandon. Do not roll back Fandom publication |
| Current surface | Rednote path exposes pending/reconciled/unavailable; other channels rely on manual receipts |
| Future surface | CONNECT exception queue rendering EXECUTE receipts |

### C5.9 — Correct or supersede an edition with derivatives

| Contract field | Decision |
| --- | --- |
| Authority | Fandom corrects or supersedes the canonical edition; CREATE/PLAN/CONNECT govern their dependent records |
| Canonical record affected | Fandom correction/supersession ledger plus dependency-impact receipts for every expression, placement, attempt, and external publication |
| Input projection allowed | Source manifest and correction, dependency graph, derivative/publication states, rights constraints, and successor edition if any |
| Mutation allowed | Mark dependent drafts stale, hold unexecuted placements, block pending execution, and append review-required notices to already published derivatives |
| Privacy boundary | Each surface receives only the correction facts necessary for safe action. Public language is authored separately per surface |
| Lineage / idempotency key | Source correction/supersession ID + dependent object ID |
| Stale/conflict behavior | Fail closed for unexecuted derivatives. Already published external posts remain historical facts and require platform-specific review |
| Receipt/event produced | Dependency-impact receipt per affected object and explicit successor links where created |
| Downstream effect | No corrected source silently leaves stale derivatives scheduled or presented as current |
| Correction/reversal path | Reevaluate after correction retraction; do not automatically restore invalidated approval or external placement |
| Current surface | Publication correction exists in Fandom; cross-system propagation is not implemented |
| Future surface | Published Edition impact review spanning Fandom, CREATE, PLAN, EXECUTE/PUBLISH receipts, and CONNECT |

### C5.10 — Publish no derivative

| Contract field | Decision |
| --- | --- |
| Authority | Katie decides that the Fandom-native edition is sufficient |
| Canonical record affected | Optional explicit “no derivative planned” editorial decision, if useful; no platform record is required |
| Input projection allowed | Edition, Series strategy, recent channel activity, performance learning, and available creative capacity |
| Mutation allowed | Record intentional omission or do nothing. No placeholder Posts are created |
| Privacy boundary | Private rationale need not be public |
| Lineage / idempotency key | Source manifest ID + optional omission-decision ID |
| Stale/conflict behavior | Later audience evidence may inspire a new derivative without making the earlier omission wrong |
| Receipt/event produced | Optional editorial decision, not a publication receipt |
| Downstream effect | Fandom edition remains complete; no external work is considered blocked or overdue |
| Correction/reversal path | Create a later expression with the same source manifest lineage |
| Current surface | Implicit: absence of channel receipts |
| Future surface | Explicit neutral state: “No external adaptation planned” |

### Case 5 verdict

**Result: The separation of native edition and optional derivatives passes.
Current implementation proves native publication and partial distribution
receipts, but not a complete federated derivative lifecycle.**

Implemented strengths:

- The Fandom Daily Drop manifest is immutable, exact-board-bound, permanent,
  and independently publishable.
- Derived indexes may fail without changing publication truth.
- Existing saved-grid Workstation handoff demonstrates durable source versions,
  expected-version conflict handling, idempotency, minimal receipts, and
  operator-diverged draft behavior.
- PLAN owns schedule/status and rejects stale writes.
- Rednote distinguishes scheduled intent, pending receipt, reconciled
  publication, and unavailable state.
- Manual external receipts are tied to an existing manifest and do not create
  Fandom publication retroactively.

Required contracts:

1. Versioned publication-manifest → CREATE handoff.
2. First-class expression identity linking platform/format/draft version to the
   source edition.
3. Destination contracts beyond Rednote, including separate YouTube formats.
4. Verified external receipts with native account/post and expression lineage.
5. Durable per-expression execution failure/retry receipts.
6. Dependency-impact propagation for correction, rights withdrawal, and
   supersession.
7. Public/editorial display that treats zero derivatives as complete, not
   missing.

No constitutional amendment is required. The case confirms:

```text
Fandom publication is canonical and sufficient.
External expressions are optional derivatives.
PLAN governs their placement, not the source edition.
Each channel succeeds, fails, corrects, and measures independently.
```

### Cumulative required-contract register after Case 5

| Contract | Origin | Required behavior | Needed again |
| --- | --- | --- | --- |
| Additive source promotion | Cases 1, 2, and 5 | Create derivatives from selected authorized projections; preserve source authority and shared lineage | Case 6 |
| Stable action idempotency | Cases 1–5 | Ambiguous retries return the original receipt instead of appending duplicate semantic actions | Case 6 |
| Append-only correction chain | Cases 1–5 | Preserve original records; derive effective state from corrections and supersessions | Case 6 |
| Immutable publication ledger | Cases 1–5 | Separate historical publication receipts from replaceable current public projections | Case 6 |
| Dependency invalidation | Cases 1–5 | Source corrections mark candidates, Ideas, handoffs, schedules, expressions, and projections stale or held | Case 6 |
| Minimal authorized projection | Cases 1–5 | Send only selected content, required context, restrictions, readiness, and lineage across boundaries | Case 6 |
| Fail-closed restrictive correction | Cases 1–5 | Remove unsafe or invalid current delivery before fallible widening or rebuild work | Case 6 |
| Candidate identity and supersession | Cases 3–5 | Bind readiness/publication to exact editions and record successor relationships | Case 6 |
| Hold and release ledger | Cases 3 and 5 | Pause scheduling/execution without altering approval or readiness history | Case 6 |
| Retirement and rights withdrawal | Cases 3–5 | Remove editions/pairings/assets/expressions from active use while preserving historical records | Case 6 |
| Derived-state rebuild receipt | Cases 4 and 5 | Record correction impact, affected projections/cache keys, rebuild result, and unresolved failures | Case 6 |
| Publication correction and superseding edition | Cases 4 and 5 | Preserve original manifests/receipts and visibly link replacement actions | Case 6 |
| Publication-package handoff | Case 5 | Project a canonical Fandom edition into CREATE without transferring authority | Case 6 |
| Platform Expression identity | Case 5 | Bind platform, format, draft version, source edition, and native receipt | Case 6 |
| Independent execution attempts | Case 5 | Record pending, failed, reconciled, retried, and abandoned outcomes per expression | Case 6 |
| Intentional channel omission | Case 5 | Permit zero or partial derivatives without placeholders or false blockers | Case 6 |
| Perceptual asset identity | Case 4 | Match materially identical crops/recompressions/rehosts without collapsing distinct variants | Vibe Atlas-specific unless Case 6 proves reuse |
| Domain contribution intake | Case 2 | CREATE proposes; Fandom accepts, versions, publishes, corrects, or rejects | Case 6 if Rednote produces website follow-up |
| Domain-state transition ledger | Case 2 | Verified events produce explicit transitions; analytics and rumors cannot mutate public truth | Closed unless Case 6 contradicts it |
| Participation ledger | Case 2 | Preserve truthful participation meaning, privacy, withdrawal, aggregation, and abuse controls | Waiting Room-specific |

## Case 6 — Rednote publication and reconciliation

### Governing purpose

Rednote closes the external-expression lifecycle. It must preserve every
authority transition without allowing intent, an attempted action, a native
result, verified publication, or performance learning to impersonate another.

```text
Editorial Idea
→ Rednote expression
→ PLAN placement
→ execution authorization
→ operator or integration attempt
→ native Rednote result
→ CONNECT verification
→ metrics snapshot
→ learning returned to CREATE / Series
```

The governing states are:

```text
planned
≠ authorized
≠ attempted
≠ operator_scheduled_receipt_pending
≠ published
≠ reconciled
≠ measured
```

Only authenticated native evidence establishes publication. Scheduling,
operator memory, a PLAN status, an expected URL, or the absence of an error is
not enough.

### Publication truth and identity

A reconciled Rednote publication must bind:

```text
Editorial Idea ID
+ Rednote Expression ID and version
+ PLAN placement ID and version
+ execution authorization ID
+ attempt ID
+ native account
+ native Note ID
+ authenticated native existence
+ native publication timestamp when available
```

A stable public URL is useful but not required to establish existence when the
authenticated platform response supplies a Note ID and publication state.
Metrics are subsequent observations of that native publication, not stronger
proof that planning intent existed.

### Case 6 contract summary

| ID | Action | Current result | Case-law result |
| --- | --- | --- | --- |
| C6.1 | Promote an Editorial Idea into a Rednote expression | Conceptually supported by CREATE; durable Idea → expression contract is not implemented here | Passes constitution; implementation incomplete |
| C6.2 | Place the expression in PLAN | Notion-backed Posts support status/schedule and stale-write rejection | Passes, subject to expression-lineage gap |
| C6.3 | Authorize execution | Approved post with readiness and exact schedule can enter the operator lane | Partial; durable authorization receipt is missing |
| C6.4 | Record operator or automated attempts | Operator-scheduled marker exists with idempotency forwarding | Partial; automated and general attempt history are missing |
| C6.5 | Resolve ambiguous attempts before retry | Upstream unavailable state fails closed, but PLAN cannot query native attempt outcome directly | Required safe-operation contract |
| C6.6 | Verify native publication and reconcile | `reconciled` is recognized and projected as Published | Partial; Note ID, account, native timestamp, and verification evidence are not exposed in the current contract |
| C6.7 | Match an existing native note without duplicating PLAN | No matching contract is present in this repository | Missing reconciliation contract |
| C6.8 | Snapshot metrics | PLAN explicitly does not invent metrics; no durable metrics snapshot is represented | Missing CONNECT contract |
| C6.9 | Return learning to CREATE / Series | No automatic mutation exists, which is correct; recommendation/Capture contract is missing | Passes authority rule; implementation incomplete |
| C6.10 | Correct, retract, supersede, or isolate failure | Current lifecycle has pending/reconciled/unavailable but no append-only reversal ledger | Missing safe-operation contract |

### C6.1 — Promote an Editorial Idea into a Rednote expression

| Contract field | Decision |
| --- | --- |
| Authority | CREATE owns additive promotion and expression composition; the source owner retains authority over the Editorial Idea |
| Canonical record affected | New Rednote Platform Expression linked to the immutable Idea/source passage and optional Series |
| Input projection allowed | Selected Idea content, authorized sources, Series context, Rednote treatment, audience signal, rights constraints, and prior related expressions |
| Mutation allowed | Create expression-specific title, Chinese source copy, assets, tags, product bindings, and creative versions. Do not rewrite the Idea |
| Privacy boundary | Only selected source material crosses into the expression. Private journal context, sealed evidence, and unrelated audience identities remain excluded |
| Lineage / idempotency key | Idea ID + Rednote expression ID + source version + promotion action key |
| Stale/conflict behavior | Source correction, privacy change, rights withdrawal, or concurrent expression edit places the draft in review instead of silently refreshing it |
| Receipt/event produced | Additive promotion receipt and expression-version receipt |
| Downstream effect | A complete expression version may be proposed to PLAN |
| Correction/reversal path | Retire or supersede the expression; preserve the Idea and all prior expression versions |
| Current surface | CREATE/Workstation conceptually; no complete Idea → expression contract is implemented in this repository |
| Future surface | Embedded CREATE in the CDRAMA Lens |

### C6.2 — Place the expression in PLAN

| Contract field | Decision |
| --- | --- |
| Authority | PLAN owns placement, priority, status, and schedule after receiving the expression projection |
| Canonical record affected | PLAN placement record linked to exact Rednote expression version |
| Input projection allowed | Expression identity/version, publication-ready copy/assets, readiness, account/channel constraints, source lineage, and correction state |
| Mutation allowed | Set canonical PLAN status and timezone-bearing schedule. Do not alter canonical expression copy or source Idea |
| Privacy boundary | PLAN receives execution-ready material and constraints, not raw private sources or native credentials |
| Lineage / idempotency key | PLAN record ID + expression version + expected Notion `last_edited_time` |
| Stale/conflict behavior | Concurrent Notion changes return conflict. A changed expression version requires explicit re-placement or reauthorization |
| Receipt/event produced | Placement/version receipt and schedule-intent history |
| Downstream effect | A ready and approved placement may be authorized for execution |
| Correction/reversal path | Unschedule, hold, cancel, or link a successor placement before execution; preserve prior placement history |
| Current surface | PLAN Posts DB |
| Future surface | PLAN projection inside the CDRAMA Lens |

The current Posts record does not prove which immutable expression version it
contains. That lineage is required before the cockpit may present a seamless
Idea → expression → PLAN chain.

### C6.3 — Authorize execution

| Contract field | Decision |
| --- | --- |
| Authority | Katie or an explicitly authorized policy approves the exact expression/version, account, and execution condition |
| Canonical record affected | Append-only execution-authorization receipt |
| Input projection allowed | Exact PLAN placement/version, exact expression/version, readiness, target account, native timing, restrictions, and current correction state |
| Mutation allowed | Authorize one execution request within defined parameters. Authorization does not publish or change the expression |
| Privacy boundary | Authorization may reference a credential/account alias; secret material stays in EXECUTE |
| Lineage / idempotency key | Authorization ID bound to placement version, expression version, account, and schedule |
| Stale/conflict behavior | Any bound field change invalidates the authorization and requires a new receipt |
| Receipt/event produced | Signed/attributed authorization receipt with actor, scope, and expiry or one-use rule |
| Downstream effect | EXECUTE may accept an operator or automated attempt |
| Correction/reversal path | Revoke unused authorization; after attempt, append cancellation/retraction handling without erasing the authorization |
| Current surface | Inferred from Approved + ready PLAN state and operator action; no standalone durable authorization receipt |
| Future surface | PLAN authorization gate |

### C6.4 — Record an operator or automated execution attempt

| Contract field | Decision |
| --- | --- |
| Authority | EXECUTE records what the human operator or integration actually attempted |
| Canonical record affected | Append-only execution-attempt ledger |
| Input projection allowed | Authorization ID, exact expression payload/version, target account, schedule, executor type, and safe platform request metadata |
| Mutation allowed | Append attempt, native request reference, immediate response, and outcome classification. Do not mark Published merely because a request was sent |
| Privacy boundary | Credentials, cookies, tokens, and private platform response details remain inside EXECUTE; safe facts project outward |
| Lineage / idempotency key | Stable execution request key shared by operator/integration coordination, plus attempt ID for each intentional new try |
| Stale/conflict behavior | Reusing a key with different payload/account/schedule is a conflict. Concurrent operator and automation claims require one winner or native verification |
| Receipt/event produced | Attempt receipt: operator/automation, request key, payload digest, attemptedAt, immediate outcome, and native reference if available |
| Downstream effect | CONNECT verifies uncertain/success-shaped results; PLAN shows receipt pending rather than Published |
| Correction/reversal path | Append outcome correction, cancellation, late success, or duplicate classification |
| Current surface | Operator scheduling marker is forwarded to XHS with an idempotency UUID |
| Future surface | Shared EXECUTE attempt ledger for human and automated modes |

Operator and automated execution must use compatible history. They may have
different adapters, but they cannot maintain independent duplicate-posting
truths.

### C6.5 — Resolve an ambiguous attempt before retry

| Contract field | Decision |
| --- | --- |
| Authority | CONNECT verifies native state; EXECUTE may retry only after the prior outcome is resolved or the native API guarantees idempotency |
| Canonical record affected | Attempt-resolution receipt linked to the uncertain attempt |
| Input projection allowed | Attempt ID, request key, target account, payload fingerprint, time window, native request reference, and authenticated native search results |
| Mutation allowed | Classify prior attempt as published, failed, canceled, duplicate, or still unknown; authorize retry only under explicit policy |
| Privacy boundary | Native lookup credentials and raw response remain private; safe classification projects to PLAN |
| Lineage / idempotency key | Original request key + native account + payload fingerprint; retry receives a new attempt ID only after resolution |
| Stale/conflict behavior | Timeout, 5xx, browser loss, or malformed response stays unknown/unavailable. It never becomes safe-to-retry by elapsed time alone |
| Receipt/event produced | Verification/retry-decision receipt with evidence and confidence |
| Downstream effect | Prevents duplicate notes while allowing deliberate recovery |
| Correction/reversal path | Later native evidence may supersede the classification append-only and reconcile a late publication |
| Current surface | Integration outage becomes `unavailable`; PLAN removes affected ready posts from the dispatch lane |
| Future surface | CONNECT exception and reconciliation queue |

The current fail-closed state is necessary but not sufficient: it prevents a
blind second click in PLAN, but the repository does not prove native outcome
lookup or retry authorization.

### C6.6 — Verify native publication and reconcile

| Contract field | Decision |
| --- | --- |
| Authority | CONNECT owns verification; Rednote owns native publication fact |
| Canonical record affected | Verified external-publication receipt and reconciled PLAN projection |
| Input projection allowed | Attempt lineage, authenticated account lookup, native Note ID, native existence/state, publication timestamp, URL when available, and expression payload fingerprint |
| Mutation allowed | Append verified publication receipt; project PLAN production stage/status as Published. Do not modify source Idea or canonical expression copy |
| Privacy boundary | Public Note ID/URL and safe timestamps may be shown; native credentials and private account data remain in CONNECT |
| Lineage / idempotency key | Native account + Note ID, linked to expression version, placement, authorization, and attempt |
| Stale/conflict behavior | Account mismatch, payload mismatch, multiple candidates, deleted/hidden state, or unavailable lookup cannot reconcile automatically |
| Receipt/event produced | Verification receipt with method, authenticated evidence digest, Note ID, account, publishedAt, verifiedAt, and optional stable URL |
| Downstream effect | PLAN may truthfully project Published; CONNECT may begin metrics observation |
| Correction/reversal path | Append deletion, visibility change, incorrect-match, or supersession receipt; preserve the original verified publication event |
| Current surface | XHS returns `reconciled`; PLAN then shows Published |
| Future surface | CONNECT publication ledger with native identity and verification evidence |

Current PLAN intentionally does not invent Note ID, URL, native publication
time, or metrics. Its validated execution object proves reconciliation state
and scheduling lineage, but not the full native publication identity required
by this contract. A manually set Notion `Published` status is also not
equivalent to authenticated native verification.

### C6.7 — Reconcile an existing native note without duplicating PLAN

| Contract field | Decision |
| --- | --- |
| Authority | CONNECT proposes a match; Katie confirms ambiguous evidence |
| Canonical record affected | Reconciliation/link receipt between an existing PLAN placement/expression and native Note ID |
| Input projection allowed | Native account/Note ID/URL, candidate PLAN records, title/copy fingerprint, asset fingerprint, schedule/publication window, and prior attempt history |
| Mutation allowed | Link the native note to an existing record and append reconciliation evidence. Create a new PLAN row only when no legitimate source record exists and policy explicitly permits backfill |
| Privacy boundary | Matching uses minimum publication metadata; private source content is not exposed to Rednote |
| Lineage / idempotency key | Native account + Note ID as uniqueness boundary |
| Stale/conflict behavior | Exact Note ID/account match outranks URL; URL match outranks high-confidence title/date/asset evidence. Multiple plausible records require review |
| Receipt/event produced | Match receipt with method, confidence, reviewer where applicable, and rejected alternatives |
| Downstream effect | Prevents duplicate Posts rows and connects metrics to the correct expression |
| Correction/reversal path | Append incorrect-match receipt, unlink current projection, and link the right record without deleting either history |
| Current surface | Not implemented in this repository |
| Future surface | CONNECT reconciliation queue |

High-confidence title/date evidence is a fallback, not publication identity.
It must never auto-create a second planning record for a note whose lineage can
be recovered.

### C6.8 — Capture a metrics snapshot

| Contract field | Decision |
| --- | --- |
| Authority | CONNECT observes native metrics; the platform remains authoritative for each observed value |
| Canonical record affected | Append-only time-stamped metrics snapshot linked to native Note ID and expression version |
| Input projection allowed | Native Note ID/account, metric names/values, collection time, visibility state, and verification method |
| Mutation allowed | Append a new snapshot; derive trends and comparisons. Never overwrite earlier snapshots or publication truth |
| Privacy boundary | Public aggregate engagement may project to CREATE. Individual viewer/commenter identity remains excluded unless a separate authorized Capture is created |
| Lineage / idempotency key | Native account + Note ID + observedAt + metric schema/version |
| Stale/conflict behavior | Missing, delayed, hidden, or platform-redefined metrics are recorded as unavailable/changed semantics, not zero |
| Receipt/event produced | Metrics snapshot with collection receipt and schema |
| Downstream effect | CONNECT can produce recommendations, detect audience questions, or propose a new Capture |
| Correction/reversal path | Append corrected/reinterpreted snapshot when platform discrepancies or schema changes are discovered |
| Current surface | Not implemented in PLAN; README explicitly states the operator marker does not invent metrics |
| Future surface | CONNECT Signals |

### C6.9 — Return learning to CREATE / Series

| Contract field | Decision |
| --- | --- |
| Authority | CONNECT recommends; Katie/CREATE decides whether to capture, promote, or change future work |
| Canonical record affected | Recommendation, audience-signal Capture, or explicitly approved Series learning |
| Input projection allowed | Metrics trends, safe comment themes, publication context, expression treatment, and confidence/limitations |
| Mutation allowed | Create additive recommendation/Capture. Series changes require explicit review and their own receipt |
| Privacy boundary | Aggregate or de-identified audience evidence crosses into CREATE; raw identities and unrelated comments do not |
| Lineage / idempotency key | Learning event ID + source Note ID + snapshot IDs + analysis version |
| Stale/conflict behavior | Deleted notes, corrected snapshots, sample bias, or conflicting platform evidence lower confidence and trigger reevaluation |
| Receipt/event produced | Recommendation/Capture receipt with evidence lineage and decision status |
| Downstream effect | May inspire a new Idea, revise a future treatment, or inform Series strategy |
| Correction/reversal path | Supersede or reject the recommendation; never retroactively rewrite the published expression or silently mutate Series |
| Current surface | No end-to-end durable learning handoff is implemented |
| Future surface | CONNECT Signals → CAPTURE / explicit Series review |

Analytics may advise editorial judgment. They cannot become an invisible
optimization process that edits canonical copy, reclassifies the Series, or
changes Fandom truth.

### C6.10 — Correct, retract, supersede, and isolate failure

| Contract field | Decision |
| --- | --- |
| Authority | Rednote establishes native state; CONNECT verifies discrepancies; CREATE/PLAN decide successor expression and placement; Fandom remains independent |
| Canonical record affected | Append-only correction/reversal ledger across native receipt, expression, placement, and attempt history |
| Input projection allowed | Native note state, original verification, current expression/placement, correction reason, successor Note ID/expression, and affected dependencies |
| Mutation allowed | Project deleted/retracted/hidden/incorrectly matched/superseded state; hold future work; create linked successor copy. Do not erase the original publication receipt |
| Privacy boundary | Public correction language is separately authorized; internal discrepancy evidence remains restricted |
| Lineage / idempotency key | Correction/reversal ID + affected receipt/Note ID + optional successor ID |
| Stale/conflict behavior | Conflicting native observations or uncertain deletion remain under review. Restrictive holds apply before optimistic restoration |
| Receipt/event produced | Deletion, incorrect-match, retraction, supersession, discrepancy, or restoration receipt |
| Downstream effect | Current projections become truthful while history remains auditable; only dependent Rednote objects are affected |
| Correction/reversal path | Every reversal is itself append-only and may later be superseded by stronger evidence |
| Current surface | Pending/reconciled/unavailable states exist; durable reversal and discrepancy history do not |
| Future surface | CONNECT publication exception ledger |

Rednote failure or reversal cannot mutate:

- the originating Editorial Idea;
- another platform's expression or receipt;
- an independently valid Fandom edition;
- immutable source copy or prior expression versions;
- unrelated Series truth.

### Canonical-copy ruling

The approved Chinese source copy belongs to the Rednote expression version.
Any app-native translation, alternate-language display, accessibility text, or
platform-generated rendering is a derivative observation:

```text
canonical Chinese source copy
→ native Rednote rendering
→ optional translation projection
```

The native rendering or translation may be captured for reconciliation, but it
cannot overwrite the Chinese source copy. A materially revised Chinese post is
a successor expression/version, not a translation cleanup.

No app-native translation lineage is implemented in the current repository.

### Case 6 verdict

**Result: The Rednote lifecycle passes the constitution, and the six-case
case-law phase is complete. The implementation proves safe intent and
operator-scheduling boundaries, but only a partial execution/reconciliation
contract.**

Implemented strengths:

- README and code explicitly define scheduling as editorial intent, not a
  timer, publisher, or automatic status transition.
- PLAN sends the exact Notion page ID, current Notion version, timezone-bearing
  schedule, and idempotency key to the XHS integration.
- A repeated compatible request may replay; a schedule mismatch remains a
  named conflict.
- PLAN does not fabricate public URL, Note ID, publication time, or metrics.
- `operator_scheduled_receipt_pending` remains distinct from `reconciled`.
- Unavailable upstream state fails closed and removes affected ready posts from
  the dispatch lane.
- An exact refresh that has already reconciled is not regressed to an earlier
  pending response.
- Non-Rednote posts do not inherit Rednote execution state.

Required contracts:

1. Immutable Rednote expression/version lineage through PLAN and EXECUTE.
2. Explicit one-use/revocable execution authorization receipts.
3. Shared operator/automation attempt ledger and duplicate-prevention policy.
4. Native outcome lookup before retrying ambiguous attempts.
5. Verified publication receipt containing account, Note ID, native existence,
   native timestamp, and verification evidence.
6. Native note reconciliation and incorrect-match reversal.
7. Append-only metrics snapshots with schema and unavailable semantics.
8. Recommendation/Capture return path that cannot silently mutate Series.
9. Native deletion, retraction, visibility, discrepancy, and successor ledger.
10. Canonical-copy and native-translation lineage.

No constitutional amendment is required. The final case confirms:

```text
PLAN expresses intent.
EXECUTE records attempts and native responses.
CONNECT establishes and corrects publication truth.
Metrics create evidence, not authority.
Learning returns additively.
Failures remain isolated to their dependent branch.
```

## Ranked implementation obligations after all six cases

The ranks below describe when a contract becomes mandatory. They do not
authorize schema, UI, or migration work.

### Required for safe operation

1. **Stable action and attempt idempotency.** Every mutation or native attempt
   must return the original receipt after an ambiguous success and reject
   payload drift under the same key.
2. **Execution authorization and attempt history.** Bind expression version,
   PLAN version, account, schedule, executor, payload digest, and every retry.
3. **Ambiguous-outcome verification.** Query authenticated native state before
   retry unless the platform supplies a proven idempotency guarantee.
4. **Verified publication identity.** Store account, Note ID, native existence,
   native publication time, verification method, and optional URL.
5. **Append-only correction and reversal.** Support hold, cancellation,
   incorrect match, deletion, retraction, visibility change, rights withdrawal,
   supersession, restoration, and discrepancy without rewriting history.
6. **Durable candidate/edition hold and retirement.** Prevent stale or unsafe
   work from entering PLAN/EXECUTE while retaining approval and readiness
   evidence.
7. **Publication correction and superseding editions.** Preserve original
   manifests/posts and visibly connect replacements.
8. **Dependency invalidation.** Project source corrections to affected Ideas,
   candidates, expressions, placements, attempts, publications, and caches.

### Required for the federated CDRAMA cockpit

1. **Minimal typed projections.** Define explicit read projections and mutation
   commands between Fandom, CREATE, PLAN, the EXECUTE/PUBLISH boundaries, and
   CONNECT.
2. **Canonical edition publication package.** Hand an immutable Fandom edition
   into CREATE with versioning, restrictions, lineage, and correction state.
3. **First-class Platform Expression identity.** Bind source, platform, format,
   canonical copy, draft version, PLAN placement, and native receipt.
4. **Additive source promotion.** Turn passages, evidence, audience signals,
   Ideas, and editions into derivatives without moving or rewriting sources.
5. **Cross-surface current-state projections.** Derive active/held/stale/
   superseded state from immutable ledgers without granting mutation authority
   to the cockpit.
6. **Intentional omission.** Represent “no external derivative” and partial
   channel coverage as complete editorial choices.
7. **CONNECT learning return.** Create attributed recommendations or Captures;
   require explicit review before Series mutation.
8. **Permissioned privacy boundaries.** Enforce First-Watch spoiler safety,
   sealed evidence, audience de-identification, rights restrictions, and
   minimal receipt visibility in every composed view.

### Future platform capability

1. **Automated Rednote execution.** It must share the same authorization,
   idempotency, attempt, verification, and correction contracts as operator
   execution.
2. **YouTube derivatives by format.** Shorts, long-form video, and community
   posts require separate treatment, asset, scheduling, execution, and receipt
   rules.
3. **Instagram/Weibo native execution adapters.** Manual URL receipts do not
   provide Rednote-equivalent attempt or verification guarantees.
4. **Canonical-copy translation lineage.** Preserve approved Chinese copy while
   recording app-native or editorial translations as derivatives.
5. **Stable URL enrichment.** Backfill or repair public URLs without making URL
   presence the definition of publication.
6. **Safe replacement publication.** Support platform-native corrected or
   successor posts where platform capabilities permit.

### Diagnostic or repair infrastructure

1. **Durable projection/cache rebuild receipts.** Record affected keys,
   correction source, before/after state, partial failures, and retries.
2. **Dependency-impact inventory.** Show every downstream candidate, Idea,
   handoff, expression, placement, publication, and cache affected by a source
   correction.
3. **Perceptual asset identity.** Match materially identical crops,
   recompressions, and rehosts without conflating distinct editorial variants.
4. **Partial repair queues.** Resume failed media sync, cache rebuild,
   correction propagation, receipt enrichment, and reconciliation safely.
5. **Public correction-state diagnostics.** Verify that withdrawn, held, or
   superseded editions render truthfully across archive and external links.
6. **Publication discrepancy monitoring.** Detect deleted/hidden native notes,
   stale URLs, metric-schema changes, and receipt/native-state disagreement.

## Final cross-case ruling

All six cases pass the frozen constitution:

1. *The Untamed* proves privacy, chronology, immutable predictions, sealed
   evidence, spoiler boundaries, and additive promotion.
2. *Nian Wushuang* proves evolving Series argument, audience participation,
   universe evidence, optional expressions, and domain contribution.
3. Vibe Atlas proves exact candidate identity, immutable curator evidence,
   receipt-backed readiness, and PLAN eligibility.
4. Misprint proves collectible/correction separation, restrictive
   invalidation, immutable publication, and cache repair boundaries.
5. Daily Drop proves canonical Fandom publication and optional,
   independently failing external derivatives.
6. Rednote proves intent/attempt/publication/measurement separation,
   fail-closed reconciliation, additive learning, and failure isolation.

The case-law phase is complete. The next architecture decision is the physical
host of the CDRAMA Lens, using the six cases' required projections, permissions,
failure boundaries, and duplication cost. Only after that decision may the
paper cockpit be drawn.

## CDRAMA Lens placement and capability map

### Placement decision

**Decision: the CDRAMA Lens is a selectable Creator OS view across the existing
CAPTURE, CREATE, PLAN, and CONNECT surfaces.**

It changes which CDRAMA modules, engines, records, and contextual actions are
visible. It is not a separate workspace, tab hierarchy, or persistence owner.
Creator OS renders the Lens; each displayed capability keeps its own authority.

Lens selection enriches and filters the four existing modules; it does not
replace them or become a prerequisite for using them:

- With no domain Lens selected, Katie can enter CREATE directly to make an
  ordinary post—about her dogs, for example—without seeing CDRAMA, LOTR, or
  unrelated domain machinery.
- With the CDRAMA Lens selected, relevant CDRAMA sources, Series, domain
  projections, tools, and actions appear in CAPTURE, CREATE, PLAN, and CONNECT.
- Switching Lens context changes what is relevant and available, not the
  canonical owner of any record.
- A direct-to-CREATE artifact does not need a synthetic Capture merely to
  satisfy a diagram.

It is not:

- a new source of truth;
- a renamed Fandom admin;
- a new Creator OS workspace;
- an “Operator” or “Katie-only” navigation silo;
- a shared database between Fandom and Creator OS;
- a universal publication queue;
- a proxy that grants Creator OS mutation authority over every visible record.

Creator OS is the correct rendering host because the Lens's continuous spine
is cross-domain editorial work:

```text
Sources + Series + authorized domain context
→ CAPTURE
→ CREATE shaped artifacts and expressions
→ external PLAN
→ [EXECUTE / PUBLISH contract boundary]
→ CONNECT learning
```

Fandom is one authoritative domain supplying unusually rich context and native
actions to that spine:

```text
First-Watch
Waiting Room
Vibe Atlas
Collection
Release Operations
Fandom publication
```

Making the Lens a Fandom screen would make non-Fandom CDRAMA work and other
brands appear subordinate to one domain product. Making it a new workspace or
neutral shell would add another navigation, persistence, command, and failure
owner while duplicating Creator OS's existing lifecycle surfaces. Creator OS
can render the complete creative context with less duplication as long as
Fandom exposes narrow read projections and explicit command contracts.

The placement decision does not move canonical records. It decides which tools
and projections appear when the CDRAMA Lens is selected.

The Lens may **render a domain cockpit without owning the authoritative
domain**. In particular, the Nian Wushuang Waiting Room may appear as a
contextual CDRAMA Lens view while Fandom retains public Waiting Room state,
clock-ins, canon evidence, moderation, and publication rules.

### Five ways a capability appears in the Lens

| Presentation mode | Authority placement | Meaning | Mutation rule |
| --- | --- | --- | --- |
| **Embedded** | Native module or explicitly embeddable owner capability | The workbench or contextual control renders inside the lifecycle surface where the work occurs | Mutation follows the canonical owner's rules; visual embedding grants no authority |
| **Projection** | Authorized projection | The Lens receives a minimal read model from another owner | Lens cannot mutate the source |
| **Invoke** | Domain command | Lens invokes an explicit action on the owning system | Owner validates authority, concurrency, privacy, and idempotency and returns a receipt |
| **Open specialized view** | Linked specialist surface | The work needs full domain context or elevated editorial authority | Lens opens the owner; it does not imitate or partially reimplement the tool |
| **Diagnostic only** | Diagnostics/system control | The capability exists to inspect or repair technical machinery | It stays outside normal editorial lifecycle surfaces; only safe health status may project |

These are presentation choices, not new authority types. A Fandom-owned command
embedded inside Creator OS remains a Fandom command; a native Creator OS module
may also use the Embedded presentation mode.

### Capability-placement map

| Capability / surface | Current surface or engine | Canonical owner | Lens placement | Future disposition |
| --- | --- | --- | --- | --- |
| CDRAMA Sources | Research notes, source URLs, evidence currently distributed across tools | Creator OS for general sources; domain owner for domain evidence | Native module plus authorized domain projections | One source explorer with typed links to domain evidence; no evidence copying by default |
| General Capture | Ad hoc drafts and tool-specific intake | Creator OS CAPTURE | Native module | Organize unshaped material by CDRAMA meaning—drama, actor, character, episode, scene, source, Series, journal, evidence, or audience signal—then optionally promote |
| First-Watch capture | `WatchJournalCapture`, watch-journal API | Fandom First-Watch | Projection + domain command + specialist link | Show safe boundary/selected entries; file, resolve, seal, moderate, and publish through Fandom contracts |
| Waiting Room cockpit | Future composed Nian Wushuang Lens view | Creator OS renders; no transfer of domain authority | Contextual Lens view | Assemble Fandom state/evidence with CREATE dispatches, Ideas, expressions, PLAN, and CONNECT |
| Waiting Room private dispatch | Creative observation related to the Series | Creator OS CAPTURE | Native module | Editable Capture that may remain private or promote additively to an Idea or expression |
| Waiting Room public state, canon evidence, clock-ins, and contributions | Constitutional design; future Fandom domain records | Fandom Waiting Room | Projection + domain command | Show safe state/aggregate; route evidence, clock-in, moderation, and contribution actions to Fandom |
| Series continuity | Conceptual Creator OS Series | Creator OS | Native module | Holds recurring thesis, continuity, audience questions, treatments, and linked expressions |
| Editorial Ideas | Conceptual additive derivatives | Creator OS | Native module | Promote selected Capture/domain passages with immutable lineage |
| Kits / Treatments | Creative grammar and platform adaptation rules | Creator OS | Native module | Reusable instructions applied by CREATE without becoming publication authority |
| Workstation draft studio | External Workstation and current saved-grid handoff | Creator OS CREATE | Native engine embedded in Lens | “Open Workstation” becomes “Create/continue expression”; Workstation remains the composition engine, not a separate conceptual destination |
| Platform Expression versions | Draft copy, title, tags, assets, art direction | Creator OS CREATE | Native module | First-class expression identity linked to Idea/Series/domain source |
| Collection | `Collection`, local/account stores | Fandom member experience | Authorized selected-artifact projection + specialist link | Remains a personal Fandom shelf; selected cards/grids may be promoted or handed off explicitly |
| Native Grid Builder | `GridBuilder`, export/share tools | Fandom member experience | Specialist link; optional artifact projection | Remains a Fandom-native creation tool and never requires Creator OS |
| Vibe Atlas source exploration | Query ladders and raw candidate investigation inside `ActorPreflightLab` | Fandom evidence authority today | Specialist link; later narrow source projection | May reuse CDRAMA Sources discovery helpers, but retained audit evidence stays Fandom-owned |
| Vibe Atlas Curator Lab | Board formation, blind comparison, rescue board, curator teaching | Fandom Vibe Atlas | Authorized progress projection + specialist link | Remains Fandom-owned; Lens may show candidate state and open the exact review |
| Exact-board approval | Actor Preflight immutable verdict receipts | Fandom editorial operations | Domain command only when safe; otherwise specialist link | Approval never moves to CREATE or PLAN |
| Misprint correction | Actor audit correction plus Collection collectible state | Fandom correction authority | Projection + specialist link | Lens shows correction impact; review/retract/repair remains in Fandom |
| Approved Candidates | Derived actor × Vibe eligibility | Fandom release operations | Authorized projection | Appears as source material available for a Fandom edition, not as a generic Creator OS draft |
| Production Readiness | `ReleaseDesk` production receipts | Fandom release operations | Authorized projection + bounded domain commands | Asset/render/copy/provenance gates remain Fandom-owned for the canonical edition |
| Fandom hold / retirement | Case-law contract, not fully implemented | Fandom release operations | Projection + domain command | Hold/retire/release commands return durable receipts |
| Fandom Public Editions | Publication manifest, Daily Drop, Archive | Fandom publication | Authorized projection | Lens shows immutable edition, current correction state, and derivative relationships |
| Fandom native publication | `materializePublicationManifest`, Daily Drop operations | Fandom publication | Domain command or specialist link | Never routed through external PLAN; succeeds without Creator OS |
| Publication-package handoff | Current saved-grid → Workstation handoff is prior art | Fandom authorizes projection; Creator OS owns accepted draft | Domain command crossing boundary | New manifest-bound package creates/updates an expression and returns a receipt |
| External placement | PLAN Posts DB and scheduling UI | Creator OS PLAN | Native module | PLAN references exact expression version and owns priority, schedule, and authorization |
| Domain-native release conditions | Calendar/boundary/event/manual/immediate contracts | Owning domain | Projection + domain command | Not coerced into Posts DB or external PLAN |
| Rednote operator execution | XHS integration and PLAN marker | EXECUTE/XHS | Contextual action/status embedded at the PLAN → CONNECT boundary | One authorization/attempt history shared by operator and automation |
| Other platform execution | Manual receipts or future adapters | Each native platform through EXECUTE | Contextual action/status when an adapter exists | Platform-specific contracts; no inherited Rednote guarantees |
| External publication ledger | Partial PLAN/XHS reconciliation and manual URLs | CONNECT | Native module | Verified account + native ID + published time + optional URL, linked to expression |
| Metrics snapshots | Not implemented end to end | CONNECT | Native module | Append-only observations; missing/unavailable is not zero |
| Audience Signals | Current Release Desk engagement summary mixes editorial evidence and quality | CONNECT | Native module | Editorially useful patterns, questions, saves, shares, and expression performance |
| Data Health | Current engagement data-quality panel/export | Diagnostics | Diagnostic only; small status projection | Instrumentation coverage, malformed records, cache/storage failures, and repair controls leave editorial CONNECT |
| Recommendations / learning | Not implemented end to end | CONNECT recommends; CREATE/Series accepts | Native module | Produce attributed recommendation or Capture; never mutate Series silently |
| Court Rulings / domain policy | Operator Console Court Rulings | Fandom domain policy | Relevant projection + specialist link | Policy remains with the domain whose behavior it governs |
| Cache rebuild and repair | `rebuild-cache`, sync/recovery utilities | Diagnostics/system control | Diagnostic only | Never presented as editorial CAPTURE, CREATE, PLAN, or CONNECT work |
| Authentication and secrets | Fandom admin/member auth, Creator OS auth, integration tokens | Each system | Session-aware boundary only | No shared credential store; commands use scoped service authorization |

### Modules visible when the CDRAMA Lens is selected

The Lens is applied to Creator OS's existing lifecycle surfaces. It does not
add an Operator tab or a Katie-only tab.

| Creator OS surface | CDRAMA modules, engines, and tools visible through the Lens |
| --- | --- |
| **CAPTURE** | Quick Capture; private Waiting Room dispatch; source/link capture; audience-question capture; “file in First Watch” Fandom command; “add Waiting Room evidence” Fandom command; Collection artifact picker; recent safe domain context |
| **CREATE** | Series context; Editorial Ideas; CDRAMA Sources; Kits/Treatments; Workstation expression composer; media/source selector; Fandom publication-package intake; Domain Contribution drafting; expression version and provenance |
| **PLAN** | External expression placements; platform/account choice; schedule intent; execution authorization; readiness and hold projections; domain-native release-condition projection; conflicts requiring action |
| **CONNECT** | Attempt and reconciliation status; Fandom Public Edition projections; verified external publications; derivative lineage; correction/supersession state; metrics snapshots; audience signals; learning proposals; “capture this finding” and “propose to Series” actions |

Permission changes actions, not information architecture:

- ordinary safe projections may be visible wherever their workflow needs them;
- Fandom editorial commands appear only to an authorized Fandom editor;
- publication authorization appears only to an authorized planner;
- execution actions appear only to an authorized operator/integration;
- diagnostic repair controls never appear merely because Katie can access them.

“Katie-only” and “operator” therefore remain capability checks. They are not
destinations users must visit to find the CDRAMA work.

### Workbench and intermediate disposition

The Lens does not eliminate intermediates. It makes their role and authority
legible.

| Intermediate | What it is | What it may become | What it may not claim |
| --- | --- | --- | --- |
| Raw source hit | Search/discovery evidence | Retained domain evidence or a selected source reference | Verified canon, approved candidate, or publishable asset |
| Creator OS Capture record | Private freeform observation | Idea, source note, or nothing | Domain filing, publication intent, or an expectation of later promotion |
| Journal entry | Protocol-bound domain record filed through the CAPTURE module | Selected passage may promote additively to an Idea or artifact | Generic editable note or automatic CREATE input |
| Audience signal | Observation about questions/response | Capture, recommendation, or evidence for an Idea | Series truth or automatic strategy |
| Editorial Idea | Creative proposition | One or more expressions or domain contributions | Platform publication |
| Treatment / Kit | Reusable creative grammar | Applied expression version | Canonical source content |
| Saved card / grid | Fandom collectible or arranged artifact | Native export or explicit source for CREATE | Approved publication candidate unless approval lineage exists |
| Curator proposal | Derived candidate board | Exact-board approval | Publication readiness |
| Approved Candidate | Immutable editorial candidate | Production-ready edition | Scheduled or published edition |
| Production package | Receipt-backed ready assets/copy/render/provenance | Fandom publication or authorized handoff | Native publication fact |
| Platform Expression | Versioned channel-specific creative object | PLAN placement | Source Idea or Fandom edition ownership |
| PLAN placement | Intent, schedule, and authorization context | EXECUTE request | Publication receipt |
| Execution attempt | Native action and immediate response | Verified publication, failure, unknown, or retry decision | Published merely because no error returned |
| Publication receipt | Verified native fact | Metrics observation and correction chain | Canonical copy mutation |
| Metrics snapshot | Time-bound observation | Recommendation, Capture, or analysis | Editorial truth |
| Recommendation | CONNECT interpretation | Accepted Capture or reviewed Series learning | Silent Series mutation |

### Durable boundary objects

The Lens needs eight durable cross-stage or cross-authority intermediates.
Other concepts may remain owner-native records, views, commands, or specialist
tools.

| Boundary object | Producer → consumer | Required contents | Explicit non-authority |
| --- | --- | --- | --- |
| **Authorized Fandom Projection** | Fandom → Lens/CREATE | Source ID/version, safe selected fields, restrictions, correction state, projection schema, receipt | Cannot mutate or fully reconstruct the private/domain record |
| **Creative Commitment Receipt** | CAPTURE/domain owner → CREATE | Selected source IDs/versions, safe excerpt/projection, target artifact ID/type, actor, timestamp, idempotency key | Does not move the source, require every Capture to become an artifact, or apply to direct-to-CREATE work |
| **Publication Package** | Fandom edition → CREATE | Immutable edition identity/version, exact assets/order, canonical copy, provenance/rights, release constraints, correction state | Does not transfer edition ownership or guarantee an external derivative |
| **Expression Draft** | CREATE → PLAN | Expression ID/version, platform/format, canonical copy, assets, source lineage, readiness | Is not a schedule, authorization, attempt, or publication |
| **Execution Request** | PLAN → EXECUTE | Exact expression/placement versions, account, schedule/condition, authorization, payload digest, idempotency key | Does not prove an attempt or publication |
| **Attempt Receipt** | EXECUTE → CONNECT/PLAN | Attempt ID, request key, executor, attempted/retried time, native response/reference, outcome class | A success-shaped response is not verified publication |
| **Verified Publication Receipt** | CONNECT → Lens/PLAN | Native account and ID, authenticated existence, verified `publishedAt`, optional URL, reconciliation evidence, correction state | Does not rewrite expression copy or source authority |
| **Learning Proposal** | CONNECT → CREATE/Series | Source receipt/snapshots, finding, confidence, limitations, recommended action | Cannot mutate Series, Idea, or source without explicit acceptance |

### How the lifecycle surfaces change

#### Capture

CAPTURE is the Lens-organized intake module for material that matters in a
domain without implying a future deliverable. Under CDRAMA it can organize
observations, questions, links, screenshots, reactions, canon clues, audience
signals, and fragments by drama, actor, character, episode, scene, Series,
journal, evidence type, or source.

It is not a universal unsorted Creator OS inbox, and it does not require a
platform, format, or publication commitment.

CAPTURE is also not one canonical record type. It routes each action to the
record and owner whose rules give that action meaning:

```text
CAPTURE module
├── private freeform observation → Creator OS Capture
├── episode-bound first-watch entry → Fandom First-Watch Journal
├── sealed veteran evidence → Fandom evidence record
├── Waiting Room canon contribution → Fandom Waiting Room workflow
└── source or audience signal → its authorized source/evidence owner
```

Filing a First-Watch entry through CAPTURE therefore does not create a generic
Creator OS Capture first, and it does not place the entry in a queue for CREATE.
The journal entry is already a complete, protocol-bound record.

Domain protocols remain domain-owned:

- “Capture this thought” creates a Creator OS Capture.
- “File this First-Watch entry” invokes Fandom and applies chronology/spoiler
  rules.
- “Submit this Waiting Room evidence” invokes Fandom evidence/contribution
  rules.
- “Preserve this Misprint” invokes separate collectible and correction
  contracts.

The Lens may offer these actions together because context is shared. It may not
store them as one undifferentiated Journal.

CAPTURE → CREATE is optional and explicit. It occurs only when Katie commits
selected material to a definite made thing that now needs editorial or
production work:

```text
selected CDRAMA material
        │ Katie commits it to a post or another definite artifact shape
        ▼
Editorial Idea, Rednote post, Instagram carousel, YouTube Short,
article, guide section, game, website expansion, or visual treatment
```

The original Capture remains intact. CREATE receives only the selected
authorized material and lineage. A Capture may instead remain a private
observation, chronological journal record, domain evidence, audience pattern,
source reference, or undeveloped possibility.

For a protocol-bound record such as First Watch, promotion selects a passage
and creates an additive derivative. The entry itself remains in the Journal and
does not become an editable draft or inherit an expectation of publication.

Some domain actions bypass CREATE entirely because they govern domain truth
rather than shape a creative output: filing a First-Watch entry, recording a
clock-in, correcting canon metadata, moderating evidence, and changing a domain
lifecycle state.

#### CAPTURE → CREATE boundary

This boundary is **creative commitment**, not generic promotion. It exists only
when Katie decides:

> This selected material should become a definite made thing, and it now needs
> shaping work.

The handoff:

```text
selected authorized Capture/domain material
+ chosen artifact class and initial creative intention
+ explicit actor decision
        ↓
new or linked CREATE artifact
+ additive source lineage
+ promotion receipt
```

The receipt records the selected source IDs and versions, safe excerpt or
projection, target artifact ID and type, actor, timestamp, and idempotency key.
The source remains in CAPTURE or with its domain owner; the new artifact may
change independently without rewriting it.

This boundary is optional:

- most Captures and domain filings never cross it;
- a selected passage may cross without moving the surrounding record;
- one source may produce several differently shaped artifacts;
- several authorized sources may support one artifact;
- an inherently post-shaped intention may begin directly in CREATE and has no
  CAPTURE → CREATE receipt.

Stale, corrected, withdrawn, private, or newly unsafe source material must
block or flag the handoff according to the source owner's rules. The boundary
cannot widen a projection merely because CREATE would find more context useful.

For example:

```text
Creator OS → CDRAMA → Nian Wushuang → Waiting Room
```

may render:

- Fandom public state, canon evidence, and clock-in aggregate;
- CREATE private dispatches;
- Creator OS Editorial Ideas;
- last/next external expressions and PLAN placements;
- CONNECT-verified publication and performance;
- website-expansion contributions awaiting Fandom action.

Its actions preserve authority:

| Action | Route |
| --- | --- |
| Clock in | Fandom command |
| Add canon evidence | Fandom contribution workflow |
| Write private dispatch | Creator OS CAPTURE |
| Turn into an Idea | Creator OS additive promotion |
| Make Rednote post | CREATE Platform Expression |
| Schedule | PLAN |
| Review performance | CONNECT |
| Repair malformed evidence | Diagnostics specialist link |

#### CREATE

CREATE becomes an embeddable engine inside the Lens rather than a distant
Workstation destination:

```text
Series + selected sources + Idea + Treatment
→ expression workbench
→ versioned Platform Expression
```

CREATE accepts two legitimate starts:

1. **Promoted material:** Katie commits a selected Capture or authorized domain
   passage to a definite artifact—editorial, website expansion, post, guide,
   game, or other shaped work—that now needs development.
2. **Inherently shaped intent:** Katie already knows she is making a post,
   article, carousel, video, or other artifact and begins directly in CREATE.

Neither path is more canonical. CREATE requires a shaped work intention, not a
ceremonial Capture record.

The existing Workstation continues to own drafts, media preparation, copy,
titles, tags, and art direction. “Send to Workstation” survives only as a
compatibility label or deep link during migration. The durable concept is
“create or continue an expression.”

CREATE also authors Domain Contributions, but acceptance and publication remain
with Fandom. It cannot edit First-Watch history, Waiting Room public state,
Vibe Atlas approvals, or published manifests.

#### PLAN

PLAN narrows to placement and authorization for external expressions:

- select expression version;
- choose platform/account;
- prioritize and sequence;
- receive or revise an admitted placement schedule;
- authorize execution;
- hold/cancel before attempt.

The **CREATE → PLAN boundary is schedule admission**. In the current Creator OS
implementation, appearing in PLAN is `ScheduledDate`-gated, but CREATE cannot
assign that date arbitrarily. `Production Next Step = Ready for scheduling`
makes a committed Post eligible to cross; an explicit promotion/scheduling
action writes `ScheduledDate`; the resulting dated placement is the rendered
handoff object that PLAN can see and govern.

```text
committed Post in CREATE
→ explicit promotion or Ready for scheduling
→ schedule-setting handoff writes ScheduledDate
→ ScheduledDate admits the Post to PLAN
→ PLAN selects/rebinds the exact ready rendition and reviews the packet
→ Ready for publishing
→ explicit Publish packet ready consent
→ EXECUTE/PUBLISH boundary
```

These are separate gates:

| Gate | Meaning | What it does not prove |
| --- | --- | --- |
| `Ready for scheduling` | CREATE says the committed Post may enter schedule-setting handoff | It does not itself make the Post visible in PLAN |
| `ScheduledDate` | The placement now appears in PLAN | It does not prove packet completeness or execution consent |
| `Status = Ready` | Legacy/compatibility PLAN readiness signal | It does not replace rendition, media, caption, title/cover, or packet validation |
| `Ready for publishing` | The assembled work's next action is publication | It does not authorize automation |
| `Publish packet ready` | Explicit packet-level automation gate | It does not prove an attempt or publication |

It stops pretending that every CDRAMA output is a Post. Domain-native releases
use their own release conditions and records. The Lens composes both external
PLAN placements and domain-native release status without merging their stores.

The current Posts DB may remain a compatibility adapter for social expressions.
Its long-term schema should not determine the Lens information architecture.

#### EXECUTE and PUBLISH boundaries

EXECUTE and PUBLISH are rendered contract boundaries between PLAN and CONNECT.
They are not Creator OS surfaces, tabs, workspaces, or content stores.

**EXECUTE** marks the handoff when a human or integration attempts the exact
action PLAN authorized. Its discrete Attempt Receipt represents:

- operator versus automated mode;
- authorized payload and version;
- attempt time, retry time, and retry reason;
- idempotency identity;
- native response;
- failure, success-shaped response, or ambiguous outcome.

**PUBLISH** marks the handoff when execution produces—or claims to have
produced—a platform-specific public artifact. Its discrete native-result
evidence represents the post's media, format, account/platform placement, and
available native identity. It does not create a new Idea merely because the
expression changed shape for a platform.

```text
one Editorial Idea
→ one or more versioned Platform Expressions
→ one or more PLAN placements
→ discrete EXECUTE/PUBLISH boundary artifacts
→ CONNECT verification, reconciliation, and publication projection
```

Every adapter returns compatible attempt and native-result receipts. Platform
credentials and raw private responses remain outside the Lens projection.
PLAN may render the action before and during handoff. CONNECT renders the
resulting attempt, reconciliation, public state, and exception history.

#### CONNECT

CONNECT answers:

> What happened after authorization, what now exists publicly, what does the
> evidence mean, and what should we consider doing next?

It is a first-class Creator OS capability with three separately visible
concerns:

1. **Publication truth:** establish or correct what exists publicly, where, in
   which version, with which lineage, native identity, and correction state.
2. **Performance evidence:** append-only metrics snapshots and safe audience
   themes.
3. **Learning:** recommendations and Captures returned to CAPTURE, CREATE, or
   Series for explicit review.

“Published” remains two coordinated ledgers rather than one overloaded status:

| Ledger | Owner | Truth represented |
| --- | --- | --- |
| Domain Public Editions | Fandom | Immutable Daily Drop, First-Watch publication, Waiting Room state/contribution, correction/supersession |
| External Publications | CONNECT verifies; native platform supplies the fact | Verified Rednote/Instagram/Weibo/YouTube native posts linked to exact expressions |

CONNECT composes their safe projections into one lineage view. It does not
collapse them into a single boolean, transfer Fandom publication authority, or
require one publication branch for the other to be complete.

CONNECT does not own technical Data Health. The current Audience Evidence panel
therefore decomposes:

```text
editorial behavior and performance
→ CONNECT Signals

instrumentation gaps, malformed blobs, cache/storage health, repair
→ Diagnostics
```

### Release Desk decomposition

The current Release Desk is a useful compatibility shell, but its contents
separate by authority:

| Current capability | Permanent home |
| --- | --- |
| Inventory | Fandom Operations → Approved Candidates |
| Production | Fandom Operations → Production Readiness |
| Manual Daily Drop channel receipts | CONNECT → External Publications, after expression/native lineage exists |
| Saved-grid Workstation handoff | Compatibility action; replaced conceptually by source/edition → CREATE expression |
| Audience event summary | CONNECT Signals |
| Instrumentation quality and dataset export | Diagnostics |
| Future Published view | Fandom Operations → Public Editions |
| Future Held / retired view | Fandom Operations → Held / Retired |
| Future embedded PLAN schedule | **Does not move into Fandom.** Lens composes external PLAN beside Fandom release state |

This supersedes the earlier proposal to make external PLAN permanently a
Release Desk subview. That proposal predated the six-case authority model.
Compatibility navigation may remain, but ownership does not move.

### Scheduling and operations naming rulings

There is no universal domain scheduler. Every domain-native output declares one
release condition owned and evaluated by its domain:

| Release condition | Example | Authority |
| --- | --- | --- |
| Calendar-triggered | Daily Drop at an approved publication time | Fandom publication |
| Boundary-triggered | First-Watch evidence becomes safe after an episode boundary | First-Watch domain |
| Event-triggered | Official announcement changes Waiting Room state | Waiting Room domain |
| Manual authorization | Guide, correction, or website contribution is approved | Relevant Fandom editorial authority |
| Immediate | Safe approved correction or dispatch should take effect now | Relevant domain authority |

External platform timing remains PLAN-owned. The Lens may place both kinds of
timing on one contextual timeline, but it does not route domain conditions
through Posts DB.

**Fandom Operations** names the authority plane and service boundary; it is not
a proposed Creator OS tab. Release Desk remains a temporary compatibility shell
while Fandom-owned capabilities become independently projectable modules:

```text
Fandom Operations
├── Vibe Atlas Curator Lab
├── Approved Candidates
├── Production Readiness
├── Public Editions
├── Held / Retired
├── First-Watch moderation and publication
└── Waiting Room moderation and domain state
```

Posts DB remains a compatibility adapter for external Platform Expressions.
It must not become the canonical store for Domain Contributions, Domain State
Changes, domain-native release conditions, or general non-social work.

### Temporal and provenance semantics

The Lens uses an event timeline rather than one overloaded date:

| Field | Owner | Meaning |
| --- | --- | --- |
| `capturedAt` | Capture/domain intake | Observation entered the system |
| `observedAt` | Source/CONNECT | Source fact or metric was observed |
| `filedAt` | Domain protocol | Journal/evidence record became immutable |
| `composedAt` | CREATE | Expression version was completed |
| `approvedAt` | Domain/CREATE authority | Exact candidate, contribution, or expression was approved |
| `readyAt` | Production owner | Required readiness gates passed |
| `scheduledAt` | PLAN/domain scheduler | Intended native execution/release time |
| `authorizedAt` | PLAN/domain authority | Exact action was allowed |
| `attemptedAt` | EXECUTE | Native action was attempted |
| `retriedAt` | EXECUTE | A later linked attempt began after retry authorization |
| `publishedAt` | CONNECT for external platforms; domain publisher for native editions | Authenticated native publication time |
| `reconciledAt` | CONNECT | Native fact was matched to internal lineage |
| `measuredAt` | CONNECT | Metrics snapshot was observed |
| `correctedAt` | Owning authority | Additive correction took effect |
| `supersededAt` | Owning authority | A successor became current |

No mapping layer may substitute `scheduledAt` for `publishedAt`, infer
`attemptedAt` from authorization, or rewrite an earlier timestamp after retry.

Every cross-system object carries a provenance envelope appropriate to its
stage:

```text
object ID and version
origin system and record type
source IDs and versions
actor / authority
content or payload digest
idempotency / action key
created and effective timestamps
correction / supersession state
receipt IDs
projection schema version
```

That envelope is how the Lens can be coherent without centralizing truth.

### Lens placement pass conditions

The Creator OS CDRAMA Lens view is valid only while:

1. Fandom remains operable when Creator OS is unavailable.
2. Creator OS remains operable for other projects when Fandom is unavailable.
3. Lens projections fail visibly and never become editable stale copies.
4. Every domain mutation travels through an authorized command and returns a
   durable receipt.
5. Private domain data is not transferred merely because a related record is
   visible.
6. CREATE/PLAN/CONNECT records retain source version and provenance.
7. The Lens can show both domain-native and external publication without
   collapsing their authority.
8. Diagnostics remain outside editorial decision-making.

If implementation cannot maintain these conditions, the remedy is a narrower
projection or specialist link—not a shared database or duplicated owner.

## Unresolved-decisions register

| Decision | Why unresolved | Evidence needed | Decision point |
| --- | --- | --- | --- |
| YouTube derivative support | Shorts, long-form video, and community posts have different asset, treatment, execution, and receipt requirements | Real intended YouTube treatments and Case 6 execution lessons | Before adding YouTube to any platform enum |
| Projection transport | Required read models and commands are known, but API ownership, authentication, caching, and partial-failure behavior are not | Paper cockpit using real records and host-decision pass conditions | Before implementation planning |

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

## Gate after case law

All six cases have passed. Proceed in this order:

1. ~~Decide the CDRAMA Lens's placement.~~ **Complete: a selectable view across
   Creator OS lifecycle surfaces, not a separate workspace.**
2. ~~Map every current Fandom operator control to its future surface.~~
   **Complete: capability-placement and Release Desk decomposition above.**
3. Draw a paper cockpit using real records.
4. Operate several representative outputs manually through that cockpit.
5. Identify repeated friction.
6. Evaluate the smallest implementation justified by that friction.

Until the paper-cockpit evaluation is complete: no UI, schema, or migration
work.
