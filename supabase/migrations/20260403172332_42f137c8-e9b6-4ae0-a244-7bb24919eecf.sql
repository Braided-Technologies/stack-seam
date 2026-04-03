
-- Allow service role to insert integrations (edge function uses service role key)
-- The service role bypasses RLS, so no explicit policy needed for it.
-- But we need to allow authenticated users to trigger the refresh via the edge function.
-- No RLS changes needed since the edge function uses service_role_key which bypasses RLS.
SELECT 1;
