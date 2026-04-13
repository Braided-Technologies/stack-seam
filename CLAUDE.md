# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: StackSeam

A multi-tenant SaaS for Managed Service Providers (MSPs) to map their IT stack, track integrations between tools, and manage costs/contracts. Lives at https://stackseam.tech.

## Commands

```bash
npm run dev          # Vite dev server (localhost:8080 typically)
npm run build        # Production build → dist/
npm run lint         # ESLint check
npm test             # Vitest run-once
npm run test:watch   # Vitest watch mode
```

Single test: `npx vitest run path/to/file.test.ts` or `npx vitest run -t "test name"`.

## Architecture

### Stack
- **Frontend**: Vite + React 18 + TypeScript, TanStack Query, React Router, shadcn/ui (Radix + Tailwind)
- **Backend**: Supabase (Postgres + RLS + Auth + Storage + Edge Functions)
- **Hosting**: Vercel (auto-deploy from `main` branch on GitHub)
- **Domain**: stackseam.tech via Porkbun → Vercel

### Critical project state
- **Migrated from Lovable**: This project was originally on Lovable Cloud (project `ivmbbnmmioeufmxtvsgs`). It was moved to a self-hosted Supabase project (`yfrwpqpafoquajfxlbhk`). Some code still references Lovable patterns — when in doubt, the new Supabase project is the source of truth.
- **No CI**: There are no GitHub Actions or test gates. Pushing to `main` triggers a Vercel deploy directly.
- **Edge functions**: All deployed via Supabase MCP (`mcp__supabase__deploy_edge_function`), NOT via the Supabase CLI. The CLI is not installed.

### Auth model
- Three roles in `user_roles.role`: `member`, `admin`, `platform_admin`
- One user belongs to exactly one organization (enforced by unique constraint)
- `platform_admin` is a global role; org admins are scoped to their org
- RLS uses helper functions: `is_org_member()`, `is_org_admin()`, `is_platform_admin()`, `get_user_org_id()`

### Multi-tenancy
- Almost every table has an `organization_id` FK
- RLS policies enforce org-scoped reads/writes for `authenticated` role
- Service role bypasses RLS — used by edge functions for admin operations
- Users sign up via email/password OR Google/Microsoft OAuth (configured in Supabase Auth)

### AI features
- **Built-in AI** uses your OpenAI key (`OPENAI_API_KEY` secret). Default model: `gpt-4o-mini`.
- **BYOK**: orgs can configure their own provider in Settings (OpenAI, Anthropic, Gemini, Grok, DeepSeek, Mistral). Stored in `org_settings` keys: `ai_provider`, `ai_api_key`, `ai_model`.
- **Rate limit**: built-in AI has a 50/day/org limit enforced via `check_and_increment_ai_usage` RPC. Braided Technologies org (`b74b008f-68bc-4813-b3cc-2c9757b22b12`) is hardcoded as exempt in edge functions.

### Discovery system (the integration finder)

This is the most complex part of the codebase. It finds integrations between MSP tools.

**Old (deprecated) functions still in repo**: `discover-integrations`, `discover-integrations-deep`. These called `ai.gateway.lovable.dev` and were prone to AI fabrication. Replaced by the new system but the files still exist.

**New atomic system** (preferred):
1. `discover-pair` edge function — discovers integrations between exactly 2 apps
   - Tavily Search API (`TAVILY_API_KEY` secret) for real URLs
   - Strict 5-layer verification:
     1. URL must be on one of the two apps' official domains (`vendor_url` + `alias_domains` + name-derived guesses)
     2. URL path can't be `/blog`, `/release-notes`, `/news`, `/comparison`, etc.
     3. The "other" app (not the domain owner) must appear ≥2 times on the page
     4. Both app names must appear within 500 chars of each other
     5. Final AI gate (`gpt-4o-mini`) does a yes/no check that page actually describes an integration
   - Caches result in `discovery_cache` (30-day TTL)
2. `process-discovery-job` edge function — orchestrates pair scans
   - Reads `discovery_jobs` rows, builds pair list, calls `discover-pair` for each
   - Uses `EdgeRuntime.waitUntil` for true background processing (survives request timeout)
   - Throttled: 2 parallel pairs with 1.5s delay between batches
   - Updates `discovery_jobs.processed_pairs` / `found_count` as it progresses (frontend polls every 2s)
   - **Reverse-direction dedupe**: before inserting A→B, checks if B→A already exists and updates that instead
3. `revalidate-integrations` edge function — weekly cron (Sunday 3am UTC) that re-checks all integration URLs

**Frontend hooks** (in `src/hooks/useStackData.ts`):
- `useStartDiscoveryJob`: creates job + invokes processor
- `useDiscoveryJob(jobId)`: polls a single job every 2s
- `useActiveDiscoveryJob(orgId)`: polls for any pending/running job for the org cross-page (also has a 5min watchdog)
- `useReportIntegration`: upvote/flag/dead_link votes — DB trigger updates `integrations.upvotes/reports/confidence`

**Adding a new multi-domain vendor**: Update `applications.alias_domains` (text[] column). E.g., HaloPSA has `['usehalo.com']` because they split docs across `halopsa.com` and `usehalo.com`.

### Email
- Uses **Resend** (`RESEND_API_KEY` secret), not Lovable's email system
- Domain `stackseam.tech` is verified in Resend
- Auth emails (signup confirm, password reset) use Supabase's built-in system, not Resend
- Transactional emails go through `process-email-queue` (which uses pgmq) → `send-transactional-email`
- React Email templates in `supabase/functions/_shared/transactional-email-templates/`

### Frontend conventions
- TanStack Query for ALL server state. No useState for fetched data.
- `supabase.functions.invoke()` for edge function calls (auto-handles auth headers)
- shadcn/ui components in `src/components/ui/`. Don't create new primitives — use existing ones.
- Tour system uses `react-joyride` — `data-tour="..."` attributes mark tour targets
- Settings tabs: Profile (all users), Team / Organization / AI Config / Connectors (admins only)
- Stack page uses category groups defined in `src/lib/categoryGroups.ts`

### Deployment quirks
- **Edge function `verify_jwt`**: All non-cron functions are deployed with `verify_jwt: false`. They handle auth internally via `supabase.auth.getUser()` because the gateway JWT verification was rejecting valid tokens during a migration. Only `process-email-queue` keeps `verify_jwt: true` (requires service_role).
- **Vercel rewrites**: `vercel.json` has a catch-all rewrite to `/` for SPA client-side routing. Don't add `routes` in `vercel.json`.
- **Auth state hydration**: The `AuthContext` MUST `await fetchOrg()` inside `getSession().then()` and keep `loading=true` until that completes. Otherwise refresh on non-dashboard routes flickers to `/setup` then back. The `onAuthStateChange` handler must NOT be async (causes deadlocks).

### Known footguns
- **Don't** use `discover-integrations` or `discover-integrations-deep` — those are the old, broken versions. Use the new job-based system via `useStartDiscoveryJob`.
- **Don't** add new CRON jobs that hit edge functions without first storing the service role key in Postgres vault (`vault.create_secret('...', 'service_role_key')`). The cron-to-function HTTP call needs it.
- **Don't** create new RLS policies without `TO authenticated` — anonymous-accessible policies are a security smell here.
- **Discovery jobs that time out**: The `useActiveDiscoveryJob` hook auto-marks any job >5 min as failed.
