---
name: TSX JSX test runtime
description: JSX runtime difference between standalone tsx tests and the Vite app build.
---

Standalone tests run with `node --import tsx/esm` may compile JSX against a classic React global while the Vite app build uses the automatic JSX runtime. A component that works in the app can therefore fail with `React is not defined` when directly server-rendered in that test runner.

**Why:** A homepage component render test failed in isolation even though the application built and rendered successfully in Vite.

**How to apply:** When testing JSX in a standalone Node test, use a compatible JSX loader or test the emitted app/browser output; do not change a working component solely to accommodate a mismatched test runtime.