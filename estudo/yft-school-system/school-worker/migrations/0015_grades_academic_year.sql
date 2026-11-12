-- As notas passam a ter ano lectivo: antes, o 1.º trimestre de um ano
-- escrevia por cima do 1.º trimestre do ano anterior.
ALTER TABLE Enrollments ADD COLUMN academic_year TEXT NOT NULL DEFAULT '';

-- As notas que já existem ficam no ano lectivo actual de cada escola (é o
-- único que o sistema conhecia). Escolas sem calendário ficam com ''.
UPDATE Enrollments
SET academic_year = COALESCE(
    (SELECT json_extract(s.academic_calendar_json, '$.academic_year')
     FROM Schools s WHERE s.id = Enrollments.school_id),
    ''
)
WHERE academic_year = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_unique_year
    ON Enrollments(school_id, student_id, subject_id, term_id, academic_year);
DROP INDEX IF EXISTS idx_enrollments_unique;
