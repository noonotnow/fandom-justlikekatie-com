---
name: Vite preview port
description: Replit webview workflows require the Vite development server to expose the configured webview port.
---

Use port 5000 for the Vite server and the Start application webview workflow; leaving Vite on its 5173 default can make the workflow appear running while the preview is unreachable.

**Why:** The workflow can retain a stale port expectation after configuration changes, producing a successful-looking server with a blank or refused preview.

**How to apply:** When validating a Vite web app in this workspace, check both vite.config.ts and the workflow waitForPort value before troubleshooting application code.