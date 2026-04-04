

# Multi-Issue Fix Plan

## Issues Identified

1. **Team table columns uneven** — Grid column fractions don't align between header, member rows, and invitation rows
2. **Team: add sorting & search** — No way to filter or sort members
3. **Team: show first/last name for users** — Currently shows email prefix; invitations store first/last names but active members don't have this data
4. **Integrations panel shows non-stack connections** — `AppIntegrationsPanel` filters by app but doesn't limit to stack-only integrations
5. **Stack Map: animated edges cause lag** — `animated: true` on every edge creates performance issues at 30+ apps
6. **Stack Map: categories don't match groupings** — Legend shows individual categories; should use CATEGORY_GROUPS with collapsible groups (start collapsed)
7. **My Stack: contracts in settings** — Decide: redirect to Budget page when user clicks contracts tab
8. **Budget: contract upload RLS error** — Storage bucket policy only allows `is_org_admin()`, missing `is_platform_admin()` for uploads
9. **Budget: no search on app table** — Must scroll through entire list

## Plan

### 1. Fix Team Table (Settings.tsx)
- Replace `grid-cols-[2fr_2fr_1fr_1fr_auto]` with a proper HTML `<Table>` component for consistent column alignment
- Add a search input above the members list (filters by name/email)
- Add sortable column headers (Name, Email, Status, Role)
- For active members: query invitation records to get first/last name (fallback to email prefix if no invitation found)

### 2. Fix Integrations Panel (AppIntegrationsPanel.tsx)
- Filter `appIntegrations` to only include integrations where BOTH source and target are in the user's stack
- Accept `userAppIds` as a prop from parent components

### 3. Stack Map Performance (StackMap.tsx)
- Remove `animated: true` from edges — use static solid/dashed lines instead
- Optionally use a thinner stroke for less visual clutter

### 4. Stack Map Category Grouping (StackMap.tsx)
- Replace flat category list in the legend with CATEGORY_GROUPS collapsible sections
- Start all groups collapsed by default
- Each group expands to show individual category toggles
- Toggle/untoggle at group level affects all categories within

### 5. My Stack Contracts Redirect (Stack.tsx)
- In the app settings dialog, when "Contracts" tab is clicked, navigate to `/budget` page instead of showing inline contracts

### 6. Fix Contract Upload RLS (Migration)
- Add storage policy: allow `is_platform_admin()` to upload to contracts bucket
- Update existing upload policy to include `OR is_platform_admin()`

### 7. Budget Search (Budget.tsx)
- Add search input above the Application Spend table
- Filter `sortedApps` by name/category match

### Technical Details
- **Storage policy migration**: `CREATE POLICY "Platform admins can upload contracts" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'contracts' AND is_platform_admin());`
- **Team name resolution**: Use `get_org_invitations` or query invitations table to match `user_id` → `invited_by` → first/last name from the invitation record for that email. Alternatively, add a `profiles` table (better long-term), but for now the invitation-based approach works for invited users.
- **Edge animation removal**: Change `animated: true` to `animated: false` and optionally adjust `strokeDasharray` for a subtle static dashed look.

