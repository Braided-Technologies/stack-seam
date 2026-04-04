

# Multi-Issue Fix Plan

## Issues (6 items)

### 1. Delete All Dead-Link Integrations (150 of 196)
The verification already ran — 150 integrations have `link_status = 'dead'`. Delete all of them via a database migration. This leaves 45 verified + 1 unchecked.

### 2. Contract Scan — Scrollable + Line Item Cost Summation
The extracted data `ScrollArea` has `max-h-[400px]` but it sits inside a dialog tab that itself has constrained height. Two fixes:
- Increase `ScrollArea` max-height or make it fill available space
- Make "Import Selected" button sticky at bottom so it's always reachable
- Auto-sum checked line items into the cost fields (editable so user can override). When line items are checked/unchecked, recalculate `cost_annual` and `cost_monthly` from the sum of checked items and update the editable fields live

### 3. Remove Domain Column from Admin Orgs Tab
The "Domain" column is redundant since it's derived from `website_url`. Remove it from the table — just show Name, Website, Users, Created, Actions.

### 4. Admin Apps & Integrations Tabs — Unified Layout
Both tabs should have the same structure:
- **Top section**: Pending items (status = `org_only` for apps, `pending` for integrations) with approve/reject actions
- **Bottom section**: Scrollable catalog of ALL items with search/filter

Currently the Integrations tab only shows pending. Add a full catalog list below (all approved integrations in a scrollable table showing Source App, Target App, Documentation URL, Status, with delete action).

### 5. Stack Map Categories Panel — Fix Text Wrapping
"Productivity & Communication" wraps awkwardly in the category panel. The panel has `max-w-[220px]` which is too narrow. Increase to `max-w-[260px]` to accommodate longer category group names.

### 6. Light Mode Already Adjusted — No Change Needed
Background was already darkened in previous iteration.

## Implementation Order

1. **Migration**: `DELETE FROM integrations WHERE link_status = 'dead'`
2. **ContractsSection.tsx**: Fix scroll, sticky import button, auto-sum line items into cost fields
3. **Admin.tsx**: Remove Domain column from Orgs tab; redesign Integrations tab to match Apps tab layout (pending section + full catalog); load all integrations with app name joins
4. **StackMap.tsx**: Widen categories panel from `max-w-[220px]` to `max-w-[260px]`

## Technical Details

- **Line item auto-sum**: When `checkedLineItems` changes, compute `sum(annual_cost)` and `sum(monthly_cost)` from checked items and update `editableFields.cost_annual` / `cost_monthly`. User can still manually edit after.
- **Sticky import button**: Move the Import/Dismiss buttons outside the `ScrollArea` so they're always visible at the bottom of the extraction panel.
- **Admin Integrations full catalog**: Query `integrations` with status = 'approved' joined to `applications` for source/target names. Display in a `ScrollArea` table with delete action.
- **Dead link cleanup**: Simple `DELETE FROM public.integrations WHERE link_status = 'dead'` migration.

