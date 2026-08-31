---
name: Netlify function root layout
description: Why only production endpoints belong at the top level of the configured Netlify functions directory.
---

Keep the root of the configured Netlify functions directory limited to deployable endpoint files. Tests and non-endpoint helpers belong in a nested support directory.

**Why:** Netlify discovers top-level JavaScript files as serverless functions. A test filename can therefore pass the application build but fail the deployment packaging stage because it is treated as an invalid production function name.

**How to apply:** Put function tests and helpers below the root, keep the test runner glob aligned with that location, and check the deployment bundle list whenever a new top-level function file is introduced.