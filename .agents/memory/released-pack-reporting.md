---
name: Released-pack reporting boundary
description: Why production released-pack funnel reporting needs an independently operable aggregate destination.
---

Production released-pack funnel reviews must use an authorized aggregate reporting source on the external Netlify site, not the authorized but empty Replit Publishing dataset. Keep visitor-level details out of this source, and do not treat collection as evidence of conversion until a dated live bundle and real post-deployment traffic have been verified.

**Why:** The external site can have a configured browser Google tag without an available aggregate GA reporting grant; Replit's injected tracker does not cover the Netlify deployment. An older live bundle can also omit newer instrumentation entirely.

**How to apply:** Check the actual live asset for the event contract, use only admin-authorized date-bounded suppressed aggregates, and label starts separately from verified activations. Never infer a zero rate from an unobserved or suppressed group.