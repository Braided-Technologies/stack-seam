
# Dashboard, Sidebar, Settings, Integrations, Admin Fixes

## Changes

### 1. Dashboard — Clickable "Total Apps" + Fix ScrollArea
**File: `src/pages/Dashboard.tsx`**
- Wrap "Total Apps" card in a `Link` to `/stack` (same pattern as Integrations card)
- Fix ScrollArea: the current `max-h-[400px]` on ScrollArea needs an explicit `h-[400px]` instead — ScrollArea requires a fixed height, not max-height, to enable scrolling
- Match card styling to Stack page: use `rounded-xl` with icon in colored circle (`bg-primary/10` wrapper) instead of plain Card+CardHeader layout

### 2. Sidebar — Hide "Feedback" text when collapsed
**File: `src/components/FeedbackDialog.tsx`**
- The FeedbackDialog button always shows the word "Feedback" regardless of sidebar state
- It doesn't have access to the `isExpanded` prop — need to pass it from `AppLayout.tsx`
- Update `FeedbackDialog` to accept an `isExpanded` prop, conditionally render the text
- Update `AppLayout.tsx` line 130 to pass `isExpanded` to `<FeedbackDialog />`

### 3. Settings — Role management + Pending invitees in members list
**File: `src/pages/Settings.tsx`**
- In TeamSection, add a role dropdown (Select) for each member so admins can change roles between `member` and `admin` (add a `changeRole` mutation)
- Merge pending invitations into the Members list with a "Pending" badge instead of showing them in a separate card — or keep both but also show pending invitations inline in the members card
- Show member name and email instead of truncated user_id: query profiles or auth metadata. Since we likely don't have a profiles table with names, we'll show email from a join. Actually, `user_roles` only has `user_id` — we need to fetch user emails. We can query `invitations` for email, and for existing members we'd need a profiles table or to store email on user_roles. For now, show the pending invitations in the Members section and query user email from profiles if available.

Let me check what's available:

The members query only gets `user_id` from `user_roles`. To show emails, we'd need to either:
- Create a `profiles` table (proper solution)
- Or query auth.users (not possible from client)

For now: add pending invitations into the members list with "Pending" badge, and for existing members show the truncated user_id (we can enhance with a profiles table later). Add role change dropdown for admins.

### 4. Integrations — Collapsible apps within groups + Collapse All
**File: `src/pages/Integrations.tsx`**
- Add `openApps` state (`Set<string>`) to track which apps are expanded
- Make each app card header clickable to collapse/expand its integrations
- Add a "Collapse All" / "Expand All" button next to the filters
- Add chevron icons to app headers

### 5. Admin — Category column on Apps tab + Reorder tabs
**File: `src/pages/Admin.tsx`**
- Apps table: add a "Category" column. Need to join `applications` with `categories` table. Update the query to include category info. Add a category dropdown for editing.
- Reorder tabs to: Apps | Organizations | Users | Support
- Update the `StackMap` text reference to current platform name

### 6. Category consistency check
- Stack page uses `CATEGORY_GROUPS` from `categoryGroups.ts` — confirmed
- Stack Map uses same `CATEGORY_GROUPS` — need to verify
- Integrations page uses `CATEGORY_GROUPS` — confirmed
- All pages reference the same source file, so categories are consistent

### 7. ScalePad / Contract data
The user asks about using MCP server vs API for contract data. This is a discussion point, not a code change. The MCP connector for ScalePad is not available in the connector catalog. The edge function `scalepad-sync` already attempts API calls. The user should provide the correct API endpoint/key. No code change needed here — just guidance.

## Files to Change

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Clickable Total Apps card, fix ScrollArea, match Stack page card styling |
| `src/components/FeedbackDialog.tsx` | Accept `isExpanded` prop, hide text when collapsed |
| `src/components/AppLayout.tsx` | Pass `isExpanded` to FeedbackDialog |
| `src/pages/Settings.tsx` | Add role change dropdown for members, show pending invites in members section |
| `src/pages/Integrations.tsx` | App-level collapsing, collapse all button |
| `src/pages/Admin.tsx` | Category column in Apps table with edit, reorder tabs to Apps/Orgs/Users/Support |

## Notes on ScalePad
The ScalePad sync edge function already exists. The MCP server approach (Claude pulling data) works for you interactively but can't be used by the app directly — MCP tools are only available to the Lovable agent, not to the deployed application. The app needs the ScalePad API endpoint and key configured as secrets. If the current API endpoint is wrong, we need the correct ScalePad API docs to fix it.
