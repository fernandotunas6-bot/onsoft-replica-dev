-- Fee receipts shown to parents; in-app notices with read tracking.
CREATE TABLE Receipts (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    parent_uid TEXT,
    transaction_id TEXT NOT NULL UNIQUE,
    amount_paid REAL NOT NULL,
    balance_before REAL NOT NULL,
    balance_after REAL NOT NULL,
    amount_to_debt REAL NOT NULL,
    credit_added REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'GHS',
    student_name TEXT,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES Schools(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES Students(id) ON DELETE CASCADE
);

CREATE INDEX idx_receipts_school_parent ON Receipts(school_id, parent_uid);

CREATE TABLE Notices (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    parent_uid TEXT,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES Schools(id) ON DELETE CASCADE
);

CREATE INDEX idx_notices_school_created ON Notices(school_id, created_at);

CREATE TABLE NoticeReads (
    notice_id TEXT NOT NULL,
    user_uid TEXT NOT NULL,
    read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notice_id, user_uid),
    FOREIGN KEY (notice_id) REFERENCES Notices(id) ON DELETE CASCADE
);
