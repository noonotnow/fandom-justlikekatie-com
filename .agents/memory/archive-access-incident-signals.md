---
name: Archive access incident signals
description: How archive access operations separate normal funnel activity from actionable denial and billing failures.
---

Archive access incident rates use aggregate authenticated server checks. Anonymous
preview views and sign-in gates remain funnel activity and must not enter the
incident denominator or trigger warnings.

**Why:** Public archive previews normally end at a sign-in gate. Treating those
expected outcomes as denials creates false spikes and hides real billing lookup
failures or unusual authenticated upgrade denials.

**How to apply:** Keep operational records immutable, bounded, and free of
customer/session identifiers. Require both a minimum count and a rate threshold,
and report billing delay separately from inactive-membership denial.