# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Send to PLAN deployment

The browser posts generated PNGs and draft metadata to the same-origin
`/api/plan-handoff` Netlify Function. Configure these server-only environment
variables in Netlify:

- `MEDIA_UPLOAD_TOKEN` — credential for the media upload service
- `PLAN_REGISTRATION_TOKEN` — credential for PLAN draft registration
- `MEDIA_UPLOAD_URL` — optional; defaults to the current media integration URL
- `PLAN_DRAFT_URL` — optional; defaults to the current PLAN drafts URL

Remove the former `VITE_PLAN_SECRET`, `VITE_MEDIA_UPLOAD_URL`, and
`VITE_PLAN_URL` values. No `VITE_` credential is used by the handoff flow.
