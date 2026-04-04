

# Multi-Issue Fix Plan

## Issues (10 items)

### 1. Integration Link Verification & Cleanup
Run the `verify-integration-links` edge function to check all 195 integration documentation URLs. Delete integrations with dead/invalid links. Fix known incorrect links (e.g., Hudu → M365 should be `https://www.hudu.com/integrations/microsoft365`). This is a data cleanup task using the existing edge function, plus manual corrections for known mismatches.

### 2. Add "Submit Integration" Feature
Add an "Add Integration" option on the Integrations page where users can:
- Select two apps from the catalog
- Provide a documentation URL
- Submit for platform admin approval (status: `pending`)

Requires a migration to allow user-submitted integrations (add `submitted_by_org` column to `integrations`, update RLS to allow org admins to insert with `status='pending'`). Platform Admin page gets a new "Integrations" tab to approve/reject submitted integrations.

### 3. Settings — Domain Enforcement Checkbox
Add a checkbox in Settings > Organization: "Require team members to use company domain email". Store as an org_setting (`enforce_email_domain`). When enabled, invitation emails are validated against the org's domain (extracted from `website_url`). Remove the separate "Domain" display — derive domain from the website URL automatically.

### 4. Platform Admin Orgs Tab — Fix Domain Column
Instead of showing a separate blank "domain" column, derive and display the domain from `website_url` (e.g., `https://braided.tech` → `braided.tech`). Remove the standalone domain field.

### 5. Contract Scan — Billing Cycle Dropdown
Change the billing_cycle field in the extracted data editor from a text Input to a Select dropdown with options: Monthly, Annual, Quarterly, Multi-Year.

### 6. Contract Scan — Scrollable Overflow Fix
The extracted data section can overflow the dialog. Wrap the `ContractsSection` content (inside the contracts tab of the Budget dialog) in a `ScrollArea` with proper max-height so large extractions are scrollable.

### 7. Contract Import — Fix Annual Cost Calculation
The scan correctly extracts `$30,000/year` and `24 months term`, but the import logic adds line item costs on top of the base cost. Fix: when importing, if the user checked base fields like `cost_annual`, do NOT add line item costs on top — let them be independent. Also ensure the AI prompt clarifies that `cost_annual` is per-year cost, not total contract value.

### 8. Contacts RLS — Allow Platform Admins
The contacts table INSERT policy only allows `is_org_admin()`. Add `OR is_platform_admin()` to the INSERT, UPDATE, and DELETE policies for contacts.

### 9. Budget Details — Grey Out Monthly When Annual
In the Budget app edit dialog, when `billing_cycle` is set to "annual", disable and grey out the Monthly Cost field since it's not relevant.

### 10. Research Chat — Table Scrolling & Formatting
- Tables render but overflow horizontally. The `max-w-[80%]` constraint on messages causes tables to be clipped. Change assistant messages to use a wider max-width or full width.
- Add spacing between paragraphs via prose CSS (`[&_p]:mb-3`).
- Update the AI system prompt to include: "Only cite tools and features that you can verify exist. Do not fabricate product names or features. If unsure, say so."

### 11. Light Mode Background Contrast
Change `--background` from `220 15% 96%` to a slightly darker value like `220 15% 92%` for better contrast against white cards.

## Implementation Order

1. **Migration**: Fix contacts RLS (add `is_platform_admin()` to INSERT/UPDATE/DELETE), add `submitted_by_org` + `submitted_by_user` to integrations, update integrations RLS for user submissions
2. **Run link verification**: Invoke `verify-integration-links` edge function, then delete dead-link integrations
3. **ContractsSection.tsx**: Billing cycle dropdown, scrollable overflow fix, fix cost aggregation logic
4. **Budget.tsx**: Grey out monthly cost when annual billing cycle
5. **Integrations.tsx**: Add "Submit Integration" dialog
6. **Admin.tsx**: Add Integrations moderation tab, fix Orgs domain display
7. **Settings.tsx**: Add domain enforcement checkbox, derive domain from URL
8. **Research.tsx**: Fix table width, add paragraph spacing, update system prompt
9. **index.css**: Darken light mode background
10. **ai-research edge function**: Add citation/accuracy instruction to system prompt

## Technical Details

- **Contacts RLS fix**: `CREATE POLICY "Platform admins can insert contacts" ON contacts FOR INSERT TO authenticated WITH CHECK (is_platform_admin());` — same pattern for UPDATE and DELETE.
- **Integration submissions**: New columns `submitted_by_org uuid`, `submitted_by_user uuid` on integrations table. New INSERT policy: `(submitted_by_org = get_user_org_id() AND status = 'pending'::text)`. Status values: `pending`, `approved`, `rejected`.
- **Domain enforcement**: Store `enforce_email_domain` in `org_settings`. Extract domain from `website_url` using URL parsing. Validate on invite send.
- **Cost fix**: In `handleImport()`, when line items are selected, use their costs INSTEAD of (not in addition to) the base cost fields.
- **Background**: Change `--background: 220 15% 96%` → `--background: 220 15% 91%`.

