---
name: MemeForge example mechanisms
description: Durable comedy patterns learned from the user's Middle-earth meme references without preserving source captions or layouts.
---

# MemeForge example mechanisms

The reference set confirms that a Middle-earth joke usually needs a recognizable social behavior plus a sharp recontextualization:

- **Mundane task as epic decree:** a tiny action is framed with ceremonial gravity, then lands on an unexpectedly petty or precise object.
- **Reaction still as the turn:** the image should visibly perform confusion, offense, resignation, smugness, or judgment; it is not merely atmospheric scenery.
- **Sequential escalation:** multiple beats can move from setup to increasingly specific reactions, especially for group chaos, work fatigue, or a worsening plan.
- **Canon contradiction:** a character's stated promise, identity, or plan can be immediately undercut by what the story actually makes them do.
- **Relationship chemistry:** friends and family are funniest when one person makes a confident claim and the other punctures it with a deadpan correction, practical escalation, or shared scheme.
- **Delighted correction:** a fandom question can trigger an overprepared, pleased-to-be-right answer, but the answer should remain a compact comic beat rather than a lore lecture.
- **Fandom self-own:** the fan's own expertise, obsessive quoting, or overinvestment can be the target; the joke should expose the contradiction rather than praise fandom devotion.

## Reference batches as calibration

A batch of references should be treated as a **comedy calibration batch**, following:

`Study references → Extract mechanisms → Generate original mutants`

The extraction should remain separate from the source wording and composition:

- **Mechanism:** why the joke turns.
- **Caption shape:** the rhythm of the exchange, such as ordinary claim → reversal or reasonable statement → wildly overcommitted response.
- **Still function:** the social meaning already carried by a recognizable character or group. Examples include Boromir as grave impossible-task authority, Sam as intense support, Gollum as internal gremlin debate, Gandalf as an absolute boundary, the Council as too many opinions, Frodo as capacity exceeded, and Merry/Pippin as chaos or snack logic.
- **Failure modes:** inspirational poster, lore explainer, solemn virtue statement, generic feeling, or a still that supplies mood but does not perform the reaction.

**Why:** The examples repeatedly create a second beat through mismatch, interruption, escalation, or contradiction. A merely accurate Middle-earth mood still reads as a poster.

**How to apply:** During translation, resolve the user's mundane situation and the social behavior that makes it funny before choosing card copy. Use references for mechanism, caption rhythm, and reaction vocabulary only; never copy their wording, watermarks, multi-panel composites, or source-specific layouts. Reject or repair outputs that become inspirational, explanatory, solemn, or feeling-only. Keep the production default as the clean top-band / landscape-still / bottom-band frame unless a sequential treatment is intentionally selected.

## Human-native reaction search

The image search must look up the recognizable reaction still, not explain the joke:

1. Resolve the social use and performed reaction internally so the system knows what visual function it needs.
2. Search first with a canonical scene anchor: character + recognizable scene/action, such as “Gandalf you shall not pass bridge” or “Gandalf on bridge.”
3. Then try character plus visible emotion, other iconic-scene phrasings, and broad fandom-reaction fallbacks.
4. Never put the user’s mundane context, punchline, target behavior, or explanatory wording into a lookup query (for example, never “Gandalf on the bridge for blocking work emails”).
5. Rank results by whether the still visibly performs the reaction, has a clean crop and landscape composition, and can support the setup-to-punchline turn.

**Why:** The comedy explains what the image must accomplish, but it is not how a search engine indexes a recognizable movie still. Mixing them produces over-specific queries that return no usable images; a canonical scene anchor reliably retrieves the source material.

**How to apply:** Keep the visual brief intent-aware, but make its actual retrieval strings scene-first. Always lead the query ladder with curated reaction-still queries, then retain the generated variants and their exact provenance for broader coverage. Gandalf boundary cards lead with bridge/staff terms; Sam/Frodo cards lead with tired Mordor, worried Frodo, or Mount Doom carrying terms. Reject or repair search queries that leak workplace, schedule, email, abstract mechanism labels, or caption mutations such as road-trip snacks and emotional burden.

## Visual joke brief

The angle generator should produce a **visual joke brief** alongside the text joke. It describes what the image must be doing for the meme to land, rather than merely naming an asset:

- iconic scene or phrase
- character or group
- performed emotion
- action or relationship
- several Google-first search queries that combine those elements with the intended reaction

This is conceptually a sibling of `cardText`, not metadata added after image retrieval. Query variants should cover canonical scene language, character plus emotion, action or situation, and a broader reaction-use fallback. The brief should remain linked to the selected comic mechanism so the visual punchline and caption turn agree.

**Why:** The visual joke is the bridge between angle generation and good meme finding. Atmosphere searches produce quote-card imagery; reaction briefs produce images that can carry the punchline.

**How to apply:** Generate and validate the brief before source search. Reject candidates that match the franchise or character but do not perform the required reaction. Keep the brief original and functional; it may describe a recognizable scene or social role, but must not reproduce source captions, watermarks, or composite layouts.