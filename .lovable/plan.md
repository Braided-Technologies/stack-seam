

# Fix Integrations Quality, Reorganize Categories, Move Team to Settings, Add Stack Map Features

## Problems Identified

1. **Bogus integrations** — AI is hallucinating integrations that don't exist (e.g., Exclaimer integrating with Checkr). 51 of 117 integrations have no documentation URL. Need to require documentation proof.
2. **Misplaced apps** — Barracuda Email Protection and Mimecast are under "Email & Collaboration" but should be "Email Security". "Mesh Security" is under Cybersecurity but should just be "Mesh" in Email Security (there's already a correct entry).
3. **Missing categories** — DNS Filtering (e.g., DNSFilter, Cisco Umbrella, WebTitan) and Virtualization (VMware, Hyper-V, Proxmox) are not represented.
4. **Team page** — Should be a tab within Settings, not its own nav item.
5. **Stack Map** — Needs a category legend with show/hide toggles, and an auto-layout button that groups nodes by category.

---

## Plan

### 1. Data Cleanup (Migration)

- **Move Barracuda Email Protection and Mimecast** from "Email & Collaboration" to "Email Security"
- **Delete "Mesh Security"** from Cybersecurity (duplicate of "Mesh" in Email Security)
- **Delete integrations without documentation URLs** — purge all 51 records where `documentation_url IS NULL`
- **Add new category: "DNS Filtering"** with apps: DNSFilter, Cisco Umbrella, WebTitan, SafeDNS
- **Add new category: "Virtualization"** with apps: VMware vSphere, Microsoft Hyper-V, Proxmox, Nutanix
- **Add unique constraint** on `integrations(source_app_id, target_app_id)` if not already present (needed for upsert)

### 2. Require Documentation URL for Integrations

Update `supabase/functions/discover-integrations/index.ts`:
- Add `documentation_url` as a **required** field in the AI tool schema
- Add a post-processing filter: discard any integration where `documentation_url` is empty, null, or clearly fabricated
- Update the AI prompt to say "Only include integrations where you can provide a real, verifiable documentation URL. Do NOT fabricate URLs."

### 3. Update Constants & Category Groups

- **`src/lib/constants.ts`** — Add `CATEGORY_COLORS` and `CATEGORY_ICONS` entries for "DNS Filtering" and "Virtualization"
- **`src/lib/categoryGroups.ts`** — Add "DNS Filtering" to Security group, add "Virtualization" to Infrastructure group

### 4. Move Team into Settings

- **`src/pages/Settings.tsx`** — Add a "Team" tab using the existing `Tabs` component. Import and embed the team management UI (invite form, members list, pending invitations) directly into Settings.
- **`src/components/AppLayout.tsx`** — Remove the Team nav item from the sidebar.
- **`src/App.tsx`** — Remove the `/team` route. Add a redirect from `/team` to `/settings` for bookmarks.
- **Delete** `src/pages/Team.tsx` (move its content into Settings).

### 5. Stack Map: Category Legend with Show/Hide

Add a legend panel to `src/pages/StackMap.tsx`:
- Render a collapsible panel (top-right) listing each category present in the user's stack with its color dot
- Each category has a checkbox/toggle to show or hide nodes of that type
- Hidden nodes and their connected edges are filtered out from the ReactFlow render
- State managed via a `Set<string>` of hidden category names

### 6. Stack Map: Auto-Layout by Category

Add a "Group by Category" button to the Stack Map panel:
- When clicked, recalculates node positions to cluster apps by category in distinct sectors (arranged in a circle or grid)
- Each category group gets a label node (non-interactive, styled as a header)
- Apps within each group are arranged in a compact sub-grid
- Uses a simple algorithmic layout (no external library needed) — categories placed in a circle with radius based on count, apps in a small grid within each sector

---

## Technical Details

- The discover-integrations edge function change is the key quality fix — by making `documentation_url` required and filtering out entries without valid URLs, we prevent hallucinated integrations from ever being saved
- The Team-to-Settings merge uses Tabs with three tabs: "Company", "AI Configuration", "Team" 
- Stack Map legend uses `useMemo` to derive visible nodes/edges from the hidden categories set
- Auto-layout computes positions deterministically from category groupings — no physics simulation needed

