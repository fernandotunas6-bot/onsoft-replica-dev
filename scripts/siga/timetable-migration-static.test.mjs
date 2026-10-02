import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const base = new URL("./migrations/", import.meta.url);
const names = [
  "20260924_timetable_school_reference_guard.sql",
  "20260924_timetable_concurrency_guard.sql",
  "20260924_timetable_assignment_guard.sql",
  "20260924_timetable_publication_guard.sql",
  "20260924_published_timetable_slot_guard.sql",
];
const sql = (name) => readFileSync(new URL(name, base), "utf8");

for (const name of names) {
  test(name + ": trigger structure", () => {
    const body = sql(name);
    assert.match(body, /CREATE OR REPLACE FUNCTION private\.[a-z_]+\(\)/);
    assert.match(body, /LANGUAGE plpgsql SECURITY DEFINER/);
    assert.match(body, /SET search_path = ''/);
    assert.match(
      body,
      /REVOKE ALL ON FUNCTION private\.[a-z_]+\(\)\s+FROM PUBLIC, anon, authenticated/,
    );
    assert.match(body, /CREATE TRIGGER/);
    const delimiter = name.includes("assignment_guard") ? "$assignment_guard$" : "$$";
    assert.equal(body.split(delimiter).length - 1, 2);
    assert.doesNotMatch(body, /\nEND;\s*\$;/);
  });
}

test("statement lock covers all timetable tables", () => {
  const body = sql("20260924_timetable_statement_lock.sql");
  assert.match(body, /LANGUAGE plpgsql SECURITY INVOKER/);
  assert.equal(body.split("$timetable_statement_lock$").length - 1, 2);
  for (const table of ["timetable_slots", "class_subjects", "academic_schedules"]) {
    assert.ok(body.includes("BEFORE INSERT OR UPDATE OR DELETE ON public." + table));
  }
  assert.equal(body.split("FOR EACH STATEMENT EXECUTE FUNCTION").length - 1, 3);
});

test("all row guards share school advisory lock", () => {
  for (const name of names.slice(1)) {
    const body = sql(name);
    assert.match(body, /pg_advisory_xact_lock/);
    assert.match(body, /hashtextextended\(NEW\.school_id::text, 90240924\)/);
  }
});

test("published resource guards check overlapping academic years", () => {
  for (const name of names.slice(2)) {
    const body = sql(name);
    assert.doesNotMatch(
      body,
      /(?:published|other_schedule)\.academic_year_id\s*=\s*(?:NEW|current_schedule)\.academic_year_id/,
    );
    assert.match(body, /valid_from\s*<=\s*(?:NEW|current_schedule)\.valid_to/);
  }
});

test("publication validates dates and internal collisions", () => {
  const body = sql(names[3]);
  assert.match(body, /NEW\.valid_from IS NULL OR NEW\.valid_to IS NULL/);
  assert.match(body, /A versão contém aulas sobrepostas/);
});
