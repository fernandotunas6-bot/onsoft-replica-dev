PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS Schools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT,
    term_system INTEGER NOT NULL DEFAULT 3,
    current_term_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Users (
    uid TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'teacher', 'parent')),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES Schools(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_school_phone ON Users(school_id, phone);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_school_email ON Users(school_id, email);
CREATE INDEX IF NOT EXISTS idx_users_school_role ON Users(school_id, role);

CREATE TABLE IF NOT EXISTS Classes (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    class_name TEXT NOT NULL,
    level INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES Schools(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_school_name ON Classes(school_id, class_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_school_level ON Classes(school_id, level);

CREATE TABLE IF NOT EXISTS Subjects (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES Schools(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subjects_school_name ON Subjects(school_id, name);

CREATE TABLE IF NOT EXISTS SubjectClasses (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES Schools(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES Subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES Classes(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subject_classes_unique
    ON SubjectClasses(school_id, subject_id, class_id);
CREATE INDEX IF NOT EXISTS idx_subject_classes_school_class
    ON SubjectClasses(school_id, class_id);

CREATE TABLE IF NOT EXISTS Students (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    parent_uid TEXT,
    name TEXT NOT NULL,
    dob TEXT,
    gender TEXT,
    balance REAL NOT NULL DEFAULT 0.00,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES Schools(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES Classes(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_uid) REFERENCES Users(uid) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_students_school_class ON Students(school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_students_school_name ON Students(school_id, name);
CREATE INDEX IF NOT EXISTS idx_students_school_parent ON Students(school_id, parent_uid);

CREATE TABLE IF NOT EXISTS Enrollments (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    term_id TEXT NOT NULL,
    class_score REAL NOT NULL DEFAULT 0.00,
    exam_score REAL NOT NULL DEFAULT 0.00,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES Schools(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES Students(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES Subjects(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_unique
    ON Enrollments(school_id, student_id, subject_id, term_id);

CREATE TABLE IF NOT EXISTS Transactions (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('payment', 'charge')),
    description TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES Schools(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES Students(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transactions_school_student
    ON Transactions(school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_transactions_school_created
    ON Transactions(school_id, created_at);

CREATE TABLE IF NOT EXISTS DeviceTokens (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    user_uid TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    platform TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES Schools(id) ON DELETE CASCADE,
    FOREIGN KEY (user_uid) REFERENCES Users(uid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_school_user
    ON DeviceTokens(school_id, user_uid);
