

# Collapsible Sidebar, Stack Page Polish, Integrations Hub, and Scheduled Discovery

## Runtime Error Fix
There's a `useContext` error in `AppLayout.tsx` that needs fixing first — likely caused by component rendering outside router context during hot reload. Will address alongside the sidebar refactor.

## 1. Collapsible Sidebar (Icon-Only + Hover Expand)

**File: `src/components/AppLayout.tsx`**

- Add `collapsed` state (default `false`) and a toggle button (chevron icon) at the bottom of the sidebar
- When collapsed: sidebar shrinks to `w-16`, only icons shown, labels hidden
- On hover (`onMouseEnter`/`onMouseLeave`): temporarily expand to full width showing labels
- Transition with `transition-all duration-200` for smooth animation
- Persist collapsed preference in `localStorage`

## 2. My Stack Page Visual Polish

**File: `src/pages/Stack.tsx`**

- Wrap each category group in a subtle card-like container with `bg-card/50 border rounded-xl p-4` instead of floating in void
- Add a colored left-border accent per group (using existing category colors)
- Add a summary bar at the top showing total selected apps, total spend, categories used
- Use `bg-muted/30` alternating backgrounds for visual separation between groups
- Add subtle group icons next to section headers

## 3. Integrations/Connections Tab

**New file: `src/pages/Integrations.tsx`**

A dedicated page for viewing and managing all integrations:
- Table/list view of all integrations relevant to the user's stack
- Sort/filter by app name, integration type, status (configured/not configured)
- Each row shows: Source App ↔ Target App, type, description, documentation link
- Checkbox column to mark integrations as "configured" (new DB column needed)
- Link from Stack Map node click to this page filtered by that app
- Link from Dashboard "Available Integrations" card to this page

**Database migration:**
- Add `is_configured` boolean column (default `false`) to a new `org_integrations` table that tracks per-org integration status
- Schema: `org_integrations(id, organization_id, integration_id, is_configured, configured_at, configured_by, notes)`
- RLS: org members can view, admins can insert/update/delete

**File: `src/components/AppLayout.tsx`** — Add "Integrations" nav item with `Link2` icon

**File: `src/App.tsx`** — Add `/integrations` route

**File: `src/pages/Dashboard.tsx`** — Make "Available Integrations" card clickable, linking to `/integrations`

**File: `src/pages/StackMap.tsx`** — Add "View all integrations" link from the app detail panel that navigates to `/integrations?app=AppName`

## 4. Scheduled Daily Integration Discovery

Currently discovery is manual only. Will add automated daily checks:

**Database setup (via insert tool, not migration):**
- Enable `pg_cron` and `pg_net` extensions
- Create a cron job that calls `discover-integrations` daily with the org's app list

**File: `supabase/functions/discover-integrations/index.ts`**
- Add a mode for scheduled runs: when called without auth but with a service role key, iterate all orgs and discover integrations for each
- Add a `scheduled` boolean param to distinguish manual vs automated runs

**Regarding MCP integrations (Claude, etc.):**
The AI discovery prompt already includes API-based and platform integrations. For emerging MCP server integrations (like Claude ↔ Hudu via community MCP servers), we'll:
- Add "MCP Server" as a valid `integration_type` 
- Update the AI prompt to specifically ask about MCP server integrations
- These will appear with community documentation URLs (GitHub repos, etc.)

## 5. Navigation and Route Updates

**`src/components/AppLayout.tsx`:**
- Add Integrations nav item: `{ to: '/integrations', icon: Link2, label: 'Integrations' }`

**`src/App.tsx`:**
- Add route: `<Route path="/integrations" element={<ProtectedRoute><Integrations /></ProtectedRoute>} />`

---

## Technical Details

- **org_integrations table** — Separate from `integrations` table. The `integrations` table is global (what integrations exist). `org_integrations` tracks which ones a specific org has configured. RLS uses `is_org_member` / `is_org_admin`.
- **Sidebar collapse** — Uses CSS `width` transition, not the Shadcn Sidebar component, since we already have a custom sidebar. Hover uses `onMouseEnter`/`onMouseLeave` with a slight delay to prevent flicker.
- **Scheduled cron** — Uses `pg_cron` + `pg_net` calling the edge function URL with the service role key. Runs at 2 AM UTC daily.
- **MCP integrations** — The discover function's AI prompt will be updated to include: "Also check for MCP (Model Context Protocol) server integrations — community-built connectors that allow tools like Claude, ChatGPT, etc. to integrate with other platforms. Include GitHub repo URLs as documentation."

