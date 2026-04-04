## Help Center — Knowledge Base + AI Chatbot

### Phase 1: Database & Backend
1. **`kb_articles` table** — title, slug, content (markdown), category, tags, published, display_order, created/updated timestamps. Platform admin only for CRUD; all authenticated users can read published articles.
2. **`kb_categories` table** — name, icon, display_order. Platform admin managed.
3. **AI chat edge function** — Uses Lovable AI (gemini-3-flash-preview) with streaming. System prompt includes:
   - KB article content (fetched from DB based on user query)
   - User's current stack apps and integrations (fetched via service role)
   - General MSP best practices context
   - Instructions to recommend KB articles and escalate to feedback system when unable to help

### Phase 2: Help Page (`/help`)
- Search bar for KB articles
- Category-grouped article listing
- Individual article view with markdown rendering
- Platform admin: create/edit/delete/publish articles inline

### Phase 3: AI Chat Panel
- Floating help button (?) accessible from anywhere
- Slide-out chat drawer with streaming AI responses
- Bot recommends relevant KB articles inline
- "Open a support ticket" button that routes to existing feedback dialog
- Conversation history per session (in-memory, not persisted)

### Tech Stack
- Lovable AI Gateway via edge function for chat
- react-markdown for article + chat rendering
- Existing feedback system for escalation
