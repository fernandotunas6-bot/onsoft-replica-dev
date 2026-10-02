#!/usr/bin/env python3
"""Restore prior SIGA Plus Auth and notification templates from a private backup.

DRY-RUN by default. No token needed to validate a backup. For a live comparison
use --check. A production restore requires --apply --confirm-production and a
separate --backup-dir to preserve the *current* server values before changing
them. Never put a Supabase personal access token in CLI arguments or git.
"""
import argparse
import json
import os
import sys
from pathlib import Path

from deploy import TEMPLATES, backup_existing, request
from deploy_notifications import NOTIFICATIONS

ALLOWED_FIELDS = {
    field
    for kind, _ in TEMPLATES.values()
    for field in (f"mailer_subjects_{kind}", f"mailer_templates_{kind}_content")
} | {
    field
    for kind, _, _ in NOTIFICATIONS.values()
    for field in (
        f"mailer_subjects_{kind}_notification",
        f"mailer_templates_{kind}_notification_content",
        f"mailer_notifications_{kind}_enabled",
    )
} | {"external_email_enabled", "mailer_autoconfirm", "mailer_secure_email_change_enabled"}
SECURITY_OPTIONS = {
    "external_email_enabled", "mailer_autoconfirm",
    "mailer_secure_email_change_enabled",
} | {
    f"mailer_notifications_{kind}_enabled"
    for kind, _, _ in NOTIFICATIONS.values()
}


def load_snapshot(path):
    """Reject arbitrary keys and values; only project-specific template backups."""
    path = Path(path).expanduser().resolve(strict=True)
    if not path.is_file() or path.stat().st_size > 1024 * 1024:
        raise ValueError("Expected an existing local JSON backup not exceeding 1 MiB.")
    try:
        snapshot = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError("Could not read a valid local backup file.") from exc
    if not isinstance(snapshot, dict) or not snapshot:
        raise ValueError("Backup must be a nonempty JSON object.")
    invalid = set(snapshot) - ALLOWED_FIELDS
    if invalid:
        raise ValueError("Backup contains unrecognized configuration fields; restore denied.")
    for key, value in snapshot.items():
        if key in SECURITY_OPTIONS:
            if type(value) is not bool:
                raise ValueError("Security option values must be booleans.")
        elif not isinstance(value, str) or not value.strip() or len(value) > 200_000:
            raise ValueError("Subject/template values must be nonempty bounded strings.")
    return snapshot


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path, help="Local backup JSON created by deploy.py")
    parser.add_argument("--check", action="store_true", help="Read-only comparison with live project")
    parser.add_argument("--apply", action="store_true", help="Restore selected backed-up values")
    parser.add_argument("--confirm-production", action="store_true")
    parser.add_argument("--backup-dir", type=Path, help="Mandatory location to back up current live values")
    args = parser.parse_args()
    if args.check and args.apply:
        parser.error("--check and --apply are mutually exclusive")
    if args.apply and (not args.confirm_production or not args.backup_dir):
        parser.error("--apply requires --confirm-production and --backup-dir")
    try:
        desired = load_snapshot(args.snapshot)
    except (ValueError, OSError) as exc:
        print(f"Rejected backup: {exc}", file=sys.stderr)
        return 2
    print(f"Validated backup containing {len(desired)} selected configuration fields.")
    if not args.apply and not args.check:
        print("Local dry run only. Production remains unchanged.")
        return 0
    token = os.getenv("SUPABASE_ACCESS_TOKEN")
    if not token:
        print("Missing newly rotated SUPABASE_ACCESS_TOKEN.", file=sys.stderr)
        return 2
    live = request("GET", token)
    changes = {key: value for key, value in desired.items() if live.get(key) != value}
    print(f"Fields differing from local backup: {len(changes)}.")
    if not changes:
        print("Already matches backup. No production change required.")
        return 0
    if args.check:
        print("Read-only comparison complete; production unchanged.")
        return 1
    try:
        backup = backup_existing(live, desired.keys(), args.backup_dir)
    except OSError:
        print("Cannot create recovery backup of live state; aborting restore.", file=sys.stderr)
        return 2
    print(f"Current live values preserved privately at {backup}")
    request("PATCH", token, changes)
    verified = request("GET", token)
    mismatch = [key for key, value in desired.items() if verified.get(key) != value]
    if mismatch:
        print("Restore verification failed. Examine the server and the saved backup.", file=sys.stderr)
        return 1
    print("Restored and verified selected backed-up fields. Recheck all email flows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
