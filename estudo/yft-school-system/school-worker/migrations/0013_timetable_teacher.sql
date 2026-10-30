-- Professor de cada tempo do horário, para o professor ver as suas aulas.
-- teacher_name continua como texto livre (professor sem conta, substituto).
ALTER TABLE TimetableSlots ADD COLUMN teacher_uid TEXT REFERENCES Users(uid) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_timetable_school_teacher_day
    ON TimetableSlots(school_id, teacher_uid, weekday, start_time);
