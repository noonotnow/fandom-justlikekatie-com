---
name: Pre-baseline Collection conflicts
description: Safety boundary for records downloaded before the client stored sync acknowledgments.
---

Records synced by older clients have server identity and a cursor but no reliable snapshot of their last-synced contents. A later tombstone cannot prove whether the local copy was untouched or edited offline before upgrade. Preserve ambiguous local copies and defer their upload until the person explicitly chooses restoration, rather than silently deleting possible edits or reviving a remote deletion.

**Why:** Cursor and server identity establish that the record existed, not whether its current local contents have unsynced edits. Neither a timestamp nor the tombstone can recover the missing baseline.

**How to apply:** Reconcile against the server before first post-upgrade upserts. Treat edits explicitly recorded before the tombstone as intentional; once a conflict is recorded, subsequent ordinary edits must not implicitly resolve it. A restore needs a fresh mutation identity (including Legendary grids whose mark timestamp stays fixed); discard must not send another remote deletion. Keep choices scoped to the signed-in account.