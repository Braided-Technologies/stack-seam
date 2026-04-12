import { Step } from 'react-joyride';

export type SiteTourStep = Step & {
  /** The route this step's target lives on */
  page: string;
};

/**
 * Single unified site tour. Steps are ordered sequentially —
 * the tour navigates the user through each page automatically.
 *
 * All steps have disableBeacon so tooltips open immediately.
 */
export const siteTourSteps: SiteTourStep[] = [
  // ── Welcome / Sidebar (visible on all pages, start on Dashboard) ──
  {
    page: '/',
    target: '[data-tour="sidebar-nav"]',
    content:
      'Welcome to StackSeam! This is your navigation sidebar — from here you can access your dashboard, stack, integrations, budget, and more.',
    placement: 'right',
    disableBeacon: true,
    skipBeacon: true,
  },
  {
    page: '/',
    target: '[data-tour="sidebar-org"]',
    content:
      'This shows your current organization. All data in StackSeam is scoped to your org so your team sees the same stack.',
    placement: 'right',
    disableBeacon: true,
    skipBeacon: true,
  },
  {
    page: '/',
    target: '[data-tour="sidebar-theme"]',
    content: 'Switch between light and dark mode here. Your preference is saved across sessions.',
    placement: 'right',
    disableBeacon: true,
    skipBeacon: true,
  },

  // ── Dashboard ──
  {
    page: '/',
    target: '[data-tour="dash-stats"]',
    content:
      'These are your key figures — total apps in your stack, monthly and annual spend, and how many integrations are available between your apps.',
    placement: 'bottom',
    disableBeacon: true,
    skipBeacon: true,
  },
  {
    page: '/',
    target: '[data-tour="dash-renewals"]',
    content:
      'Upcoming renewals based on contract data you\'ve provided. Filter by 30, 60, or 90 days out. Urgent renewals get highlighted above.',
    placement: 'top',
    disableBeacon: true,
    skipBeacon: true,
  },
  {
    page: '/',
    target: '[data-tour="dash-integrations"]',
    content:
      'Available integrations you haven\'t enabled yet — a great starting point for optimizing your stack. Let\'s head to My Stack next.',
    placement: 'top',
    disableBeacon: true,
    skipBeacon: true,
  },

  // ── My Stack ──
  {
    page: '/stack',
    target: '[data-tour="stack-header"]',
    content:
      'This is My Stack — the central place to manage which applications your organization uses, organized by category.',
    placement: 'bottom',
    disableBeacon: true,
    skipBeacon: true,
  },
  {
    page: '/stack',
    target: '[data-tour="stack-actions"]',
    content:
      'Use "Find a Tool" to search for and add apps. If a tool isn\'t in our database, we\'ll search for it and you can confirm the details. Export your entire stack to CSV for reporting.',
    placement: 'bottom',
    disableBeacon: true,
    skipBeacon: true,
  },
  {
    page: '/stack',
    target: '[data-tour="stack-search"]',
    content:
      'Search across all your applications or filter by category to quickly find what you need.',
    placement: 'bottom',
    disableBeacon: true,
    skipBeacon: true,
  },
  {
    page: '/stack',
    target: '[data-tour="stack-categories"]',
    content:
      'Apps are grouped into sections — Core Operations, Security, Finance, Infrastructure, Productivity, and Strategy. Click any app for details. Now let\'s see the Stack Map.',
    placement: 'top',
    disableBeacon: true,
    skipBeacon: true,
  },

  // ── Stack Map ──
  {
    page: '/map',
    target: '[data-tour="map-canvas"]',
    content:
      'The Stack Map shows how all your applications are connected through integrations. Drag to pan, scroll to zoom, and click any app or connection for details.',
    placement: 'center',
    disableBeacon: true,
    skipBeacon: true,
  },
  {
    page: '/map',
    target: '[data-tour="map-controls"]',
    content:
      'Run a discovery scan to find new integrations, toggle the layout view, or jump to the full integrations list.',
    placement: 'right',
    disableBeacon: true,
    skipBeacon: true,
  },
  {
    page: '/map',
    target: '[data-tour="map-legend"]',
    content:
      'Show or hide categories and sub-types to focus on the connections that matter most. Next up: Integrations.',
    placement: 'left',
    disableBeacon: true,
    skipBeacon: true,
  },

  // ── Integrations ──
  {
    page: '/integrations',
    target: '[data-tour="int-header"]',
    content:
      'The Integrations page shows all available connections between your apps. Manage which ones are active, pending, or hidden.',
    placement: 'bottom',
    disableBeacon: true,
    skipBeacon: true,
  },
  {
    page: '/integrations',
    target: '[data-tour="int-discover"]',
    content:
      '"Discover Integrations" scans all your apps at once for available connections. You can also discover individually as you go through your list.',
    placement: 'bottom',
    disableBeacon: true,
    skipBeacon: true,
  },
  {
    page: '/integrations',
    target: '[data-tour="int-list"]',
    content:
      'Integrations are grouped by category. Expand each app to see its connections, then check them off as configured, skip, or hide. Let\'s check out Budget next.',
    placement: 'top',
    disableBeacon: true,
    skipBeacon: true,
  },

  // ── Budget ──
  {
    page: '/budget',
    target: '[data-tour="budget-header"]',
    content:
      'Budget & Spend gives you a complete picture of what your organization spends across all tools.',
    placement: 'bottom',
    disableBeacon: true,
    skipBeacon: true,
  },
  {
    page: '/budget',
    target: '[data-tour="budget-stats"]',
    content:
      'Key spend metrics — monthly total, annual total, apps with contracts on file, and upcoming renewals.',
    placement: 'bottom',
    disableBeacon: true,
    skipBeacon: true,
  },
  {
    page: '/budget',
    target: '[data-tour="budget-table"]',
    content:
      'Click any row to edit — manually enter spend info or upload a contract/invoice that will be parsed for seat count, renewal dates, and more. On to Research!',
    placement: 'top',
    disableBeacon: true,
    skipBeacon: true,
  },

  // ── Research ──
  {
    page: '/research',
    target: '[data-tour="research-header"]',
    content:
      'The AI Research Assistant helps you explore your stack, compare tools, research alternatives, and get recommendations.',
    placement: 'bottom',
    disableBeacon: true,
    skipBeacon: true,
  },
  {
    page: '/research',
    target: '[data-tour="research-prompts"]',
    content:
      'Not sure where to start? These suggested prompts cover common questions about your stack.',
    placement: 'top',
    disableBeacon: true,
    skipBeacon: true,
  },
  {
    page: '/research',
    target: '[data-tour="research-input"]',
    content:
      'Type your questions here — ask about tools, compare alternatives, or get optimization advice. Almost done — let\'s look at Support.',
    placement: 'top',
    disableBeacon: true,
    skipBeacon: true,
  },

  // ── Support ──
  {
    page: '/support',
    target: '[data-tour="support-tabs"]',
    content:
      'Support has a searchable Knowledge Base for self-service help and a Feedback & Tickets system to report issues or suggest features.',
    placement: 'bottom',
    disableBeacon: true,
    skipBeacon: true,
  },
  {
    page: '/support',
    target: '[data-tour="support-search"]',
    content:
      'Search for articles on getting started, features, integrations, and more. That\'s the tour! You\'re all set to start using StackSeam.',
    placement: 'bottom',
    disableBeacon: true,
    skipBeacon: true,
  },
];

/** Get the ordered list of unique pages in the tour */
export const tourPages = [...new Set(siteTourSteps.map(s => s.page))];

/** Get only the steps for a specific page */
export function getStepsForPage(page: string): SiteTourStep[] {
  return siteTourSteps.filter(s => s.page === page);
}

/** Get the global start index for a given page */
export function getPageStartIndex(page: string): number {
  return siteTourSteps.findIndex(s => s.page === page);
}

/** Get the next page after the given one, or null if last */
export function getNextPage(page: string): string | null {
  const idx = tourPages.indexOf(page);
  return idx >= 0 && idx < tourPages.length - 1 ? tourPages[idx + 1] : null;
}
