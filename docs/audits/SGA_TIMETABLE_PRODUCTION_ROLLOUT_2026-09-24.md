# SGA timetable migration rollout — 2026-09-24

Production project: `xodgfmxiaunpamctfeea`. Do not apply legacy Lovable SQL to this project.

## Applied and verified

- `20260924_timetable_school_reference_guard.sql` applied via Supabase migration `timetable_school_reference_guard_20260924`.
- Preflight: 17 timetable slots; 0 cross-school rooms, 0 cross-school shifts, 0 mismatched schedule/class links.
- Post-deployment read-only catalog verification: `validate_timetable_school_references` is enabled on `public.timetable_slots`; the integrity function is SECURITY DEFINER.
- Existing audit and academic-manager structure triggers remain enabled.

## Blocked — do not apply yet

- `20260924_timetable_concurrency_guard.sql`: transaction-level advisory lock inside a BEFORE UPDATE trigger may deadlock with concurrent updates of assignments/slots. Require a two-connection staging test and consistent lock acquisition before row UPDATE.
- `20260924_timetable_assignment_guard.sql`: depends on concurrency lock ordering and actual multi-connection tests.
- `20260924_timetable_publication_guard.sql` and `20260924_published_timetable_slot_guard.sql`: both published schedules currently have NULL valid_to (valid_from 2026-09-08 and 2026-09-09). They belong to the same school, academic year and class. Do not invent end dates or publish additional versions before agreeing on which version is effective.
- Static SQL checks are committed, but have not yet been executed; integration and concurrency tests have not been executed.

## Next release gate

Resolve the two published versions' effective-date policy; acquire per-school locks at the beginning of all timetable-write transactions; verify RLS/security-definer behavior and real concurrent transactions on a staging clone. Only then apply remaining migrations individually, verifying each trigger after installation.
