// Logical groupings of categories for the Stack page
export const CATEGORY_GROUPS: { label: string; categories: string[] }[] = [
  {
    label: 'Core Operations',
    categories: ['PSA / Ticketing', 'RMM', 'Documentation', 'Monitoring', 'Endpoint Management', 'M365 Management'],
  },
  {
    label: 'Security',
    categories: ['Cybersecurity', 'Email Security', 'Identity & Access', 'Security Testing', 'Security Awareness Training', 'GRC / Compliance', 'DNS Filtering'],
  },
  {
    label: 'Business & Finance',
    categories: ['Accounting', 'Billing & Invoicing', 'Distributors', 'Sales & CRM', 'HRS / HR', 'Background Check'],
  },
  {
    label: 'Infrastructure',
    categories: ['Backup & DR', 'Networking', 'Cloud Platforms', 'Virtualization'],
  },
  {
    label: 'Productivity & Communication',
    categories: ['Email & Collaboration', 'Communication', 'Client Portal', 'AI & LLMs', 'Social Media'],
  },
  {
    label: 'Strategy',
    categories: ['vCIO / Lifecycle Management'],
  },
];
