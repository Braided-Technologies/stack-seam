
-- Add new category
INSERT INTO public.categories (name, icon, display_order)
VALUES ('Alerting & Incident Management', 'Bell', 32)
ON CONFLICT DO NOTHING;

-- Add popular apps for this category
INSERT INTO public.applications (name, description, category_id, status)
SELECT 'PagerDuty', 'Digital operations management platform for incident response', c.id, 'approved'
FROM public.categories c WHERE c.name = 'Alerting & Incident Management'
AND NOT EXISTS (SELECT 1 FROM public.applications WHERE name = 'PagerDuty');

INSERT INTO public.applications (name, description, category_id, status)
SELECT 'iLert', 'Incident management and on-call scheduling platform', c.id, 'approved'
FROM public.categories c WHERE c.name = 'Alerting & Incident Management'
AND NOT EXISTS (SELECT 1 FROM public.applications WHERE name = 'iLert');

INSERT INTO public.applications (name, description, category_id, status)
SELECT 'Opsgenie', 'Alerting and on-call management by Atlassian', c.id, 'approved'
FROM public.categories c WHERE c.name = 'Alerting & Incident Management'
AND NOT EXISTS (SELECT 1 FROM public.applications WHERE name = 'Opsgenie');

INSERT INTO public.applications (name, description, category_id, status)
SELECT 'xMatters', 'Service reliability platform with intelligent alerting', c.id, 'approved'
FROM public.categories c WHERE c.name = 'Alerting & Incident Management'
AND NOT EXISTS (SELECT 1 FROM public.applications WHERE name = 'xMatters');

INSERT INTO public.applications (name, description, category_id, status)
SELECT 'Squadcast', 'Incident management and reliability automation platform', c.id, 'approved'
FROM public.categories c WHERE c.name = 'Alerting & Incident Management'
AND NOT EXISTS (SELECT 1 FROM public.applications WHERE name = 'Squadcast');
