# CREATE → Fandom Renditions

CREATE owns canonical Series, Developed Ideas, Artifacts, Renditions, their
versions, and editorial lifecycle. Fandom owns website publication truth,
actor/Vibe Atlas relationships, Pack Verdicts, and learning projections.

## Boundary

1. CREATE authorizes a `fandom-website` Rendition and exposes a
   `create.fandom-rendition-handoff.v1` projection.
2. An authenticated operator or configured integration submits that projection
   to `POST /api/fandom-renditions`.
3. Fandom stores the projection immutably by Rendition ID and version. Replaying
   the same projection is safe; changing an existing version is a conflict.
4. A Fandom admin publishes the destination expression and submits the complete
   `create.fandom-rendition-receipt.v1` to `PUT /api/fandom-renditions`.
5. Fandom returns the exact receipt to the caller. The authenticated
   orchestration layer records it in CREATE, which verifies the lineage and
   advances the canonical Rendition from authorized to published.

Fandom does not forward a Cloudflare Access operator assertion to CREATE and
does not call CREATE with a fabricated service credential. CREATE's current
receipt route is operator-owned and scoped by the Access JWT subject.

## Authorization

Inbound handoffs accept either:

- a same-origin Fandom admin session; or
- an `Authorization` header carrying the optional configured bearer integration
  token.

Listing staged Renditions and recording publication receipts always require a
same-origin Fandom admin session. A publication receipt URL must use the
configured Fandom public origin.

## Editorial authority

`domainHints` are targeting hints. They never create a Pack Verdict, approve a
Vibe Pack, or modify the Atlas. Known packs use Fandom's canonical
`{actorId}:{vibeIndex}` keys. A slug-shaped unknown key is retained as a
proposed target so an airing drama can inspire a new pack.

Receipt projections are explicit Fandom editorial decisions:

- `confirm`, `stretch`, and `contradict` require an existing Vibe Pack owned by
  the same actor.
- `propose` may name a new slug-shaped Vibe Pack key.

Changing an Artifact's purpose, thesis, or editorial promise is not a new
Rendition. It must return to CREATE as a sibling Artifact.
