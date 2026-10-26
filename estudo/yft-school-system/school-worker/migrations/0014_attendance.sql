-- Presenças diárias por aluno. Uma linha por aluno e dia; marcar de novo
-- o mesmo dia actualiza a linha.
CREATE TABLE IF NOT EXISTS Attendance (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    date TEXT NOT NULL,
    present INTEGER NOT NULL CHECK (present IN (0, 1)),
    marked_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES Schools(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES Students(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES Classes(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_student_day
    ON Attendance(school_id, student_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_class_day
    ON Attendance(school_id, class_id, date);
