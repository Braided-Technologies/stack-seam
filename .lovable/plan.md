

## Fix: Chat Panel Overlap + Post-Answer Follow-Up

### Problem 1: Overlap with top icons
The `SheetContent` has `p-0` but the default Sheet close button (X) from shadcn overlaps with the header content. The chat panel's `SheetHeader` needs top padding or the sheet's built-in close button needs to be accounted for. The fixed help button at `bottom-6 right-6 z-50` may also overlap other UI elements.

### Problem 2: Post-answer UX
Rather than a full "anything else?" prompt with yes/no, a lighter approach works better: after the assistant finishes responding, show a subtle "follow-up suggestions" area with the quick action buttons again (minus the welcome text). This lets users either type freely or tap a quick action without an extra confirmation step.

### Plan

**1. Fix overlap (HelpChatPanel.tsx)**
- Add proper spacing to the `SheetContent` so the built-in close button doesn't overlap the header. Adjust `SheetHeader` padding-right to account for the X button.
- Ensure the floating help button doesn't overlap other fixed UI elements by adjusting z-index if needed.

**2. Add follow-up quick actions after assistant response**
- After the assistant finishes streaming (when `isLoading` becomes false and the last message is from the assistant), show a condensed set of quick action chips below the last message.
- These will be smaller, inline buttons (not the full welcome card layout) — just the labels like "Browse Help Articles", "Submit Feedback", "Ask another question".
- Tapping one triggers the same `handleQuickAction` logic already in place.
- This avoids the awkward "anything else?" yes/no flow while still guiding users.

### Files to modify
- `src/components/HelpChatPanel.tsx` — fix padding/overlap, add follow-up quick actions after assistant response

