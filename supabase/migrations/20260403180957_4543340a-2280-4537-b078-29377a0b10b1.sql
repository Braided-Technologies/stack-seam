-- Add DNS Filtering category
INSERT INTO public.categories (name, icon, display_order)
VALUES ('DNS Filtering', 'Shield', 28);

-- Add Virtualization category
INSERT INTO public.categories (name, icon, display_order)
VALUES ('Virtualization', 'Server', 29);

-- Add DNS Filtering apps
INSERT INTO public.applications (name, category_id, description)
VALUES
  ('DNSFilter', (SELECT id FROM categories WHERE name = 'DNS Filtering'), 'AI-powered DNS threat protection'),
  ('Cisco Umbrella', (SELECT id FROM categories WHERE name = 'DNS Filtering'), 'Cloud-delivered DNS security'),
  ('WebTitan', (SELECT id FROM categories WHERE name = 'DNS Filtering'), 'DNS filtering and web security'),
  ('SafeDNS', (SELECT id FROM categories WHERE name = 'DNS Filtering'), 'Cloud-based DNS filtering service');

-- Add Virtualization apps
INSERT INTO public.applications (name, category_id, description)
VALUES
  ('VMware vSphere', (SELECT id FROM categories WHERE name = 'Virtualization'), 'Enterprise virtualization platform'),
  ('Microsoft Hyper-V', (SELECT id FROM categories WHERE name = 'Virtualization'), 'Windows Server virtualization'),
  ('Proxmox', (SELECT id FROM categories WHERE name = 'Virtualization'), 'Open-source virtualization management'),
  ('Nutanix', (SELECT id FROM categories WHERE name = 'Virtualization'), 'Hyperconverged infrastructure platform');