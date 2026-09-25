#!/usr/bin/env python3
"""Install optional SIGA Plus security notifications through the Supabase Management API.

Read-only validation by default. Existing notification enablement is NEVER
changed without both --enable and --smtp-verified. Uses only a newly rotated
SUPABASE_ACCESS_TOKEN kept in the operator's local environment. No credentials
are embedded in HTML, source control or printed to the terminal.
"""
import argparse
import os
import sys
from pathlib import Path

from deploy import backup_existing, request

ROOT = Path(__file__).resolve().parent / "notifications"
NOTIFICATIONS = {
    "password-changed": ("password_changed", "SIGA Plus — Palavra-passe alterada", ()),
    "email-changed": ("email_changed", "SIGA Plus — Endereço de e-mail alterado",
                      ("{{ .OldEmail }}", "{{ .Email }}")),
    "identity-linked": ("identity_linked", "SIGA Plus — Novo método de entrada associado",
                        ("{{ .Provider }}",)),
    "identity-unlinked": ("identity_unlinked", "SIGA Plus — Método de entrada removido",
                          ("{{ .Provider }}",)),
}


def build_payload(enable=False):
    fields = {}
    for slug, (key, subject, placeholders) in NOTIFICATIONS.items():
        content = (ROOT / (slug + ".html")).read_text(encoding="utf-8")
        if 'lang="pt"' not in content or 'name="viewport"' not in content:
            raise ValueError(f"{slug}: missing accessibility or mobile markup")
        if "<script" in content.lower():
            raise ValueError(f"{slug}: scripts are prohibited in notification templates")
        if not all(value in content for value in placeholders):
            raise ValueError(f"{slug}: missing required Supabase variable")
        fields[f"mailer_subjects_{key}_notification"] = subject
        fields[f"mailer_templates_{key}_notification_content"] = content
        if enable:
            fields[f"mailer_notifications_{key}_enabled"] = True
    return fields


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Compare selected fields, no writes")
    parser.add_argument("--apply", action="store_true", help="Update selected notification templates")
    parser.add_argument("--enable", action="store_true", help="Enable all four notifications")
    parser.add_argument("--smtp-verified", action="store_true",
                        help="Attest verified SMTP delivery and DNS for --enable")
    parser.add_argument("--confirm-production", action="store_true",
                        help="Acknowledge updating this production project")
    parser.add_argument("--backup-dir", type=Path, help="Required private local backup directory")
    args = parser.parse_args()
    if args.apply and args.check:
        parser.error("--apply and --check are mutually exclusive")
    if args.enable and not args.smtp_verified:
        parser.error("--enable requires --smtp-verified")
    if args.apply and (not args.confirm_production or not args.backup_dir):
        parser.error("--apply requires --confirm-production and --backup-dir")
    fields = build_payload(enable=args.enable)
    print(f"Validated {len(NOTIFICATIONS)} optional security notifications.")
    if not args.apply and not args.check:
        print("Dry run: no network request, configuration or SMTP changes.")
        return 0
    token = os.getenv("SUPABASE_ACCESS_TOKEN")
    if not token:
        print("Missing locally stored rotated SUPABASE_ACCESS_TOKEN.", file=sys.stderr)
        return 2
    original = request("GET", token)
    updates = {key: value for key, value in fields.items() if original.get(key) != value}
    print(f"Selected fields requiring changes: {len(updates)}.")
    if not updates:
        print("All selected values match; no change required.")
        return 0
    if args.check:
        print("Read-only differences detected; production unchanged.")
        return 1
    try:
        backup_existing(original, fields.keys(), args.backup_dir)
    except OSError:
        print("Unable to write restricted local backup; production unchanged.", file=sys.stderr)
        return 2
    request("PATCH", token, updates)
    after = request("GET", token)
    mismatches = [key for key, value in fields.items() if after.get(key) != value]
    if mismatches:
        print("Read-back mismatch: " + ", ".join(mismatches), file=sys.stderr)
        return 1
    print("Four notification templates verified; enabled only when explicitly requested.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
