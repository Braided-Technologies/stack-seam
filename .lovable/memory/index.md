# Project Memory

## Core
IT Stack Intelligence Portal for MSPs. Primary #3B82F6 (blue). Lovable Cloud backend.
Multi-tenant: org-based data isolation via RLS. Roles: admin, member.
React Flow for interactive stack integration map.
Apps have status: approved (global) or org_only (private to submitting org, needs admin approval).
org_integrations.status tracks: pending, configured, skipped, hidden.

## Memories
- [MSP Categories & Apps](mem://features/categories) — Pre-seeded MSP tool categories and popular apps per category
- [Database Schema](mem://features/schema) — Organizations, user_roles, applications, user_applications, contacts, integrations, contract_files, org_integrations
- [App Approval Flow](mem://features/app-approval) — Apps added via Find a Tool are org_only until promoted to approved by admin
