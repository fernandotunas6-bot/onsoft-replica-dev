import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("./migrations/20261010_timetable_guard_alignment.sql", import.meta.url),
  "utf8",
);

test("room conflict uses the same explicit-room rule as the no-overlap trigger", () => {
  assert.match(sql, /private\.timetable_room_is_explicit\(NEW\.room\)/);
  assert.match(sql, /lower\(btrim\(t\.room\)\) = lower\(btrim\(NEW\.room\)\)/);
  assert.doesNotMatch(sql, /t\.room = NEW\.room/);
});

test("guarded timetable RPCs are callable only by service_role", () => {
  for (const fn of ["create_timetable_slot_guarded", "update_timetable_slot_guarded"]) {
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\)\\s+FROM PUBLIC, anon, authenticated`),
    );
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)\\s+TO service_role`));
  }
});

test("no-overlap trigger function is not executable by client roles", () => {
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION private\.enforce_timetable_slot_no_overlap\(\) FROM PUBLIC, anon, authenticated/,
  );
});

test("migration is idempotent and marked as staged", () => {
  assert.match(sql, /^-- SGA ONLY — STAGED/m);
  assert.doesNotMatch(sql, /CREATE TABLE|DROP TABLE|ALTER TABLE/);
});
