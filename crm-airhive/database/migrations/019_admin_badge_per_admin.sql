-- Allow per-admin badge key/label to be stored dynamically.

ALTER TABLE admin_badge_grants
    ALTER COLUMN badge_key DROP DEFAULT;

ALTER TABLE admin_badge_grants
    ALTER COLUMN badge_label DROP DEFAULT;
