# Vibing Now focus transition — review candidate

## What changes

- Where the Mask Ends becomes the current introduction on the existing Vibing Now landing page.
- Against the Current receives a lasting Field Journal at `/cdrama-fandom/vibing-now/field-journals/against-the-current/`.
- The homepage and fandom guide distinguish the current focus from the continuing journal.
- All eleven registered reading URLs remain unchanged. No article bodies, dates, images, spoiler boundaries, Notion records, CREATE records or publication receipts are edited.
- The existing Against the Current soundtrack guide remains linked. No new music guide, video, pack, Post or thread is fabricated.

## Copy and provenance

The Where the Mask Ends introduction is the existing three-paragraph working introduction in the CREATE website draft and its linked Notion handoff. The short spotlight headline/lede and navigation labels are proposed presentation copy for review.

The Field Journal uses the approved review framing, including “The closing readings are in. The journal stays open.” Its scope sentence says “from the opening episodes through the closing chapters,” rather than “from Episode 21,” because the existing public shelf also includes the 1–6, 7–14 and 15–20 readings. This small correction is explicitly submitted for editorial approval; it is not represented as previously approved verbatim.

Journal choices use event-free episode ranges. The final choice clearly declares ending spoilers and does not expose the ending-sensitive essay title. The two closing readings stay separate. Future work does not block the transition.

The Episode 16 argument, scene quotations, images, soundtrack expansion and separate Guo Yufeng video remain outside this release. This introduction does not settle the structure of the future through-Episode-16 work.

## Release boundary

This is a PR review candidate, not a live transition or publication approval. The creator must review the exact introduction, framing change and presentation before a merge that publishes them. Do not infer permission to publish a companion Post, change any private record, or migrate all `/c-drama-fandom/` URLs.

The new journal deliberately uses `cdrama`. Existing reading, asset and tool paths keep their current addresses. There is no blanket redirect or canonical migration.

## Checks

Run `node --test scripts/vibing-transition.test.js` for focused route, schema, discovery, episode-choice and spoiler-separation checks. Existing public-page, closing-reading and revised-reading tests follow the journal rather than assuming Against the Current is still the current spotlight.

The canonical repository's complete required checks and independent review still apply. A local focused check does not establish a successful hosted build or publication. After an approved release, verify the current page, journal, eleven existing readings, soundtrack link and MemeForge link at the custom domain.
