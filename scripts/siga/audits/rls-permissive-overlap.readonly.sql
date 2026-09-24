-- SGA — diagnóstico somente leitura de políticas de escrita concorrentes.
-- Políticas PERMISSIVE do mesmo comando são combinadas com OR.
-- Uma política legada pode contornar os requisitos de outra política.
SELECT schemaname, tablename, policyname, cmd, permissive, roles,
       qual AS using_expression, with_check AS check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('people', 'students', 'class_groups',
                    'school_memberships', 'timetable_slots')
ORDER BY tablename, cmd, policyname;

-- Localizar tabelas com mais de uma política PERMISSIVE para escrita.
SELECT tablename, cmd, count(*) AS permissive_policy_count,
       array_agg(policyname ORDER BY policyname) AS policies
FROM pg_policies
WHERE schemaname = 'public'
  AND permissive = 'PERMISSIVE'
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
GROUP BY tablename, cmd
HAVING count(*) > 1
ORDER BY permissive_policy_count DESC, tablename, cmd;
