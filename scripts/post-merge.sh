#!/bin/bash
set -e

# Post-merge setup: install dependencies. No DB migrations or build step —
# this project is a Vite + Netlify Functions app that is not run on Replit.
npm install --no-audit --no-fund
# Install browser binaries without launching graphical engines here. A WebKit
# launch probe can stall on this container; browser:check still runs before
# browser tests and verifies that installed engines can actually launch.
node --import tsx/esm scripts/setup-browser-engines.ts --install-only
