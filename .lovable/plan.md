

# Platform Admin vs Org Admin — Role Separation & Admin Portal

## The Problem

Currently there's one role tier: `app_role` enum with `admin` and `member`. Both org admins and you (platform owner) share the same `admin` role. We need a clear separation:

| Role | Scope | Can Do |
|------|-------|--------|
| **member** | Organization | View stack, integrations, contacts |
| **admin** | Organization | Manage apps, team, connectors, settings for their org |
| **platform_admin** | Global | Approve catalog apps, handle support requests, manage all orgs, account deletions |

## Plan

### 1. Add `platform_admin` to the `app_role` Enum

Migration to add the new role value. Platform admins still belong to an org (yours), but have elevated global privileges.

A new security-definer function `is_platform_admin()` checks if the current user has a `platform_admin` role in `user_roles`.

### 2. Database: `feedback` Table + Admin Policies

**New `feedback` table:**
- `id`, `user_id`, `organization_id`, `type` (bug/idea/question), `title`, `description`, `status` (open/in_progress/resolved/closed), `admin_response`, `created_at`, `updated_at`
- RLS: users see own submissions; platform admins see all

**New policies on `applications`:**
- UPDATE policy: platform admins can change `status` (org_only → approved)
- DELETE policy: platform admins can remove apps

### 3. Platform Admin Portal (`/admin`)

New page with tabs:

- **App Moderation** — List of `org_only` submissions. Approve (set to `approved`) or reject (delete). Also browse full approved catalog.
- **Support / Feedback** — All feedback across orgs. Update status, add admin response.
- **Organizations** — List all orgs with user counts, created dates. Account management actions.
- **Platform Stats** — Counts: total orgs, users, apps, pending submissions, open tickets.

### 4. Feedback Dialog (All Users)

A `FeedbackDialog` component accessible from the sidebar (message/help icon). Users select type (Bug / Feature Idea / Question), enter title + description, submit. They can view their past submissions and see admin responses.

### 5. Navigation Updates

- **Sidebar**: Add "Feedback" button (MessageSquare icon) in footer area for all users
- **Sidebar**: Add "Platform Admin" link (ShieldCheck icon) visible only to `platform_admin` users
- Existing "Settings" link stays for org admins

### 6. AuthContext Update

Extend `userRole` to include `'platform_admin'`. The `fetchOrg` function already reads the role from `user_roles` — just needs to handle the new value.

### Files to Create/Edit

| File | Change |
|------|--------|
| Migration SQL | Add `platform_admin` to enum, create `feedback` table, add UPDATE/DELETE policies on `applications` |
| `src/pages/Admin.tsx` | New platform admin page |
| `src/components/FeedbackDialog.tsx` | New feedback submission dialog |
| `src/components/AppLayout.tsx` | Add Platform Admin + Feedback nav items |
| `src/contexts/AuthContext.tsx` | Extend `userRole` type to include `platform_admin` |
| `src/App.tsx` | Add `/admin` route |
| `mem://features/roles` | Document the role hierarchy |

### Assigning You as Platform Admin

After migration, we'll use an INSERT to give your user account the `platform_admin` role. You'll provide your user ID or we'll look it up by email.

