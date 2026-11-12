-- Comunicados para quem: todos, só encarregados, só professores, ou os
-- encarregados de uma turma. Os que já existem eram só para encarregados.
ALTER TABLE Notices ADD COLUMN audience TEXT NOT NULL DEFAULT 'parents'
    CHECK (audience IN ('all', 'parents', 'teachers', 'class'));
ALTER TABLE Notices ADD COLUMN class_id TEXT REFERENCES Classes(id) ON DELETE CASCADE;
ALTER TABLE Notices ADD COLUMN created_by TEXT;
