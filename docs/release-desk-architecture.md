# Release Desk Architecture Proposal

**Status:** Approved through Phase 2. Inventory and receipt-backed Production
readiness are implemented; Schedule remains independently owned by PLAN.

## Decision summary

Release Inventory should become the first view inside a private **Release Desk**
within the Fandom Vibes **Operator Console**. It should not remain embedded in
Actor Preflight, become an isolated inventory tab beside PLAN, or be placed in
Creator OS Workstation.

The product boundaries are:

```text
Fandom Vibes
├── Public experience
│   ├── Daily Drop
│   ├── Archive
│   └── Public/shareable editions
├── Member experience
│   ├── Collection
│   ├── Native Grid Builder
│   └── Native export and sharing
└── Operator Console (private)
    ├── Release Desk
    │   ├── Inventory
    │   ├── Production
    │   ├── Schedule
    │   ├── Published
    │   └── Held / retired
    ├── Actor Preflight
    ├── Field Journal
    └── Court Rulings

Creator OS (separate product)
└── Workstation
    ├── Cross-product assets
    ├── Channel production
    ├── Scheduling and distribution
    └── Analytics
```

**Admin** is an access boundary, not a product identity. It unlocks the
private Operator Console. **Workstation** is a Creator OS interface, not the
Fandom Vibes member or operator interface.

## 1. Existing components and data owners

| Capability | Current owner | Long-term owner | Notes |
| --- | --- | --- | --- |
| Public Daily Drop and Archive | Vibe Atlas app and daily-drop data | Fandom Vibes public experience | Only published material is public. |
| Saved cards and grids | Collection and its local/account stores | Fandom Vibes member experience | This remains native to Fandom Vibes. |
| Native grid building, export, and sharing | Collection / Grid Builder | Fandom Vibes member experience | Creator OS is optional, not a prerequisite. |
| Actor identity and Vibe Pack pairing evidence | `ActorPreflightLab` and actor-audit data | Actor Preflight | Preflight owns evidence, calibration, and editorial board formation. |
| Release readiness and repeat-actor indicators | Release Inventory panel and actor-audit response | Release Desk | The indicators are derived from current fail-closed eligibility receipts and Daily Drop history. |
| PLAN scheduling | PLAN component and PLAN integration | Release Desk → Schedule | PLAN remains independently accessible during the staged migration. |
| Field notes and first-watch observations | Field Journal | Field Journal | Not a production queue. |
| Editorial precedent and policy | Court Rulings | Court Rulings | Not a release queue. |
| Draft shaping and cross-channel distribution | Creator OS handoff / Workstation | Creator OS | Fandom Vibes may hand off a publication package, but does not depend on it for native sharing. |

No current data store should be renamed, deleted, or rewritten as part of the
first Release Desk step.

## 2. What becomes Release Desk

The existing Release Inventory presentation is the seed of **Release Desk →
Inventory**. It should be extracted from Actor Preflight into a Release Desk
container that can later host the rest of the publishing lifecycle.

The first Release Desk view retains:

- Count of current release-ready actor × Vibe pairings.
- Fresh-curator and rescue-backed pairing counts.
- Explicit publishable rescue-board counts.
- Actor-pack breakdowns.
- Last actor Daily Drop usage.
- Repeat-actor watch and pair-repeat dates.
- The current next-operator-cutoff context.
- The private editorial-context notice.

Release Desk answers the operational question:

> What can ship, what needs work, and what ships next?

It does not re-run curation or reinterpret the evidence that made a board
eligible.

## 3. What moves out of Actor Preflight

Actor Preflight should retain the work required to decide whether a pairing can
produce a publishable candidate:

- Actor profiles and pairing selection.
- Query ladders and bounded raw evidence.
- Identity and event-family analysis.
- Curator proposals and board comparison.
- Rescue-board creation and calibration evidence.
- Human blind-review choices and disagreement notes.
- Exact-board approval and immutable verdict receipts.

The Release Inventory panel, its inventory-specific loading state, and its
inventory-specific presentation should move out of the Actor Preflight
workspace. Preflight may still show a compact link or handoff affordance to
Release Desk after an approval, but it should not own release readiness.

The boundary is:

> Actor Preflight produces an immutable approved publication candidate.
> Release Desk determines whether that candidate is operationally ready to
> ship.

An approval or a curator failure must not silently erase a candidate from
Release Desk. The candidate and its receipts remain inspectable while its
production state changes.

## 4. What moves from PLAN schedule

PLAN is the existing scheduling integration and must remain independently
accessible during the first migration phase. Its current behavior and
reconciliation receipts are not changed by introducing Release Desk.

The target Release Desk structure is:

```text
Release Desk
├── Inventory       current release-ready candidates and repeat-use context
├── Production      asset, enhancement, copy, and render readiness
├── Schedule        PLAN scheduling and reconciliation
├── Published       immutable published editions
└── Held / retired  explicit operational and editorial retirement states
```

When Schedule is eventually moved under Release Desk, preserve a compatibility
entry point for the existing PLAN route or deep link until all operators and
automations use the new route. The migration must not duplicate or split
scheduling truth between two screens.

## 5. What remains unchanged

The following boundaries and contracts remain unchanged while the proposal is
reviewed and staged:

- Admin authentication and the private/noindex boundary.
- Fandom Vibes public routes and public payloads.
- Member Collection and native Grid Builder behavior.
- Native image download and device share behavior.
- Actor-audit evidence, immutable audit receipts, and human confirmations.
- Exact approved-board arrangement and hero position.
- Current release-readiness and repeat-actor calculations.
- Existing PLAN integration behavior and scheduled items.
- Historical published editions and archive behavior.
- Field Journal and Court Rulings ownership.
- Optional Creator OS publication-package handoff.

Fandom Vibes remains useful if Creator OS or Workstation is unavailable. Creator
OS remains useful without Fandom Vibes by operating on other brands and
projects.

## 6. Route and deep-link behavior

Admin access should continue to enter through the existing private Vibe Atlas
admin boundary. The first implementation should use an internal Operator
Console view state rather than creating a public route or exposing a query
parameter that makes operational data crawlable.

Proposed future navigation:

```text
/vibe-atlas?admin=true
  → Operator Console → Release Desk → Inventory
  → Operator Console → Release Desk → Production
  → Operator Console → Release Desk → Schedule
  → Operator Console → Actor Preflight
  → Operator Console → Field Journal
  → Operator Console → Court Rulings
```

Deep links for a selected actor × Vibe pairing or exact release candidate should
be added only after the candidate identifier and authorization behavior are
defined. They must:

- Require the same operator authorization as the console.
- Fail closed when the candidate is missing, retired, or not available to the
  operator.
- Never expose audit evidence, rejected images, rights notes, or internal
  receipts through public URLs.
- Preserve browser back/forward behavior when view state is eventually
  reflected in the URL.

Until those contracts exist, the console may keep view selection in local
React state, as it does today.

## 7. Release states and persistence rules

Release Desk needs to distinguish editorial approval from production readiness.
The exact state names may be refined during implementation, but the lifecycle
must cover these milestones:

1. Editorially approved.
2. Exact nine frozen.
3. Source and provenance reviewed.
4. Production assets secured.
5. Enhancement scrub complete.
6. Final render verified.
7. Copy complete.
8. Schedule eligible.
9. Scheduled.
10. Published.
11. Held or retired.

These states must be append-only or receipt-backed wherever they affect
publication history. A UI extraction must not infer a new state by mutating an
old audit receipt.

### Hold

A hold temporarily removes an otherwise approved candidate from scheduling.
Examples include missing assets, incomplete enhancement, seasonal timing, copy
work, or an intentional same-actor spacing decision. The approved board and
history remain intact, and the hold reason is recorded.

### Edition retirement

Retiring an exact edition removes it from active scheduling while preserving its
approval history, board arrangement, and reason. It may optionally point to a
replacement.

### Pairing retirement

Retiring an actor × Vibe pairing prevents future suggestions for that pairing.
Existing editions remain historical. This does not retire the actor or Vibe Pack
globally.

### Vibe Pack retirement or rename

This is a broader editorial decision. Published editions and member saves
remain readable, while future curation follows the successor or replacement
rule. A rename must preserve predecessor history.

### Rights withdrawal

Rights withdrawal is distinct from editorial retirement. Public assets may need
to be removed or replaced, and cleared member surfaces may need updating, while
the private receipt and reason remain preserved. Publication history must not be
silently rewritten.

## 8. Operator Console and Creator OS boundaries

Fandom Vibes owns:

- The public Daily Drop and Archive.
- Member Collection and native Grid Builder.
- Native export, download, and device sharing.
- Actor/Vibe editorial evidence.
- Canonical exact-board approvals.
- Release Desk readiness, publication state, holds, and retirement.

Creator OS owns:

- Cross-product projects and assets.
- Multi-platform production.
- Caption and channel variants.
- Distribution scheduling and publication URLs.
- Distribution analytics.

The optional integration is a defined publication-package handoff:

```text
Fandom Vibes Release Desk
  → immutable publication package
  → Creator OS Workstation
  → channel variants, distribution, and analytics
```

A package may include the immutable edition ID, actor and Vibe Pack, Event or
Compiled label, exact nine-card arrangement, hero position, final render,
platform-safe variants, approved copy, credits, provenance/rights status,
release constraints, repeat-actor warning, and production status.

Creator OS must not re-run the curator, replace the approved nine, change the
canonical Vibe classification, approve an unapproved board, or become the only
way to download or share a Fandom Vibes edition.

If either service is unavailable:

- Fandom Vibes can still publish and share through its own approved/native
  paths.
- Creator OS can continue operating on unrelated projects.
- A failed optional handoff is visible as a handoff failure; it does not roll
  back Fandom Vibes approval or publication state.
- No hidden shared state should make either product appear to own the other’s
  workflow.

## 9. Staged migration

### Phase 0 — proposal and contract review

- Approve this document and the Release Desk vocabulary.
- Confirm the candidate identity, release-state persistence model, and future
  deep-link policy.
- Do not move production data or change public/member routes.

### Phase 1 — Release Desk shell

- Add Release Desk as a private Operator Console workspace.
- Make Inventory its first view.
- Extract the current inventory presentation from Actor Preflight.
- Keep PLAN schedule independently accessible.
- Add navigation regression coverage for Release Desk, Actor Preflight, PLAN,
  and the private boundary.

### Phase 2 — production readiness

- Implemented: production candidates are derived from current verified approval
  receipts and exact frozen boards.
- Implemented: production transitions append run-scoped receipts without
  rewriting Actor Preflight history.
- Implemented: asset, enhancement, render, copy, provenance/rights, and
  schedule-eligibility blockers are explicit.
- PLAN remains independently accessible and is still the scheduling source of
  truth.

### Phase 3 — schedule consolidation

- Add Schedule as a Release Desk view around the existing PLAN integration.
- Preserve a compatibility route and existing reconciliation behavior.
- Ensure one scheduling source of truth before removing any old navigation.

### Phase 4 — historical and exception views

- Add Published and Held / retired views.
- Add explicit hold, retirement, rights-withdrawal, and replacement receipts.
- Validate archive and member-save behavior against each exception.

### Phase 5 — optional Creator OS handoff

- Define and version the publication-package interface.
- Make handoff status observable without making it a publication prerequisite.
- Keep Fandom Vibes native export and share behavior independent.

## Approval criteria for implementation

Implementation can begin when the following are approved:

- “Release Desk” is the accepted operator-facing name.
- Inventory is its first view, not a permanent standalone sibling of PLAN.
- PLAN remains independently accessible during Phase 1.
- Actor Preflight remains the owner of evidence and exact-board approval.
- Release Desk becomes the owner of operational readiness and publication state.
- Fandom Vibes native member sharing and Grid Builder remain independent of
  Creator OS Workstation.
- No migration step deletes or rewrites immutable receipts or historical
  editions.