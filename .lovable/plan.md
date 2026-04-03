
# IT Stack Intelligence Portal

## Overview
A multi-user platform for IT/MSP teams to catalog their software stack, track contracts/costs, manage vendor contacts, and discover integrations between tools — visualized as an interactive node graph.

## Core Pages & Features

### 1. Authentication & Teams
- Email/password login via Lovable Cloud
- User profiles with organization/team association
- Role-based access (admin, member)

### 2. Onboarding / Stack Builder
- Category-based selection flow: PSA/Ticketing, RMM, Accounting, HRS, GRC, Documentation, Cybersecurity, Backup, Networking, etc.
- Each category shows common industry solutions (pre-populated list: HaloPSA, Autotask, ConnectWise, N-central, Datto, Xero, QuickBooks, IT Glue, Hudu, etc.)
- "Add Custom" option for unlisted tools
- Selecting a tool adds it to the user's stack

### 3. Application Detail / Contract Management
- Per-app detail page with: vendor name, category, cost (monthly/annual), renewal date, term length, license count, notes
- Upload contract PDFs (stored in Supabase Storage)
- Vendor contact section: rep name, email, phone, support URL, general company contact info
- Renewal alerts/reminders

### 4. Stack Map — Interactive Node Graph
- Visual graph (using React Flow) showing all apps as nodes, grouped/colored by category
- Lines/edges between nodes represent available integrations
- Click an edge/connection to see: what data is shared, integration type (native, API, Zapier, etc.), and links to setup documentation
- Zoom, pan, drag nodes to rearrange
- Filter by category or connection status (connected vs. available)

### 5. AI-Powered Integration Discovery
- Edge function using Lovable AI to research integrations between the user's selected tools
- On adding a new tool, AI researches its available integrations with existing stack tools
- Periodic re-check capability (user-triggered "refresh integrations" button)
- Results stored in DB: source app, target app, integration description, data shared, documentation URL, last verified date

### 6. Dashboard
- Summary view: total apps, total monthly/annual spend, upcoming renewals
- Quick stats on integration coverage (how many possible integrations are active vs. available)
- Recent changes / new integrations discovered

## Database Schema (high-level)
- **organizations** — team/company info
- **user_roles** — role-based access (admin, member)
- **categories** — PSA, RMM, Accounting, etc.
- **applications** — master list of known apps (name, category, logo, vendor URL)
- **user_applications** — apps in user's stack (linked to org, with cost, renewal, contract details)
- **contacts** — vendor contacts per application
- **integrations** — known integrations between apps (source, target, description, docs URL, last_verified)
- **contract_files** — uploaded contract PDFs (Supabase Storage references)

## Tech Approach
- React + Tailwind + shadcn/ui for the interface
- React Flow for the interactive node graph
- Lovable Cloud for auth + database + storage
- Lovable AI edge function for integration research
- RLS policies ensuring org-level data isolation

## Design Direction
- Clean, professional dashboard aesthetic
- Category blocks with app logos/icons for the stack builder
- Color-coded nodes on the graph by category
- Responsive layout (desktop-first, functional on tablet)
