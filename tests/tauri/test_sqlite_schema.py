"""SQLite schema contract checks. In-memory database only; no school content.
Run: python3 -m unittest discover -s tests/tauri -p 'test_sqlite_schema.py'
"""
import sqlite3
import unittest
from pathlib import Path

SQL = (Path(__file__).resolve().parents[2]
       / "desktop" / "local-db" / "0001_offline_metadata.sql").read_text(encoding="utf-8")

A = ("school-a", "actor-a", "device-a")
B = ("school-b", "actor-b", "device-b")

def context(connection, ids):
    connection.execute(
        "INSERT INTO offline_contexts VALUES (?, ?, ?, ?, ?)",
        (*ids, "2026-10-25T08:00:00Z", "2026-10-26T08:00:00Z"),
    )

def operation(connection, ids=A, op_id="op-a", state="pending"):
    connection.execute(
        """INSERT INTO offline_outbox
           (op_id, school_id, actor_id, device_id, kind, payload_ciphertext,
            expected_revision, state, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'attendance.submit', ?, 3, ?, ?, ?)""",
        (op_id, *ids, b"encrypted-only", state,
         "2026-10-25T08:00:00Z", "2026-10-25T08:00:00Z"),
    )

class OfflineSQLiteSchemaTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys = ON")
        self.db.executescript(SQL)
        self.db.execute("PRAGMA foreign_keys = ON")

    def tearDown(self):
        self.db.close()

    def test_version_and_foreign_keys(self):
        self.assertEqual(self.db.execute("PRAGMA user_version").fetchone()[0], 1)
        self.assertEqual(self.db.execute("PRAGMA foreign_keys").fetchone()[0], 1)
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])
        names = {r[0] for r in self.db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertTrue({
            "offline_contexts", "offline_outbox", "offline_receipts",
            "offline_cursors", "offline_conflicts", "offline_tombstones",
        }.issubset(names))

    def test_rejects_operation_without_matching_school_actor_device(self):
        context(self.db, A)
        with self.assertRaises(sqlite3.IntegrityError):
            operation(self.db, B, "wrong-tenant")
        operation(self.db, A)
        self.assertEqual(self.db.execute("SELECT count(*) FROM offline_outbox").fetchone()[0], 1)

    def test_operation_id_is_unique_and_payload_immutable(self):
        context(self.db, A)
        operation(self.db)
        with self.assertRaises(sqlite3.IntegrityError):
            operation(self.db, A)
        for sql, params in [
            ("UPDATE offline_outbox SET school_id=? WHERE op_id='op-a'", ("school-b",)),
            ("UPDATE offline_outbox SET payload_ciphertext=? WHERE op_id='op-a'", (b"changed",)),
            ("UPDATE offline_outbox SET expected_revision=4 WHERE op_id='op-a'", ()),
        ]:
            with self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(sql, params)
        self.db.execute("UPDATE offline_outbox SET state='sending', attempts=1 WHERE op_id='op-a'")
        self.assertEqual(self.db.execute(
            "SELECT state FROM offline_outbox WHERE op_id='op-a'").fetchone()[0], "sending")

    def test_receipts_require_same_original_context(self):
        context(self.db, A)
        context(self.db, B)
        operation(self.db)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO offline_receipts VALUES (?, ?, ?, ?, ?, ?)",
                ("op-a", *B, 4, "2026-10-25T09:00:00Z"),
            )
        self.db.execute(
            "INSERT INTO offline_receipts VALUES (?, ?, ?, ?, ?, ?)",
            ("op-a", *A, 4, "2026-10-25T09:00:00Z"),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO offline_receipts VALUES (?, ?, ?, ?, ?, ?)",
                ("op-a", *A, 4, "2026-10-25T09:00:00Z"),
            )

    def test_conflict_must_be_explicit_and_scoped(self):
        context(self.db, A)
        context(self.db, B)
        operation(self.db)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO offline_conflicts (op_id, school_id, actor_id, device_id, server_revision, observed_at) VALUES (?, ?, ?, ?, ?, ?)",
                ("op-a", *B, 9, "2026-10-25T09:00:00Z"),
            )
        self.db.execute(
            "INSERT INTO offline_conflicts (op_id, school_id, actor_id, device_id, server_revision, observed_at) VALUES (?, ?, ?, ?, ?, ?)",
            ("op-a", *A, 9, "2026-10-25T09:00:00Z"),
        )
        self.assertEqual(self.db.execute(
            "SELECT state FROM offline_conflicts WHERE op_id='op-a'").fetchone()[0], "open")

    def test_cursors_and_tombstones_are_scoped(self):
        context(self.db, A)
        context(self.db, B)
        self.db.execute(
            "INSERT INTO offline_cursors VALUES (?, ?, ?, ?, ?, ?)",
            (*A, "calendar", b"ciphered", "2026-10-25T09:00:00Z"),
        )
        self.db.execute(
            "INSERT INTO offline_cursors VALUES (?, ?, ?, ?, ?, ?)",
            (*B, "calendar", b"other-ciphered", "2026-10-25T09:00:00Z"),
        )
        self.assertEqual(self.db.execute(
            "SELECT count(*) FROM offline_cursors WHERE stream='calendar'").fetchone()[0], 2)
        self.db.execute(
            "INSERT INTO offline_tombstones VALUES (?, ?, ?, ?, ?, ?, ?)",
            (*A, "calendar", "event-id", 9, "2026-10-25T09:00:00Z"),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO offline_tombstones VALUES (?, ?, ?, ?, ?, ?, ?)",
                (*A, "calendar", "event-id", 9, "2026-10-25T09:00:00Z"),
            )

    def test_migration_is_idempotent_for_schema_v1(self):
        context(self.db, A)
        operation(self.db)
        self.db.executescript(SQL)
        self.assertEqual(self.db.execute("SELECT count(*) FROM offline_outbox").fetchone()[0], 1)
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])

if __name__ == "__main__":
    unittest.main()
