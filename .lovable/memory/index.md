# Project Memory

## Core
IT Stack Intelligence Portal for MSPs. Primary #3B82F6 (blue). Lovable Cloud backend.
Multi-tenant: org-based data isolation via RLS. Roles: admin, member.
React Flow for interactive stack integration map.
Integrations MUST have documentation_url — entries without verifiable docs are rejected.
Sidebar is collapsible (icon-only with hover expand). Persisted in localStorage.
Daily cron job at 2 AM UTC auto-discovers integrations for all orgs.

## Memories
- [MSP Categories & Apps](mem://features/categories) — Pre-seeded MSP tool categories and popular apps per category
- [Database Schema](mem://features/schema) — Organizations, user_roles, applications, user_applications, contacts, integrations, contract_files, org_integrations
