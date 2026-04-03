---
name: App Approval Flow
description: Apps submitted via Find a Tool are org_only; admin promotes to approved for global catalog
type: feature
---
- applications table has `status` (approved/org_only) and `submitted_by_org` (uuid)
- RLS: approved apps visible to all, org_only visible only to submitting org
- INSERT policy requires status=org_only and submitted_by_org = user's org
- Future: admin moderation view to promote org_only → approved
- org_integrations has `status` field: pending, configured, skipped, hidden
