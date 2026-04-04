

# Multi-Issue Fix Plan

## Issues Summary

1. **Admin Support tab**: Hide closed tickets by default
2. **Admin Users tab**: Show user first/last name, reorder tabs to Users | Orgs | Apps | Support
3. **Settings tab**: Rename "Company" to "Organization"
4. **Contract scanning**: Add checkboxes + confirm/import button for extracted data; support multi-line-item invoices
5. **Integration dead links**: Flag that AI-generated documentation URLs are unreliable — need verification approach
6. **Research tab**: Fix markdown table rendering, add reset button, persist chat across tab switches
7. **My Stack contacts**: Contact form cut off — open as popup dialog instead of inline
8. **Email DKIM/DMARC/SPF**: Set up email domain for mail delivery

---

## Plan

### 1. Admin Page — Support Tab & Users Tab (Admin.tsx)

**Support tab**: Add a toggle/filter to hide closed/resolved tickets (default: hidden). Add a "Show Closed" checkbox or filter option.

**Users tab**: 
- Fetch user emails via the existing `get_feedback_user_emails` RPC, then derive names from invitation records (same pattern as Settings team page)
- Add "Name" and "Email" columns to the users table
- Reorder tab triggers to: `users` | `orgs` | `moderation` (Apps) | `feedback` (Support)

### 2. Settings — Rename "Company" to "Organization" (Settings.tsx)

- Change `TabsTrigger value="company"` label from "Company" to "Organization"
- Update the card title and description text inside that tab

### 3. Contract Scan — Selectable Extracted Fields (ContractsSection.tsx)

- After scan, display each extracted field with a checkbox (default checked)
- Add line_items support: update the AI prompt in `scan-contract` edge function to also extract an array of `line_items` (each with name, cost, description)
- Display line items as a selectable list so users can pick which are relevant to this app
- Add "Import Selected" button that calls `onExtractedData` with only the checked fields
- Remove the current auto-call to `onExtractedData` on scan — user confirms first

### 4. Integration Dead Links

This is a data quality issue — the AI-generated integration documentation URLs are guesses. Two approaches:
- **Quick fix**: Add a "Report broken link" button next to documentation links that flags them in the database
- **Better fix**: Add a `link_verified` boolean column to integrations table; display an unverified warning badge on links. Over time, verify links via a background check or user reports.

I recommend the quick approach for now: add a small flag/report button and mark unverified links with a subtle warning.

### 5. Research Tab Improvements (Research.tsx)

- **Table rendering**: Add `remarkGfm` plugin to ReactMarkdown for proper GitHub Flavored Markdown table support (already in dependencies or add `remark-gfm`)
- **Reset button**: Add a refresh/reset button in the header to clear messages
- **Session persistence**: Lift messages state up to a ref or use `sessionStorage` so navigating away and back preserves the chat

### 6. My Stack — Contact Form Fix (Stack.tsx)

- Replace inline `ContactsSection` in the settings tab with a button that opens a separate Dialog for adding/managing contacts
- Or: make the existing dialog scrollable properly so the contact form isn't cut off (the dialog already has `max-h-[85vh]` and `ScrollArea` — verify the scroll area covers the contacts section fully)

The simpler fix: ensure `ScrollArea` in the settings tab wraps everything including contacts properly. The `max-h-[55vh]` on the settings ScrollArea may be too restrictive. Increase it or make the contact "Add" form open as its own sub-dialog.

### 7. Email Domain Setup

Use the email domain tools to configure DKIM, DMARC, and SPF. This requires:
- Opening the email setup dialog for the user to configure their domain
- DNS records (DKIM, SPF, DMARC) are automatically provided during domain setup

### Technical Details

- **remark-gfm**: `npm install remark-gfm`, then `<ReactMarkdown remarkPlugins={[remarkGfm]}>`
- **scan-contract prompt update**: Add `line_items` array to the tool schema with `{name, monthly_cost, annual_cost, description}` per item
- **Admin user names**: Reuse `get_feedback_user_emails` RPC + query invitations table for first/last name by email
- **Session persistence for Research**: Store messages in `sessionStorage` keyed by a constant; restore on mount

