# Athlete Management System — web

Next.js (App Router) front end for the coaching pipeline described in the
[root README](../README.md). Supabase-backed, deployed on Vercel.

## Development

```bash
npm install
npm run dev       # http://localhost:3000
npm run lint
npx tsc --noEmit
npm run build
```

Requires a Supabase project (URL + keys) and the same LLM provider keys as the
Python side — see the root README's [Providers and model selection](../README.md#providers-and-model-selection)
section and `services/supabase/` for the schema these pages read/write.

## Pages

- `/` — dashboard (KPIs, this week's sessions, plan calendar)
- `/plan` — full 4-week structured plan + drift detection
- `/nutrition` — calorie/macro targets, food logging, barcode scanning
- `/report` — weekly analysis/check-in
- `/setup`, `/profile` — Supabase-authenticated account and training config

## Contributing

Read [`AGENTS.md`](AGENTS.md) first — this project pins a Next.js version whose
APIs and file conventions differ from what most training data assumes (e.g.
`proxy.ts`, not `middleware.ts`).
