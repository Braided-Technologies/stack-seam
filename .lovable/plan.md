

# Org Setup, Permissions, Admin Enhancements & Rebrand

## Summary

Five areas to address: (1) add company URL field to org setup to prevent duplicate orgs, (2) confirm invitation role selection works correctly, (3) fix platform_admin access to Settings, (4) clarify platform admin management is already built into `/admin`, and (5) rename the platform. Plus fix a runtime error with AlertDialog.

## Current State

- **Org setup**: Only asks for org name, no URL/domain field. No duplicate detection.
- **Invitations**: Admins can already choose `admin` or `member` role when inviting — this works correctly in Settings > Team tab.
- **Members vs admins**: Members see Dashboard, Stack, Map, Integrations, Research. Admins additionally see Settings. This is correct, but the sidebar condition for Settings already includes `platform_admin`, so that's fine. The real issue is that `is_org_admin()` checks for `role = 'admin'` specifically — `platform_admin` doesn't match, so RLS blocks org settings reads/writes.
- **Platform admin portal**: Already exists at `/admin` with org/user/app management. No need for a separate backend portal — it just needs the runtime error fixed.
- **Runtime error**: `AlertDialog` in Admin.tsx is crashing due to React context issue — likely needs to be wrapped properly.

## Plan

### 1. Add Company URL to Organizations

**Migration**: Add `domain` column (text, nullable) to `organizations` table with a unique constraint.

**OrgSetup.tsx**: Add a "Company Website" input field. On submit, extract domain from URL, check for existing org with same domain. If exists, show a message suggesting they ask their admin for an invite instead.

**AuthContext.tsx**: Update `createOrg` to accept and pass the domain.

### 2. Confirm Invitation Role Selection (Already Working)

The Settings > Team tab already has a role selector (`admin` / `member`) when sending invitations. No changes needed here — just confirming this works as designed.

### 3. Fix platform_admin Access to Org-Level Features

**Migration**: Add RLS policies so `is_platform_admin()` grants access to `org_settings` (SELECT, INSERT, UPDATE, DELETE). This way platform admins can manage their own org's settings without needing a separate account.

The sidebar and Settings page code already handle `platform_admin` — it's the database policies blocking access.

### 4. Fix Runtime Error in Admin Page

The `AlertDialog` crash is likely caused by rendering `AlertDialog` components outside proper React context. Will restructure the delete confirmation dialogs in `Admin.tsx` to ensure proper component tree.

### 5. Platform Rename

Here are name suggestions for an MSP-focused IT stack intelligence portal:

| Name | Domain Availability | Notes |
|------|-------------------|-------|
| **StackPulse** | stackpulse.io (check) | Suggests real-time stack health monitoring |
| **StackLens** | stacklens.io (check) | "Lens" into your IT stack — fits the intelligence angle |
| **StackForge** | stackforge.io (check) | Building/forging your stack |
| **TechStack Hub** | techstackhub.com (check) | Descriptive, clear purpose |
| **StackRadar** | stackradar.io (check) | Radar/intelligence theme for MSPs |

Once you pick a name, I'll update it across: Auth page title, sidebar logo text, OrgSetup page, browser tab title (`index.html`), and any other references.

## Files to Change

| File | Change |
|------|--------|
| Migration SQL | Add `domain` to `organizations`, add `org_settings` policies for platform_admin |
| `src/pages/OrgSetup.tsx` | Add company URL input, domain extraction, duplicate check |
| `src/contexts/AuthContext.tsx` | Pass domain in `createOrg` |
| `src/pages/Admin.tsx` | Fix AlertDialog runtime crash |
| Various files | Rename once name is chosen |

## Technical Details

- Domain extraction: strip protocol and path from URL input, store just the domain (e.g., `acme.com`)
- Unique constraint on `organizations.domain` prevents duplicates at the database level
- `org_settings` RLS for platform_admin uses `is_platform_admin()` — same pattern as other tables
- Platform admin management stays in `/admin` — no separate portal needed. You manage everything from within the app.

