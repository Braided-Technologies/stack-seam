# Multi-Issue Fix Plan

## Issues (10 items)

### 1. Admin Support Tab — Add Detail Columns

Currently shows badges + title in a single row. Add proper columns: Type, Status, Title, User, Organization, Date.

- Convert the collapsible list to a Table with those columns
- Keep the expandable detail below each row

### 2. Organization URL & Domain Enforcement

- **Migration**: Add `website_url` column to `organizations` table (already has `domain` column)
- **OrgSetup**: Already requires company URL — ensure it saves to `website_url`
- **Settings > Organization**: Show and allow editing of organization URL; add checkbox for "Enforce email domain matching"
- **Admin > Orgs tab**: Show URL column

### 3. Contract Scan — Fix PDF Text Extraction (Critical)

The edge function does `fileData.text()` on PDFs which returns binary garbage. The AI hallucinates because it gets no real text.

- **Fix**: Use `pdf-parse` or send the PDF as base64 to a multimodal model (Gemini supports PDF input). Best approach: use Gemini's multimodal capability — send the PDF bytes as a base64 `inline_data` part instead of extracting text.
- This fixes both the "missing line items" and "making up information" issues

### 4. Contract Scan — Editable Extracted Fields

Currently extracted fields are display-only with checkboxes. Make each field value editable (inline Input) so users can correct values (e.g., "N-able" → "N-Able") before importing.

### 5. Contract Import Not Working in Budget

`ContractsSection` in Budget.tsx is rendered without `onExtractedData` prop, so clicking "Import Selected" does nothing.

- Pass `onExtractedData` handler that updates `editingApp` state with the extracted values

### 6. Contract Auto-Rename After Scan

After successful scan, rename the file in storage based on extracted vendor name + date (e.g., "N-Able_2026-04-01.pdf").

### 7. Budget Page — Remove Separate Contracts Section

Replace the standalone "All Contracts" card with a "Contract" column in the Application Spend table showing Yes/No with view/download buttons inline.

### 8. Integration Dead Links — Recursive Verification

- Create an edge function `verify-integration-links` that checks all `documentation_url` values in the `integrations` table
- Mark links as verified/dead in the database (`last_verified` column exists already)
- Remove or flag integrations with dead/no documentation
- Add "Report broken link" button in the UI

### 9. Stack Map Button 404 on Integrations Page

Link points to `/stack-map` but route is `/map`. Fix: change `<Link to="/stack-map">` to `<Link to="/map">`.

### 10. Research Chat Overflow & Help Bot Overlap

- The assistant message `max-w-[80%]` plus table content overflows. Add `overflow-x-auto` to the message container.
- Move the send button to the left side of the input area, or adjust the help bot z-index/position so it doesn't overlap.

## Implementation Order

1. **Migration**: Add `website_url` to `organizations` table
2. **scan-contract edge function**: Switch to multimodal PDF input via Gemini; add editable fields support
3. **ContractsSection.tsx**: Make extracted values editable with Inputs
4. **Budget.tsx**: Wire `onExtractedData`, remove separate contracts card, add contract column to table, auto-rename
5. **Admin.tsx**: Support tab columns, Orgs tab URL column
6. **Integrations.tsx**: Fix stack map link `/stack-map` → `/map`
7. **Research.tsx**: Fix overflow, reposition send button
8. **Settings.tsx**: Organization URL display + domain enforcement checkbox
9. **OrgSetup.tsx**: Ensure website_url is saved
10. **verify-integration-links**: Edge function for recursive link checking

## Technical Details

- **PDF multimodal**: Gemini supports `inline_data` with `application/pdf` mime type. Convert the downloaded blob to base64 and send as a content part. This gives the AI actual document content including tables.
- **Editable fields**: Change each field row from `<span>` to `<Input>` with the extracted value, so users can modify before importing. Store editable state in a new `editableFields` state object.
- **Contract column**: In the app spend table, join `allContracts` by `user_application_id` to show Yes/No and a download button.
- **Link verification**: Use `fetch` with `HEAD` method + follow redirects. Store results in `last_verified` timestamp + a new `link_status` column (`verified` | `dead` | `unchecked`).