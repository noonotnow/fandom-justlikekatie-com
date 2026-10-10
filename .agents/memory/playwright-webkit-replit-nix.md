---
name: Playwright WebKit on Replit Nix
description: Why Playwright WebKit needs a Replit-specific runtime-library launch path.
---

Playwright’s Linux WebKit host check uses `ldconfig` for dlopen-only libraries, but Replit supplies native dependencies from the Nix store, which `ldconfig` cannot see. The downloaded WebKit launcher also replaces rather than extends `LD_LIBRARY_PATH`.

**Why:** Declaring all required Nix packages is not sufficient by itself: Playwright can falsely report missing libraries, and bypassing that check alone still lets the downloaded wrapper hide Nix libraries from WebKit.

**How to apply:** On Replit only, bypass Playwright’s incompatible host preflight, launch the bundled MiniBrowser directly with its bundle paths plus `REPLIT_LD_LIBRARY_PATH`, and retain a real launch probe so genuinely missing binaries or libraries still fail with actionable output. Declare required package outputs without `.out` so Replit includes them in that explicit runtime-path handoff; never recover them by scanning `/nix/store` filenames.

Keep that launch probe in the browser-test precheck, not the automatic post-merge setup. A launch can stall without diagnostic output on this container, timing out an otherwise successful dependency/browser-binary install; post-merge should verify binaries exist and return promptly.

A successful WebKit launch and local HTTP tests do not establish HTTPS support.

**Why:** The Nix MiniBrowser runtime can pass local UI/font checks but reject
production navigation with “TLS support is not available.”

**How to apply:** Keep local and live browser evidence separate. Report this
runtime limitation rather than treating it as an application failure or claiming
a live WebKit check passed.

Keep the EGL vendor manifest and DRI driver directory aligned with the Mesa
libraries supplied by the declared Replit runtime.

**Why:** The container can inherit graphics variables pointing at a newer Mesa
than the libraries on the WebKit launch path. WebKit then launches but closes
when creating a page, reporting that no EGL platform is supported.

**How to apply:** Resolve Mesa from the explicitly declared runtime directories
and use its sibling EGL vendor manifest and DRI directory. Do not scan the Nix
store or hardcode a store hash. Scope the setting to the verification browser;
no production app or graphics configuration needs changing. A shell-only
override is verification setup, not a durable fix to the shared launcher.
Clean release snapshots may lack a workspace-only launcher repair. A scoped
verification-process override can test the actual release UI without adding
that unrelated repair to the release; disclose the override in the evidence.

The Linux WebKit port may not arrow-scroll a programmatically focused overflow
region even when Chromium and Firefox do. Check native horizontal wheel
scrolling separately from focusability; do not replace the interaction with a
JavaScript scroll and claim keyboard coverage. Entering the region through Tab
from a different preceding control can restore its keyboard scrolling behavior.

**Why:** Focus and overflow support do not imply identical keyboard defaults
across the browser ports.

**How to apply:** State the interaction actually exercised and keep native
Safari-device keyboard behavior separate from local WebKit evidence.
The local MiniBrowser can also launch successfully but abort on the first page
with “Could not create EGL display: no supported platform available.”

**Why:** Launch alone does not exercise page-rendering graphics initialization.

**How to apply:** Require a successful page creation/navigation before claiming
WebKit verification. Keep an EGL startup failure separate from application
assertions. Compositing/software-rendering flags alone did not resolve a past
failure; check the Mesa alignment described above before repeating those flags.
