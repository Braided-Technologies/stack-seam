
-- Add screenshot_urls column to feedback
ALTER TABLE public.feedback ADD COLUMN screenshot_urls text[] DEFAULT '{}';

-- Create storage bucket for feedback screenshots
INSERT INTO storage.buckets (id, name, public) VALUES ('feedback-screenshots', 'feedback-screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- Users can upload to their own folder
CREATE POLICY "Users can upload feedback screenshots"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'feedback-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can view their own screenshots
CREATE POLICY "Users can view own feedback screenshots"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'feedback-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Platform admins can view all feedback screenshots
CREATE POLICY "Platform admins can view all feedback screenshots"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'feedback-screenshots' AND is_platform_admin());
