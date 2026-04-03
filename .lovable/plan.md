

# App Info Panel on Stack, Collapse All, Stack Map Quadrants, ScalePad + M365 SSO

## 1. App Click -> Info Panel on My Stack

**File: `src/pages/Stack.tsx`**

When a user clicks an app row in the stack list, show an info popover/panel with:
- App name, description, and vendor URL (from `applications` table)
- A "Show Possible Integrations" button that queries the `integrations` table for all integrations involving that app (not just ones in user's stack) and lists them
- Category badge
- Quick actions: open vendor site, view on Stack Map

This replaces the current behavior where clicking only shows the settings gear for selected apps. The info panel will be a Dialog with tabs: "Overview" (description, URL, category) and "Integrations" (list of all known integrations for that app, with indicators for which connected apps are already in the user's stack).

## 2. Collapse All Button

**File: `src/pages/Stack.tsx`**

Add a "Collapse All" / "Expand All" toggle button next to the search bar. When clicked:
- Sets all group labels into `collapsedGroups`
- A second click clears the set to expand all

## 3. Stack Map Grouped Layout -> Named Quadrants

**File: `src/pages/StackMap.tsx`**

Refactor the group layout to use `CATEGORY_GROUPS` (Core Operations, Security, Business & Finance, Infrastructure, Productivity & Communication, Strategy) as named sectors instead of individual categories:
- Arrange the 6 groups in a 3x2 grid layout with generous spacing
- Each sector gets a large semi-transparent background rectangle node with the group name as a header
- Apps within each sector are arranged in a compact grid
- Categories within each sector share a sub-label
- This makes it feel like distinct "zones" on the map you can navigate between

## 4. ScalePad Lifecycle Manager Integration

**New edge function: `supabase/functions/scalepad-sync/index.ts`**

- Accepts the ScalePad API key (stored as a secret)
- Pulls contract/asset data from ScalePad's API
- Maps ScalePad assets to matching applications in the `applications` table by name
- Updates `user_applications` with contract dates, costs, license counts from ScalePad
- Adds a "Sync from ScalePad" button on the Settings page under a new "Integrations" tab

**File: `src/pages/Settings.tsx`** — Add an "Integrations" tab with ScalePad sync config and trigger button.

Before implementation: will use `add_secret` to request the ScalePad API key from the user.

## 5. M365 SSO (Sign in with Microsoft)

Lovable Cloud does not natively support Microsoft/Azure AD as an OAuth provider. The supported providers are Google, Apple, Email, and Phone.

**Options:**
- **Google OAuth** is natively supported if that helps
- For Microsoft SSO specifically, you would need to connect an external Supabase project and configure Azure AD there
- Alternatively, we could implement a custom OAuth flow via an edge function that handles the Microsoft OAuth dance, but this is complex

I'll note this limitation and we can discuss the best path forward.

---

## Technical Details

- **App info panel** reuses the existing `useIntegrations` hook data. The "possible integrations" list shows all integrations where the app is source or target, with a green indicator for apps already in the user's stack.
- **Stack Map quadrants** use `CATEGORY_GROUPS` from `categoryGroups.ts` to cluster categories into 6 zones. Each zone is a large non-interactive background node + label, with app nodes positioned inside.
- **ScalePad** — will need to research their API endpoints. The edge function will authenticate with their API key and pull asset/contract data. We'll use the `add_secret` tool to store the key.
- **M365 SSO** — Not available natively in Lovable Cloud. Will document as a future item unless you want to pursue the custom edge function approach.

