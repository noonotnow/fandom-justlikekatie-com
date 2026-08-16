#!/bin/bash
set -e

# Post-merge setup: install dependencies. No DB migrations or build step —
# this project is a Vite + Netlify Functions app that is not run on Replit.
npm install --no-audit --no-fund
