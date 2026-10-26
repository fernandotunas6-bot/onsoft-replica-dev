-- Horário semanal por turma. Um tempo é uma disciplina (subject_id) ou uma
-- pausa com título próprio (Almoço, Intervalo). Horas em "HH:MM", 24 h.
CREATE TABLE IF NOT EXISTS TimetableSlots (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    subject_id TEXT,
    title TEXT,
    weekday INTEGER NOT NULL CHECK(weekday BETWEEN 1 AND 7),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    room TEXT,
    teacher_name TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (subject_id IS NOT NULL OR title IS NOT NULL),
    CHECK (end_time > start_time),
    FOREIGN KEY (school_id) REFERENCES Schools(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES Classes(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES Subjects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_timetable_school_class_day
    ON TimetableSlots(school_id, class_id, weekday, start_time);
