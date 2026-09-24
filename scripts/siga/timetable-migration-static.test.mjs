import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const base = new URL('./migrations/', import.meta.url);
const files = [
  '20260924_timetable_school_reference_guard.sql',
  '20260924_timetable_concurrency_guard.sql',
  '20260924_timetable_assignment_guard.sql',
  '20260924_timetable_publication_guard.sql',
  '20260924_published_timetable_slot_guard.sql',
];

for (const name of files) {
  test(`${name}: SQL trigger structure and privileges`, () => {
    const sql = readFileSync(new URL(name, base), 'utf8');
    assert.match(sql, /CREATE OR REPLACE FUNCTION private\.[a-z_]+\(\)/);
    assert.match(sql, /LANGUAGE plpgsql SECURITY DEFINER/);
    assert.match(sql, /SET search_path = ''/);
    assert.match(sql, /REVOKE ALL ON FUNCTION private\.[a-z_]+\(\)\s+FROM PUBLIC, anon, authenticated/);
    assert.match(sql, /CREATE TRIGGER/);
    const delimiter = name.includes('assignment_guard') ? '$assignment_guard
    assert.doesNotMatch(sql, /\nEND;\s*\$;/);
  });
}

test('slot, assignment and publication guards use the same school lock', () => {
  for (const name of files.slice(1)) {
    const sql = readFileSync(new URL(name, base), 'utf8');
    assert.match(sql, /pg_advisory_xact_lock/);
    assert.match(sql, /hashtextextended\(NEW\.school_id::text, 90240924\)/);
  }
});

test('publication rejects incomplete effective dates and internal collisions', () => {
  const sql = readFileSync(new URL(files[3], base), 'utf8');
  assert.match(sql, /NEW\.valid_from IS NULL OR NEW\.valid_to IS NULL/);
  assert.match(sql, /A versão contém aulas sobrepostas/);
  assert.match(sql, /published\.valid_from <= NEW\.valid_to/);
});

test('assignment guard checks published versions after reassignment', () => {
  const sql = readFileSync(new URL(files[2], base), 'utf8');
  assert.match(sql, /A alteração cria conflito com outra versão publicada/);
  assert.match(sql, /other_schedule\.valid_from <= current_schedule\.valid_to/);
});
 : '$';
    assert.equal(sql.split(delimiter).length - 1, 2, 'PL/pgSQL body must have paired delimiters');
    assert.doesNotMatch(sql, /\nEND;\s*\$;/);
  });
}

test('slot, assignment and publication guards use the same school lock', () => {
  for (const name of files.slice(1)) {
    const sql = readFileSync(new URL(name, base), 'utf8');
    assert.match(sql, /pg_advisory_xact_lock/);
    assert.match(sql, /hashtextextended\(NEW\.school_id::text, 90240924\)/);
  }
});

test('publication rejects incomplete effective dates and internal collisions', () => {
  const sql = readFileSync(new URL(files[3], base), 'utf8');
  assert.match(sql, /NEW\.valid_from IS NULL OR NEW\.valid_to IS NULL/);
  assert.match(sql, /A versão contém aulas sobrepostas/);
  assert.match(sql, /published\.valid_from <= NEW\.valid_to/);
});

test('assignment guard checks published versions after reassignment', () => {
  const sql = readFileSync(new URL(files[2], base), 'utf8');
  assert.match(sql, /A alteração cria conflito com outra versão publicada/);
  assert.match(sql, /other_schedule\.valid_from <= current_schedule\.valid_to/);
});
