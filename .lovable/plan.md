
# Multi-Fix Plan (8 Items)

## 1. Contract Rescan — Skip Dialog for Existing Files
If a file was already uploaded and kept (i.e. user clicks scan on an existing file row), skip the "Keep or Delete" dialog and go straight to scanning with `delete_after_scan = false`.

## 2. Contract Line Items — Unlimited Quantity Option
Add an "Unlimited" toggle/checkbox next to the Qty field. When checked, set quantity to `null` and display "Unlimited" instead of a number.

## 3. Number Formatting with Commas
Add a currency/number formatter throughout the app:
- Contract scan results (line items: 30000 → 30,000)
- Budget page charts and tables
- Dashboard stat cards

## 4. Contact Form Validation
- Email: validate proper email format
- Phone: add country code selector + proper phone format validation
- Requires adding a country code dropdown component

## 5. App Detail Dialog — Save & Close
When saving app details, close the dialog after successful save.

## 6. Budget Chart — Monthly/Annual Toggle + Dark Mode Tooltip
- Add toggle to switch between monthly and annual spend in the category chart
- Fix tooltip styling for dark mode readability

## 7. Dashboard Stat Boxes — Compact Numbers
Shorten large numbers: 30,000 → 30k, 4,200 → 4.2k, 1,500 → 1.5k

## 8. Integration Discovery — Domain Validation Rule
- Documentation URL must come from one of the two apps' vendor domains
- Fix: discovered integrations not appearing in the list (likely a refetch/cache issue)
- Update the discover-integrations edge function to enforce this rule

## Implementation Order
1. Utility: number formatting helper (used everywhere)
2. ContractsSection: rescan flow + unlimited qty + formatting
3. ContactsSection: validation + phone format
4. Stack.tsx: save & close dialog
5. Budget.tsx: toggle + tooltip fix
6. Dashboard.tsx: compact numbers
7. discover-integrations edge function: domain rule + fix propagation
