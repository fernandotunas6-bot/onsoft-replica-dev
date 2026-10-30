#!/usr/bin/env python3
"""Strict, one-time conflict resolver for SIGA Plus finance integration.
Never use on main; only on the isolated integration candidate branch.
"""
from pathlib import Path
import re
import subprocess

expected = {
    "bun.lock",
    "docs/design/VISUAL_MASTER_STATUS.md",
    "src/features/finance/server.ts",
    "tests/security/rls-client-migration.test.ts",
}
conflicted = set(subprocess.check_output(
    ["git", "diff", "--name-only", "--diff-filter=U"], text=True
).strip().splitlines())
if conflicted != expected:
    raise SystemExit(f"Unexpected merge conflicts: expected {sorted(expected)}, got {sorted(conflicted)}")

marker = re.compile(r"^<<<<<<< HEAD\n(.*?)^=======\n(.*?)^>>>>>>> [^\n]+\n",
                    re.MULTILINE | re.DOTALL)

def resolve_file(name, transform):
    path = Path(name)
    source = path.read_text(encoding="utf-8")
    pairs = list(marker.finditer(source))
    if not pairs:
        raise RuntimeError(f"No conflict markers found in {name}")
    new = marker.sub(lambda match: transform(match.group(1), match.group(2)), source)
    if "<<<<<<<" in new or "=======" in new or ">>>>>>>" in new:
        raise RuntimeError(f"Unresolved markers in {name}")
    path.write_text(new, encoding="utf-8")
    return len(pairs)

def choose_patched_re2js(main, finance):
    assert "re2js@2.8.7" in main and "re2js@2.9.1" in finance, "Unexpected dependency conflict"
    return finance

def preserve_both_docs(main, finance):
    assert "Contraste dos tokens" in main and "Financeiro: lista por aluno" in finance
    return main.rstrip() + "\n\n" + finance.lstrip()

def preserve_both_security_allowlists(main, finance):
    assert "teacher-documents-server" in main and "student-ledger-server" in finance
    return main + finance

def main_batch_engine(main, finance):
    if "const TUITION_BATCH_LIMIT = 60" in main:
        assert "const TUITION_BATCH_LIMIT" not in finance
        return main
    if "const selectedIds = data.studentIds" in main:
        assert "let batchQuery = db" in finance
        return main
    raise RuntimeError("Unknown tuition batch conflict block")

counts = {
    "bun.lock": resolve_file("bun.lock", choose_patched_re2js),
    "docs/design/VISUAL_MASTER_STATUS.md": resolve_file(
        "docs/design/VISUAL_MASTER_STATUS.md", preserve_both_docs),
    "src/features/finance/server.ts": resolve_file(
        "src/features/finance/server.ts", main_batch_engine),
    "tests/security/rls-client-migration.test.ts": resolve_file(
        "tests/security/rls-client-migration.test.ts", preserve_both_security_allowlists),
}
assert counts == {
    "bun.lock": 1,
    "docs/design/VISUAL_MASTER_STATUS.md": 1,
    "src/features/finance/server.ts": 2,
    "tests/security/rls-client-migration.test.ts": 1,
}, counts

def once(source, old, new, name):
    n = source.count(old)
    if n != 1:
        raise RuntimeError(f"{name} unexpected count for {old[:75]!r}: {n}")
    return source.replace(old, new)

server_path = Path("src/features/finance/server.ts")
server = server_path.read_text(encoding="utf-8")

# Keep both legacy class-only and student-only modes; allow selected students
# within a specified class, but NEVER blindly accept a different academic year.
server = once(server,
    '    studentIds: z.array(z.string().guid()).min(1).max(TUITION_BATCH_LIMIT).optional(),\n    dueOn:',
    '    studentIds: z.array(z.string().guid()).min(1).max(TUITION_BATCH_LIMIT).optional(),\n    academicYearId: z.string().guid().optional(),\n    dueOn:', "server-schema")
server = once(server,
    '  .refine((value) => Boolean(value.classGroupId) !== Boolean(value.studentIds), {\n    message: "Seleccione uma turma ou alunos específicos, mas não ambos.",',
    '  .refine((value) => Boolean(value.classGroupId) || Boolean(value.studentIds), {\n    message: "Seleccione uma turma e/ou alunos específicos.",',
    "server-schema")
server = once(server,
    "      academicYearId = String(activeYear.id);\n    }\n    const baseQuery = db",
    '''      academicYearId = String(activeYear.id);
      if (data.academicYearId && data.academicYearId !== academicYearId) {
        throw new Error("A selecção não pertence ao ano lectivo activo. Actualize o ano antes de emitir propinas.");
      }
    }
    const baseQuery = db''', "server-year")
server = once(server,
    '''    const { data: rows, error } = selectedIds
      ? await baseQuery
          .in("student_id", selectedIds)
          .eq("academic_year_id", academicYearId!)
          .limit(TUITION_BATCH_LIMIT + 1)
      : await baseQuery.eq("class_group_id", data.classGroupId!).limit(TUITION_BATCH_LIMIT + 1);''',
    '''    // Sem escolher turma, manter o modo existente de selecção por alunos.
    // Com turma, impedir emitir propina para aluno de outra turma.
    const scopedQuery = data.classGroupId
      ? baseQuery.eq("class_group_id", data.classGroupId)
      : baseQuery;
    const { data: rows, error } = selectedIds
      ? await scopedQuery
          .in("student_id", selectedIds)
          .eq("academic_year_id", academicYearId!)
          .limit(TUITION_BATCH_LIMIT + 1)
      : await scopedQuery.limit(TUITION_BATCH_LIMIT + 1);''', "server-query")
server = once(server,
    '''    if (studentIds.length > TUITION_BATCH_LIMIT) {
      throw new Error(
        \`O lote excede \${TUITION_BATCH_LIMIT} alunos. Divida a selecção em lotes menores.\`,
      );
    }

    const result: TuitionBatchResult''',
    '''    if (studentIds.length > TUITION_BATCH_LIMIT) {
      throw new Error(
        \`O lote excede \${TUITION_BATCH_LIMIT} alunos. Divida a selecção em lotes menores.\`,
      );
    }
    if (selectedIds) {
      // A emissão individual procura a matrícula activa: a ambiguidade é
      // perigosa mesmo que a lista filtrada pela turma tenha só uma linha.
      const active = await readAllPages((from, to) =>
        db.from("enrollments")
          .select("id, student_id")
          .eq("school_id", membership.schoolId)
          .eq("status", "active")
          .in("student_id", selectedIds)
          .order("id")
          .range(from, to),
      );
      if (active.error) {
        throw publicDatabaseError(active.error, "Não foi possível validar as matrículas.");
      }
      const counts = new Map<string, number>();
      for (const row of active.data) {
        counts.set(row.student_id, (counts.get(row.student_id) ?? 0) + 1);
      }
      if (selectedIds.some((id) => counts.get(id) !== 1)) {
        throw new Error("Há alunos com matrículas activas ambíguas. Corrija as matrículas antes de emitir.");
      }
    }

    const result: TuitionBatchResult''', "server-ambiguity")
server_path.write_text(server, encoding="utf-8")

# The shared validation schema is also imported by frontend and tests.
schemas_path = Path("src/features/finance/schemas.ts")
schemas = schemas_path.read_text(encoding="utf-8")
schemas = once(schemas,
    'export const issueTuitionBatchInputSchema = z.object({\n  classGroupId: z.string().guid(),',
    'export const issueTuitionBatchInputSchema = z\n  .object({\n  classGroupId: z.string().guid().optional(),', "shared-schema")
schemas = once(schemas,
    '''  dueOn: z.string().date(),
  issuedOn: z.string().date().optional(),
});''',
    '''  dueOn: z.string().date(),
  issuedOn: z.string().date().optional(),
})
.refine((value) => Boolean(value.classGroupId) || Boolean(value.studentIds), {
  message: "Seleccione uma turma e/ou alunos específicos.",
});''', "shared-schema")
schemas_path.write_text(schemas, encoding="utf-8")

tests_path = Path("tests/finance/tuition-batch.test.ts")
tests = tests_path.read_text(encoding="utf-8")
tests = once(tests,
    '"permite apenas turmas OU ids seleccionados, com limite e escola activa"',
    '"aceita turma e/ou IDs seleccionados com limite, escola e ano activo"', "main-test")
tests = once(tests,
    'Boolean(value.classGroupId) !== Boolean(value.studentIds)',
    'Boolean(value.classGroupId) || Boolean(value.studentIds)', "main-test")
tests = once(tests,
    '''expect(lote).toMatch(/\\.eq\\("class_group_id", data\\.classGroupId!?\\)/);''',
    '''expect(lote).toContain('.eq("class_group_id", data.classGroupId)');''', "main-test")
tests = once(tests,
    '''expect(lote).toContain("studentIds.length !== new Set(data.studentIds).size");''',
    '''expect(lote).toContain("studentIds.length !== selectedIds.length");''', "selected-test")
tests = once(tests,
    '''expect(lote).toContain('.eq("academic_year_id", data.academicYearId)');''',
    '''expect(lote).toContain('.eq("academic_year_id", academicYearId!)');
    expect(lote).toContain("data.academicYearId !== academicYearId");''', "selected-test")
tests_path.write_text(tests, encoding="utf-8")
print("Resolved 4 conflicts:", counts)
print("Preserved main batch modes, school checks and validated optional class/year.")
