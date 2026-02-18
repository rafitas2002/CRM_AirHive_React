-- Adds profile avatar support and multi-job-position support for employee profiles.
-- Designed to be compatible with current CRM flow and future RH module as shared source.

-- 1) Profile avatar URL in profiles.
ALTER TABLE IF EXISTS profiles
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2) Multi-position support in employee_profiles.
ALTER TABLE IF EXISTS employee_profiles
ADD COLUMN IF NOT EXISTS job_position_ids UUID[] DEFAULT '{}'::UUID[];

-- Backfill existing single position to multi-position array.
UPDATE employee_profiles
SET job_position_ids = ARRAY[job_position_id]::UUID[]
WHERE job_position_id IS NOT NULL
  AND (job_position_ids IS NULL OR cardinality(job_position_ids) = 0);

-- 3) Storage bucket for profile avatars.
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-avatars', 'profile-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 4) Storage policies for admin/RH to manage avatar files.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'Authenticated can view profile avatars'
    ) THEN
        CREATE POLICY "Authenticated can view profile avatars"
            ON storage.objects
            FOR SELECT
            TO authenticated
            USING (bucket_id = 'profile-avatars');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'Admin RH can insert profile avatars'
    ) THEN
        CREATE POLICY "Admin RH can insert profile avatars"
            ON storage.objects
            FOR INSERT
            TO authenticated
            WITH CHECK (
                bucket_id = 'profile-avatars'
                AND EXISTS (
                    SELECT 1
                    FROM profiles p
                    WHERE p.id = auth.uid()
                      AND p.role IN ('admin', 'rh')
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'Admin RH can update profile avatars'
    ) THEN
        CREATE POLICY "Admin RH can update profile avatars"
            ON storage.objects
            FOR UPDATE
            TO authenticated
            USING (
                bucket_id = 'profile-avatars'
                AND EXISTS (
                    SELECT 1
                    FROM profiles p
                    WHERE p.id = auth.uid()
                      AND p.role IN ('admin', 'rh')
                )
            )
            WITH CHECK (
                bucket_id = 'profile-avatars'
                AND EXISTS (
                    SELECT 1
                    FROM profiles p
                    WHERE p.id = auth.uid()
                      AND p.role IN ('admin', 'rh')
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'Admin RH can delete profile avatars'
    ) THEN
        CREATE POLICY "Admin RH can delete profile avatars"
            ON storage.objects
            FOR DELETE
            TO authenticated
            USING (
                bucket_id = 'profile-avatars'
                AND EXISTS (
                    SELECT 1
                    FROM profiles p
                    WHERE p.id = auth.uid()
                      AND p.role IN ('admin', 'rh')
                )
            );
    END IF;
END;
$$;
