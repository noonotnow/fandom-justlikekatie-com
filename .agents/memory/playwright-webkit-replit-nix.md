---
name: Playwright WebKit on Replit Nix
description: Why Playwright WebKit needs a Replit-specific runtime-library launch path.
---

Playwright’s Linux WebKit host check uses `ldconfig` for dlopen-only libraries, but Replit supplies native dependencies from the Nix store, which `ldconfig` cannot see. The downloaded WebKit launcher also replaces rather than extends `LD_LIBRARY_PATH`.

**Why:** Declaring all required Nix packages is not sufficient by itself: Playwright can falsely report missing libraries, and bypassing that check alone still lets the downloaded wrapper hide Nix libraries from WebKit.

**How to apply:** On Replit only, bypass Playwright’s incompatible host preflight, launch the bundled MiniBrowser directly with its bundle paths plus `REPLIT_LD_LIBRARY_PATH`, and retain a real launch probe so genuinely missing binaries or libraries still fail with actionable output. Declare required package outputs without `.out` so Replit includes them in that explicit runtime-path handoff; never recover them by scanning `/nix/store` filenames.