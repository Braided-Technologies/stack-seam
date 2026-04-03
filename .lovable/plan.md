

# Dashboard, Integrations, Admin Portal & Role Fixes

## Issues to Address

1. **Dashboard integrations not clickable / not scrollable** — integration items are static divs; only shows first 8 with no scroll
2. **Integrations tab not grouped by category** — currently grouped by app, but user wants category-based collapsible groups matching Stack page
3. **Platform admin can't access Settings** — the sidebar only shows Settings for `admin` role, but `platform_admin` should also have org-level access (or: platform admins should be able to access their own org's settings)
4. **Admin portal lacks CRUD for orgs/users/apps** — currently read-only tables with no edit/delete
5. **Stat boxes not clickable** — the 5 stat cards at the top of Admin page should navigate to relevant tabs

## Plan

### 1. Dashboard — Clickable + Scrollable Integrations

**File: `src/pages/Dashboard.tsx`**

- Wrap the integrations list in a `ScrollArea` with a max height so all integrations are scrollable (not limited to 8)
- Make each integration item a clickable link using `useNavigate` to `/integrations?highlight={integrationId}`
- Add hover styles and cursor pointer

### 2. Integrations Tab — Category-Based Grouping

**File: `src/pages/Integrations.tsx`**

- Import `CATEGORY_GROUPS` from `categoryGroups.ts`
- Instead of grouping by individual app, group by category group (Core Operations, Security, etc.) with collapsible sections
- Within each category group, show apps and their integrations nested underneath
- Maintain existing expand/collapse, status controls, and progress indicators

### 3. Platform Admin Access to Settings

**File: `src/components/AppLayout.tsx`**

- The Settings link condition already includes `platform_admin` (line 82: `userRole === 'admin' || userRole === 'platform_admin'`), so this should work
- The issue is likely that `is_org_admin` check in Settings page or RLS is failing because `platform_admin` is not `admin`. Need to check Settings page guard

**File: `src/pages/Settings.tsx`** — Update the admin check to include `platform_admin`:
```
const isAdmin = userRole === 'admin' || userRole === 'platform_admin';
```

### 4. Admin Portal — Full CRUD + Clickable Stats

**File: `src/pages/Admin.tsx`**

- **Clickable stat cards**: Each stat card sets the active tab and optionally a sub-filter (e.g., clicking "Pending Apps" switches to moderation tab)
- **Organizations tab**: Add Edit (rename) and Delete buttons per org. Delete requires a confirmation dialog. Needs a new DB migration for platform admin DELETE policy on organizations
- **Users tab**: Add a new "Users" tab showing all users across orgs with role info. Allow role changes and removal. Query `user_roles` joined with org name
- **Apps tab**: Expand moderation to show ALL apps (not just pending). Allow editing name/description/category, deleting, and changing status

### 5. Database Migration

New migration needed:
- Add DELETE policy on `organizations` for platform admins
- Add UPDATE policy on `user_roles` for platform admins (to manage users across orgs)
- Add DELETE policy on `user_roles` for platform admins

### Files Changed

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Scrollable + clickable integration items |
| `src/pages/Integrations.tsx` | Category-group-based collapsible layout |
| `src/pages/Admin.tsx` | Clickable stats, org/user/app CRUD, Users tab |
| `src/pages/Settings.tsx` | Allow `platform_admin` access |
| Migration SQL | DELETE on orgs, UPDATE/DELETE on user_roles for platform admins |

