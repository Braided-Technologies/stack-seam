

# AI-Powered Research with Built-in + BYOK Option

## What We're Building

An AI research assistant built into the app that helps MSP teams research tools, compare vendors, get recommendations, and answer IT questions. It works out-of-the-box with built-in AI, with an optional settings page for power users to connect their own API keys.

## Plan

### 1. Create AI Research Edge Function
**File:** `supabase/functions/ai-research/index.ts`

A new edge function that accepts a research query and optional context (user's current stack). It uses Lovable AI by default but checks for a user-provided API key in the `org_settings` table first. If a custom key exists, routes to that provider instead.

Supports research queries like:
- "Compare HaloPSA vs ConnectWise Manage for a 20-person MSP"
- "What backup solutions integrate with Datto RMM?"
- "Best practices for MSP cybersecurity stack"

Uses streaming SSE for real-time token delivery.

### 2. Create Organization Settings Table
**Migration:** New `org_settings` table to store per-org configuration including optional AI provider keys.

Columns: `id`, `organization_id`, `setting_key` (text), `setting_value` (text, encrypted at app level), `created_at`, `updated_at`

RLS: Only org admins can read/write their org's settings. Uses `is_org_admin()`.

Setting keys: `ai_provider` (lovable/openai/anthropic), `ai_api_key`, `ai_model`.

### 3. Build AI Research Chat Page
**File:** `src/pages/Research.tsx`

A chat-style interface where users can ask questions about IT tools, get vendor comparisons, and receive stack recommendations. Features:
- Message input with suggested prompts (e.g., "Compare RMM tools", "Security stack recommendations")
- Streaming responses rendered token-by-token
- Context-aware: automatically includes the user's current stack in the system prompt
- Chat history within the session

### 4. Build Settings Page (BYOK)
**File:** `src/pages/Settings.tsx`

Organization settings page (admin-only) with an "AI Configuration" section:
- Toggle between "Built-in AI" (default) and "Custom API Key"
- Provider dropdown: OpenAI, Anthropic, Google
- API key input (masked, stored in `org_settings`)
- Model selection based on provider
- Test connection button

### 5. Update Navigation
Add "Research" and "Settings" links to `AppLayout.tsx` sidebar. Settings visible to admins only.

### 6. Update Routing
Add `/research` and `/settings` routes in `App.tsx`.

## Technical Details

- The edge function checks `org_settings` for a custom key before falling back to `LOVABLE_API_KEY`
- Custom API keys are stored in the database (not as Supabase secrets) so each org can have their own
- Streaming uses SSE pattern consistent with the existing Lovable AI gateway docs
- System prompt includes the user's stack apps for context-aware answers
- Rate limit (429) and credit (402) errors are surfaced as toast notifications

