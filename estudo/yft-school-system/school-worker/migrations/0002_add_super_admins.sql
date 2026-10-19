-- Migration to add a dedicated table for Super Admins (system-wide administrators)
CREATE TABLE IF NOT EXISTS SuperAdmins (
    uid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'super_admin',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
