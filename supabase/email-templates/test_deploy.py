"""Tests for the SIGA Plus Supabase Auth template deployer (no real network or SMTP).

Run: python -m unittest discover -s supabase/email-templates -p 'test_*.py' -v
"""
import importlib.util
import io
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path
from unittest.mock import patch

MODULE = Path(__file__).resolve().parent / "deploy.py"
spec = importlib.util.spec_from_file_location("siga_auth_deploy", MODULE)
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class TemplateStaticTests(unittest.TestCase):
    def test_every_template_contains_required_variables_and_mobile_markup(self):
        payload = deploy.build_payload()
        self.assertEqual(len(payload), 12)
        for slug, (key, subject) in deploy.TEMPLATES.items():
            with self.subTest(template=slug):
                body = payload[f"mailer_templates_{key}_content"]
                self.assertIn('lang="pt"', body)
                self.assertIn('name="viewport"', body)
                self.assertIn('role="presentation"', body)
                self.assertIn('SIGA Plus', body)
                self.assertEqual(payload[f"mailer_subjects_{key}"], subject)
                for variable in deploy.REQUIRED[slug]:
                    self.assertIn(variable, body)
                for forbidden in ("sb_secret_", "service_role", "SUPABASE_ACCESS_TOKEN"):
                    self.assertNotIn(forbidden, body)

    def test_missing_template_variable_fails_without_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            old_root = deploy.ROOT
            deploy.ROOT = Path(tmp)
            try:
                for slug in deploy.TEMPLATES:
                    (Path(tmp) / f"{slug}.html").write_text('<html lang="pt"><meta name="viewport">', encoding="utf-8")
                with self.assertRaises(ValueError):
                    deploy.build_payload()
            finally:
                deploy.ROOT = old_root



class NotificationStaticTests(unittest.TestCase):
    def test_security_notifications_safe_and_well_formed(self):
        directory = MODULE.parent / "notifications"
        notices = {
            "password-changed": [],
            "email-changed": ["{{ .OldEmail }}", "{{ .Email }}"],
            "identity-linked": ["{{ .Provider }}"],
            "identity-unlinked": ["{{ .Provider }}"],
        }
        for slug, placeholders in notices.items():
            with self.subTest(notification=slug):
                html = (directory / f"{slug}.html").read_text(encoding="utf-8")
                self.assertIn('lang="pt"', html)
                self.assertIn('name="viewport"', html)
                self.assertIn('role="presentation"', html)
                self.assertIn('Notificação de segurança', html)
                self.assertNotIn("<script", html.lower())
                self.assertNotIn("sb_secret_", html)
                self.assertNotIn("SUPABASE_ACCESS_TOKEN", html)
                for placeholder in placeholders:
                    self.assertIn(placeholder, html)


class DeploymentFlowTests(unittest.TestCase):
    def run_cli(self, argv, request_side_effect=None, token="test-token-not-real"):
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(sys, "argv", ["deploy.py", *argv]), \
             patch.dict(os.environ, {"SUPABASE_ACCESS_TOKEN": token}), \
             patch.object(deploy, "request", side_effect=request_side_effect) as requester, \
             redirect_stdout(stdout), redirect_stderr(stderr):
            try:
                code = deploy.main()
            except SystemExit as error:
                code = error.code
        return code, stdout.getvalue(), stderr.getvalue(), requester

    def test_default_dry_run_never_accesses_management_api(self):
        code, output, _, api = self.run_cli([])
        self.assertEqual(code, 0)
        api.assert_not_called()
        self.assertIn("Dry run", output)

    def test_apply_needs_explicit_production_acknowledgement(self):
        code, _, error, api = self.run_cli(["--apply"])
        self.assertEqual(code, 2)
        self.assertIn("--confirm-production", error)
        api.assert_not_called()

    def test_read_only_check_never_patches(self):
        code, _, _, api = self.run_cli(["--check"], request_side_effect=[{}])
        self.assertEqual(code, 1)
        self.assertEqual(api.call_count, 1)
        self.assertEqual(api.call_args_list[0].args[0], "GET")

    def test_apply_writes_only_changed_fields_and_reads_back(self):
        payload = deploy.build_payload()
        current = dict(payload)
        current["mailer_subjects_invite"] = "Old subject"
        code, out, _, api = self.run_cli(
            ["--apply", "--confirm-production"],
            request_side_effect=[current, {}, payload],
        )
        self.assertEqual(code, 0)
        self.assertEqual([c.args[0] for c in api.call_args_list], ["GET", "PATCH", "GET"])
        self.assertEqual(list(api.call_args_list[1].args[2]), ["mailer_subjects_invite"])
        self.assertIn("confirmed every selected field", out)

    def test_verification_mismatch_fails_closed(self):
        code, _, error, api = self.run_cli(
            ["--apply", "--confirm-production"], request_side_effect=[{}, {}, {}]
        )
        self.assertEqual(code, 1)
        self.assertIn("Verification failed", error)
        self.assertEqual(api.call_count, 3)

    def test_idempotent_apply_does_not_patch(self):
        current = deploy.build_payload()
        code, out, _, api = self.run_cli(
            ["--apply", "--confirm-production"], request_side_effect=[current]
        )
        self.assertEqual(code, 0)
        self.assertEqual(api.call_count, 1)
        self.assertIn("nothing to update", out)


if __name__ == "__main__":
    unittest.main()
