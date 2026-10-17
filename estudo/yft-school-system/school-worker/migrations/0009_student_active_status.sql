-- Active students appear in parent app; admins can deactivate without deleting.
ALTER TABLE Students ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
