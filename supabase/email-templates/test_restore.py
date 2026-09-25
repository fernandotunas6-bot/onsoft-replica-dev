"""Offline tests of backup-based restoration. No external requests are made."""
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from contextlib import redirect_stdout, redirect_stderr
from unittest.mock import patch
import restore


class SnapshotValidation(unittest.TestCase):
    def test_accepts_saved_email_templates_and_boolean_options(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "previous.json"
            p.write_text(json.dumps({
                "mailer_subjects_confirmation": "Previous subject",
                "mailer_templates_confirmation_content": "<h2>Old confirmation</h2>",
                "mailer_autoconfirm": False,
            }), encoding="utf-8")
            self.assertEqual(len(restore.load_snapshot(p)), 3)

    def test_rejects_secret_or_unknown_fields(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "unsafe.json"
            for contents in (
                {"smtp_pass": "secret"},
                {"service_role": "never restore"},
                {"mailer_autoconfirm": "false"},
                {"mailer_subjects_confirmation": ""},
                {},
                ["invalid"],
            ):
                p.write_text(json.dumps(contents), encoding="utf-8")
                with self.subTest(contents=contents):
                    with self.assertRaises(ValueError):
                        restore.load_snapshot(p)


class RestoreWorkflow(unittest.TestCase):
    def run_command(self, argv, request_side_effect=None):
        output, errors = io.StringIO(), io.StringIO()
        with patch.object(sys, "argv", ["restore.py", *argv]), \
             patch.dict(os.environ, {"SUPABASE_ACCESS_TOKEN": "offline-only-token"}), \
             patch.object(restore, "request", side_effect=request_side_effect) as api, \
             redirect_stdout(output), redirect_stderr(errors):
            try:
                return_code = restore.main()
            except SystemExit as exc:
                return_code = exc.code
        return return_code, output.getvalue(), errors.getvalue(), api

    def test_default_dry_run_cannot_touch_supabase(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "backup.json"
            path.write_text('{"mailer_subjects_invite":"Earlier invitation"}', encoding="utf-8")
            code, output, _, api = self.run_command([str(path)])
            self.assertEqual(code, 0)
            self.assertIn("dry run", output)
            api.assert_not_called()

    def test_apply_requires_separate_live_backup_location(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "backup.json"
            path.write_text('{"mailer_subjects_invite":"Earlier invitation"}', encoding="utf-8")
            code, _, _, api = self.run_command([str(path), "--apply", "--confirm-production"])
            self.assertEqual(code, 2)
            api.assert_not_called()

    def test_check_does_not_patch(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "backup.json"
            path.write_text('{"mailer_subjects_invite":"Earlier invitation"}', encoding="utf-8")
            code, _, _, api = self.run_command([str(path), "--check"], request_side_effect=[{}])
            self.assertEqual(code, 1)
            self.assertEqual([call.args[0] for call in api.call_args_list], ["GET"])

    def test_restore_changes_only_backed_up_fields_with_readback(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "original.json"
            path.write_text('{"mailer_subjects_invite":"Earlier invitation"}', encoding="utf-8")
            backup_dir = Path(d) / "prior_live"
            prior_server = {"mailer_subjects_invite": "Current invitation",
                            "mailer_autoconfirm": False}
            code, _, _, api = self.run_command(
                [str(path), "--apply", "--confirm-production", "--backup-dir", str(backup_dir)],
                request_side_effect=[prior_server, {}, {"mailer_subjects_invite": "Earlier invitation"}])
            self.assertEqual(code, 0)
            self.assertEqual([call.args[0] for call in api.call_args_list], ["GET", "PATCH", "GET"])
            self.assertEqual(api.call_args_list[1].args[2],
                             {"mailer_subjects_invite": "Earlier invitation"})
            files = list(backup_dir.glob("*.json"))
            self.assertEqual(len(files), 1)
            self.assertEqual(json.loads(files[0].read_text(encoding="utf-8")),
                             {"mailer_subjects_invite": "Current invitation"})


if __name__ == "__main__":
    unittest.main()
