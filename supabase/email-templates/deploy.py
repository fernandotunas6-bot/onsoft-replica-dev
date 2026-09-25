#!/usr/bin/env python3
"""Deploy SIGA Plus Auth email templates with Supabase Management API.

Dry-run by default. Supply a FRESH personal access token through the
SUPABASE_ACCESS_TOKEN environment variable; never paste it into source code.
Requires Python 3.10+ (stdlib only). Run from any working directory.
"""
import argparse
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

PROJECT_REF = "xodgfmxiaunpamctfeea"
API = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/config/auth"
ROOT = Path(__file__).resolve().parent
TEMPLATES = {
    "confirm-sign-up": ("confirmation", "SIGA Plus — Confirme o seu e-mail"),
    "invite-user": ("invite", "SIGA Plus — O seu convite institucional"),
    "magic-link-or-otp": ("magic_link", "SIGA Plus — Acesso temporário à sua conta"),
    "change-email-address": ("email_change", "SIGA Plus — Confirme o novo endereço"),
    "reset-password": ("recovery", "SIGA Plus — Redefina a sua palavra-passe"),
    "reauthentication": ("reauthentication", "SIGA Plus — Código de segurança"),
}
REQUIRED = {
    "confirm-sign-up": ["{{ .ConfirmationURL }}"],
    "invite-user": ["{{ .ConfirmationURL }}"],
    "magic-link-or-otp": ["{{ .ConfirmationURL }}", "{{ .Token }}"],
    "change-email-address": ["{{ .ConfirmationURL }}", "{{ .NewEmail }}"],
    "reset-password": ["{{ .ConfirmationURL }}"],
    "reauthentication": ["{{ .Token }}"],
}


def request(method, token, payload=None):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    req = Request(API, data=body, method=method, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    })
    try:
        with urlopen(req, timeout=25) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        # Do not print response bodies or credentials (some errors echo config).
        raise RuntimeError(f"Supabase API HTTP {exc.code} on {method}") from None
    except URLError:
        raise RuntimeError("Unable to connect to Supabase Management API") from None


def build_payload():
    data = {}
    for filename, (key, subject) in TEMPLATES.items():
        html = (ROOT / f"{filename}.html").read_text(encoding="utf-8")
        for placeholder in REQUIRED[filename]:
            if placeholder not in html:
                raise ValueError(f"{filename}: missing {placeholder}")
        if 'lang="pt"' not in html or 'name="viewport"' not in html:
            raise ValueError(f"{filename}: HTML accessibility/mobile validation failed")
        data[f"mailer_subjects_{key}"] = subject
        data[f"mailer_templates_{key}_content"] = html
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write six templates to project auth config")
    parser.add_argument("--secure-email", action="store_true", help="Also enforce email confirmation and secure email change")
    parser.add_argument("--check", action="store_true", help="Read-only comparison with live Auth configuration")
    parser.add_argument("--confirm-production", action="store_true", help="Acknowledge production changes before --apply")
    args = parser.parse_args()
    payload = build_payload()
    if args.secure_email:
        payload.update({"external_email_enabled": True, "mailer_autoconfirm": False,
                        "mailer_secure_email_change_enabled": True})
    print(f"Validated {len(TEMPLATES)} templates for project {PROJECT_REF}.")
    if args.apply and args.check:
        parser.error("--check and --apply cannot be combined")
    if args.apply and not args.confirm_production:
        parser.error("--apply requires --confirm-production")
    if not args.apply and not args.check:
        print("Dry run complete. No network request or production change performed.")
        return 0
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not token:
        print("Missing SUPABASE_ACCESS_TOKEN. Use a newly rotated token in the environment.", file=sys.stderr)
        return 2
    current = request("GET", token)
    # Compare and PATCH only the requested fields. Never log secrets.
    changed = {k: v for k, v in payload.items() if current.get(k) != v}
    print(f"Changed fields: {len(changed)} (contents redacted).")
    if not changed:
        print("All selected fields already match; nothing to update.")
        return 0
    if args.check:
        print("Read-only check complete: server configuration differs. No production change performed.")
        return 1
    request("PATCH", token, changed)
    verified = request("GET", token)
    mismatches = [key for key, value in payload.items() if verified.get(key) != value]
    if mismatches:
        print(f"Verification failed for fields: {', '.join(mismatches)}", file=sys.stderr)
        return 1
    print("Supabase confirmed every selected field. Perform SMTP and real e-mail flow tests separately.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
