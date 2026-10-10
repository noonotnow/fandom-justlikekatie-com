---
name: Netlify build log access
description: How to inspect external Netlify deployment failures when the deploy API exposes only a generic error.
---

External Netlify build logs are available through the documented build-log WebSocket service, not guessed `/deploys/.../log` or `/builds/.../log` REST endpoints.

**Why:** The deploy/build API reported only a generic script exit code; the WebSocket log identified the actual TypeScript failure.

**How to apply:** Follow Netlify's `netlify/deploy-logs-api` example: generate a short-lived access-control token for the exact site/deploy through `app.netlify.com/access-control/generate-access-control-token`, then connect to `wss://socketeer.services.netlify.com/build/logs`. Keep all token handling inside the credential-using process and never print or persist tokens. Filter the returned build messages for errors; the end of a large configuration dump can hide the real failure.