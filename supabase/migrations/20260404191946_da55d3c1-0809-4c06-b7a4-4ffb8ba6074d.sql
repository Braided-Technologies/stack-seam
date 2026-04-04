CREATE POLICY "Platform admins can upload contracts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'contracts' AND is_platform_admin());