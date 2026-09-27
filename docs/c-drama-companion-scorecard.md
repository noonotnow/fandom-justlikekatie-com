# C-drama companion pilot: decision scorecard

**Status:** Pre-launch template. No baseline or 30/60/90-day outcomes have been measured here. Start the clock only after an actual production release and reporting access are confirmed. Directional audience estimates in the feedback document are hypotheses, not first-party results.

**Owner and capacity gate:** Reporting owner, editorial reviewer, rights reviewer, and moderation host: **unassigned**. Do not publish new boards, maps, or episode notes until an owner records sources, permissible media rights, spoiler boundary, and review date. Existing guides, daily drops, and Watch Journal remain available. No watch event without a host and spoiler policy.

| Window | Qualified visits by discover/context/collect path | Consented opt-ins by path | Interviews | Saves and 7-/30-day returns | Membership page / checkout starts / confirmed paid | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| Baseline | Not measured | Not measured | Not measured | Not measured | Not measured | Verify production reporting and launch date |
| Day 30 | Not measured | Not measured | Not measured | Not measured | Not measured | Pending: compare interest with denominator and interview context |
| Day 60 | Not measured | Not measured | Not measured | Not measured | Not measured | Pending: rights, use, retention, and upkeep review |
| Day 90 | Not measured | Not measured | Not measured | Not measured | Not measured | Pending: continue, narrow, or stop |

## Reporting contract

- **Qualified visit:** a production visit to one of the three guide sections by a human reader, excluding staff, QA, bots, and duplicate views in a session. The client emits `companion_path_view`, but raw events alone do **not** establish unique qualified people. Use authorized production aggregates and document filters, period, and denominator. If unavailable, mark “not measured”; never substitute local tests.
- **Interest:** the server stores separately checked email consent and the selected path; no mail is sent by signup. A client `companion_interest_click` is a directional interaction, **not** a confirmed opt-in. Count confirmed records through an authorized, deduplicated, privacy-preserving production report before calculating conversion. Unsubscribe removes the record.
- **Return and use:** derive cohort 7-/30-day return and saves from an approved aggregate source and an agreed privacy-safe visitor definition. Cross-device attribution and guide completion are not yet instrumented: “not measured,” not zero.
- **Paid intent:** membership view and checkout-start events can carry a same-tab pilot path. A checkout-start is not payment. Do not claim path-attributed purchases until billing confirmation is joined through an authorized, privacy-safe server-side method. Record confirmed purchase totals separately if attribution is unavailable.
- **Interviews:** invite 15–20 engaged fans if recruitment is possible, record method, consent, sample size, existing alternatives, and what they already pay for. Not yet recruited.
- **Decision rule:** 3–5% visitor-to-opt-in is a provisional planning trigger, not a benchmark. If qualified traffic is too low or reporting is unavailable, extend or narrow the test rather than choose a winner. Review editorial hours and support load alongside utility and paid intent. Annual plans, dossiers, and staffed events require a separate go/no-go review.

Incremental 90-day capacity estimate: engineering **18–26 person-days**, editorial/rights **19–26**, research/operations **6–9**, excluding daily publishing and existing work. Lean capacity (one engineering day and six editorial hours weekly) means entry paths, interviews, at most 1–2 reviewed boards and one note; defer maps, events, and new paid products.