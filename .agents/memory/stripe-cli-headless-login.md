---
name: Stripe CLI headless login
description: Live Stripe CLI authorization and credential-cleanup constraints in a headless Replit workspace.
---

The Nix-packaged Stripe CLI can complete browser pairing yet fail live API calls with “No directory provided for file keyring.” A current official CLI device flow can work, but when the system keyring is unavailable it may store credentials unencrypted in its configuration directory. Treat a successful login message as insufficient: verify a read-only **live** request against the intended account before any live action.

**Why:** A browser approval succeeded while the packaged CLI could not read the live account. A newer device authorization worked but warned that its local credential storage was unencrypted.

**How to apply:** For an explicitly authorized live operation, use a checksummed official CLI release if the packaged one hits the keyring error. Keep its home and configuration in a dedicated temporary directory outside the project, check account and mode with a read-only call, avoid logging credentials and billing identifiers, then log out and remove the temporary files. Never put pairing codes or tokens in project memory.