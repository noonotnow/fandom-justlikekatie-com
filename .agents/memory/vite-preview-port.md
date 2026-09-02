---
name: Vite preview port
description: Replit webview workflows require the Vite development server to expose the configured webview port.
---

Use port 5000 for the Vite server and the Start application webview workflow; leaving Vite on its 5173 default can make the workflow appear running while the preview is unreachable.

For parallel in-process Vite browser tests, do not use `port: 0` expecting an OS-assigned port: this Vite version treats the falsy value as its 5173 default. Start from a shared base port with `strictPort: false` and read the bound address after `listen()` so Vite handles collisions atomically.

**Why:** The workflow can retain a stale port expectation after configuration changes, producing a successful-looking server with a blank or refused preview.

**Why:** The workflow can retain a stale port expectation after configuration changes, producing a successful-looking server with a blank or refused preview. Browser test probes also have a release-to-bind race, while Vite's fallback retries the bind itself.

**How to apply:** When validating a Vite web app in this workspace, check both vite.config.ts and the workflow waitForPort value before troubleshooting application code. For browser tests, use Vite's non-strict fallback rather than probing and releasing a port.