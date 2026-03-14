# ARG0N.DEV — Claude Code Project

## Quick Context
Creative generation UI for Secret Menu's Inferis engine.
Next.js 15 + Tailwind 3 + TypeScript. Deploys to arg0n.dev via Vercel on push to main.

## Commands
-  — local dev server
-  — production build (verify before push)
-  — auto-deploys to arg0n.dev in ~30s

## API Backend
All generation calls go to external APIs — no local backend needed:
- Argon API: https://ryujin.inferis.app/api/argon/*
- Krea API: https://api.krea.ai (Bearer auth in page.tsx)

## Build Brief
See COWORK-BRIEF.md for full task list, design system, and API specs.

## Rules
- Build locally, verify  passes before pushing
- One feature per commit, descriptive messages
- Keep the Flora × Diagram aesthetic: dark, minimal, monospace labels
- Test all API integrations against live endpoints
