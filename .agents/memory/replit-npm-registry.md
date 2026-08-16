---
name: Replit npm registry in lockfile
description: package-lock.json generated in Replit uses an internal proxy URL that breaks npm ci outside Replit
---

## Rule
Whenever `package-lock.json` is committed from inside Replit, it will contain `http://package-firewall.replit.local/npm/` resolved URLs. `npm ci` in GitHub Actions (or any external CI) fails with `EAI_AGAIN` because that hostname is unreachable.

**Why:** Replit's global npm config sets `registry=http://package-firewall.replit.local/npm/`. This is baked into resolved URLs in the lockfile during `npm install`.

**How to apply:** Before pushing a lockfile that will be used in external CI:
1. Delete `package-lock.json`
2. Run `npm install --registry https://registry.npmjs.org`
3. Check for stragglers: `grep -c "package-firewall.replit.local" package-lock.json`
4. If any remain (packages cached before the flag): `sed -i 's|http://package-firewall.replit.local/npm/|https://registry.npmjs.org/|g' package-lock.json`
5. Verify with `npm ci` locally before pushing
