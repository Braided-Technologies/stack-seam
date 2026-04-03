

# ScalePad API Key Management + Budget/Spend Tab

## 1. ScalePad API Key in Settings UI

**Settings > Connectors > ScalePad card**: Add an API key input field with save/delete buttons. Store the key in `org_settings` (key: `scalepad_api_key`). The edge function will check `org_settings` first, then fall back to the environment secret.

### Files
- **`src/pages/Settings.tsx`** — Add masked API key input, Save/Delete buttons to ConnectorsSection. Load current key from `org_settings`, save via upsert, delete via delete.
- **`supabase/functions/scalepad-sync/index.ts`** — After auth, query `org_settings` for `scalepad_api_key` for the user's org. Use that if found, otherwise fall back to `SCALEPAD_API_KEY` env secret.

## 2. Budget / Spend Tab

New top-level navigation item between "Research" and "Settings". Shows spend visualization and contract management across all apps.

### Layout
- **Summary cards** at top (same styling as Dashboard/Stack): Total Monthly Spend, Total Annual Spend, Apps with Contracts, Upcoming Renewals
- **Spend by Category** — bar or horizontal chart showing cost breakdown by category group (using existing `user_applications` cost data)
- **App Spend Table** — sortable table of all apps with costs, renewal dates, billing cycle, term
- **Contracts section** — list of all uploaded contract files across all apps, with ability to view/download/delete

### Contract Handling (all options available)
Each app's contract workflow offers:
1. **Manual entry only** — already works via the edit dialog in My Stack
2. **Upload + manual entry** — upload file for reference, manually enter/edit cost data (current behavior)
3. **Upload + scan** — upload file, use AI to extract key fields (vendor, cost, renewal date, term), user can review/edit extracted data before saving
4. **After upload**: user chooses to **keep file stored** (current secure storage) or **delete after scanning** (extract data then remove the file)

For scanning, create an edge function `scan-contract` that:
- Receives the uploaded file path from storage
- Downloads the file, extracts text (using PDF parsing)
- Sends text to AI (Lovable built-in model) to extract structured data (cost, renewal date, term, billing cycle)
- Returns extracted fields for user to review/confirm
- If user chose "delete after scan", removes the file from storage after confirmation

### Files
- **`src/components/AppLayout.tsx`** — Add "Budget" nav item (DollarSign icon)
- **`src/App.tsx`** — Add `/budget` route
- **`src/pages/Budget.tsx`** — New page with summary cards, category spend breakdown, app spend table, contracts list
- **`supabase/functions/scan-contract/index.ts`** — Edge function to extract text from uploaded PDF/doc and use AI to parse contract fields
- **`src/components/ContractsSection.tsx`** — Add "Scan & Extract" option after upload, with "Keep file / Delete after scan" choice

### Data
No new tables needed — all spend data comes from `user_applications` (cost_monthly, cost_annual, renewal_date, term_months, billing_cycle). Contract files are already in `contract_files` table + `contracts` storage bucket.

## Summary of Changes

| File | Change |
|------|--------|
| `src/pages/Settings.tsx` | API key input/save/delete in ConnectorsSection |
| `supabase/functions/scalepad-sync/index.ts` | Read API key from org_settings first |
| `src/components/AppLayout.tsx` | Add Budget nav item |
| `src/App.tsx` | Add /budget route |
| `src/pages/Budget.tsx` | New budget/spend page with charts, table, contracts |
| `supabase/functions/scan-contract/index.ts` | New edge function for AI contract parsing |
| `src/components/ContractsSection.tsx` | Add scan option + keep/delete choice |

