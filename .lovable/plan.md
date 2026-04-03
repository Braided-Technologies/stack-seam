

# Add Tool Search & Discovery to Stack Page

## Problem
The pre-seeded applications list doesn't cover every tool (e.g., Drata for GRC). Users need a way to find and add tools that aren't already in the catalog.

## What We're Building

A "Search & Add Tool" feature on the Stack page that lets users:
1. **Search by name** — type a tool name (e.g., "Drata") and get it looked up via AI, which returns the tool's name, description, category, vendor URL, and logo
2. **Add to catalog** — once found, the tool gets added to the global `applications` table so everyone can use it
3. **Seed more tools** — run a one-time migration to add ~50+ more popular MSP tools across all categories (including GRC tools like Drata, Vanta, Tugboat Logic, etc.)

## Plan

### 1. Seed More Applications (Migration)
Add a comprehensive batch of additional MSP tools to the `applications` table across all categories. Focus on filling gaps in GRC/Compliance, Cybersecurity, Endpoint Management, and other underrepresented categories. This is a SQL migration with INSERT statements.

### 2. Create "Search Tool" Edge Function
**File:** `supabase/functions/search-tool/index.ts`

Accepts a search query (name or URL). Uses AI to identify the tool and return structured data: name, description, category, vendor URL. Then inserts it into the `applications` table using the service role client (since the table is read-only for regular users). Returns the new application record so the frontend can immediately offer to add it to the user's stack.

- Checks if the tool already exists in the catalog first (fuzzy match by name)
- If it exists, returns the existing record
- If not, uses AI to research the tool, then inserts it

### 3. Add Search UI to Stack Page
**File:** `src/pages/Stack.tsx`

Add a "Can't find a tool?" button/section that opens a dialog where admins can:
- Type a tool name or paste a vendor URL
- See the AI-identified result (name, description, category)
- Confirm to add it to the catalog
- Optionally add it to their stack immediately

### 4. Add Hook for Tool Search
**File:** `src/hooks/useStackData.ts`

Add a `useSearchTool` mutation that calls the edge function and invalidates the applications query on success.

## Technical Details

- The edge function uses `SUPABASE_SERVICE_ROLE_KEY` to insert into `applications` (bypassing the read-only RLS)
- AI lookup uses the Lovable AI gateway with structured output to get consistent tool metadata
- Category matching: the AI response includes a category name, which is matched against existing categories
- Duplicate prevention: checks `applications` table for case-insensitive name match before inserting
- Only admins can trigger the search/add flow (checked in the UI)

