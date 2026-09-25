#!/usr/bin/env python3
"""Apply six SIGA email templates to Supabase Management API. Dry-run by default."""
import argparse, json, os, sys, urllib.request, urllib.error
from pathlib import Path

REF = "xodgfmxiaunpamctfeea"
API = "https://api.supabase.com/v1/projects/" + REF + "/config/auth"
ROOT = Path(__file__).resolve().parent
TEMPLATES = {"confirm-sign-up":"confirmation","invite-user":"invite","magic-link-or-otp":"magic_link","change-email-address":"email_change","reset-password":"recovery","reauthentication":"reauthentication"}
parser = argparse.ArgumentParser()
parser.add_argument("--apply", action="store_true", help="Perform the remote PATCH")
parser.add_argument("--smtp-from-env", action="store_true", help="Use verified SMTP credentials from environment")
args = parser.parse_args()
subjects = json.loads((ROOT/"SUBJECTS.json").read_text(encoding="utf-8"))
payload = {"external_email_enabled":True, "mailer_autoconfirm":False, "mailer_secure_email_change_enabled":True}
for file, kind in TEMPLATES.items():
    template = (ROOT/(file + ".html")).read_text(encoding="utf-8")
    if "<script" in template.lower() or ("{{ .Token }}" not in template if file=="reauthentication" else "{{ .ConfirmationURL }}" not in template):
        sys.exit("Unsafe or invalid HTML template: " + file)
    payload["mailer_subjects_" + kind] = subjects[file]
    payload["mailer_templates_" + kind + "_content"] = template
if args.smtp_from_env:
    env = {"smtp_admin_email":"SIGA_SMTP_FROM", "smtp_host":"SIGA_SMTP_HOST", "smtp_port":"SIGA_SMTP_PORT", "smtp_user":"SIGA_SMTP_USER", "smtp_pass":"SIGA_SMTP_PASS", "smtp_sender_name":"SIGA_SMTP_SENDER_NAME"}
    absent = [v for v in env.values() if not os.environ.get(v)]
    if absent: sys.exit("Missing SMTP environment variables: " + ", ".join(absent))
    payload.update({k:int(os.environ[v]) if k=="smtp_port" else os.environ[v] for k,v in env.items()})
print("Project:", REF, "templates:", len(TEMPLATES), "SMTP included:",args.smtp_from_env)
if not args.apply:sys.exit("Dry run: no remote changes. Run with --apply after review.")
token = os.environ.get("SUPABASE_ACCESS_TOKEN")
if not token:sys.exit("Missing SUPABASE_ACCESS_TOKEN (requires auth:write); use a private operator terminal.")
headers = {"Authorization":"Bearer " + token,"Content-Type":"application/json"}
req = urllib.request.Request(API, data=json.dumps(payload).encode(), headers=headers, method="PATCH")
try:
    with urllib.request.urlopen(req, timeout=30) as res:
        if res.status != 200: sys.exit("Unexpected HTTP status: " + str(res.status))
    print("Configuration PATCH returned HTTP 200. Read back configuration and test real mail delivery separately.")
except urllib.error.HTTPError as e:
    sys.exit("Management API request failed (HTTP " + str(e.code) + "). Response withheld because it may contain secrets.")
