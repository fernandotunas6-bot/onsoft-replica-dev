#!/usr/bin/env python3
"""Compatibility entry point for the verified SIGA Plus Supabase Auth deployer.

The legacy deploy_auth.py command previously PATCHed production without a
configuration read-back. Delegate to deploy.py to keep a single audited
implementation and preserve support for --smtp-from-env without silently
changing unrelated Auth configuration.
"""
import argparse
import os
import sys

from deploy import main as deploy_main


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--confirm-production", action="store_true")
    parser.add_argument("--secure-email", action="store_true")
    parser.add_argument("--smtp-from-env", action="store_true")
    args = parser.parse_args()
    if args.smtp_from_env:
        parser.error(
            "SMTP writes are intentionally unavailable from this compatibility "
            "script. Configure a verified sender, SPF/DKIM and SMTP in the "
            "Supabase Auth dashboard or use a separately audited deployment."
        )
    forwarded = ["deploy.py"]
    for flag, enabled in (
        ("--apply", args.apply),
        ("--check", args.check),
        ("--confirm-production", args.confirm_production),
        ("--secure-email", args.secure_email),
    ):
        if enabled:
            forwarded.append(flag)
    original_argv = sys.argv
    try:
        sys.argv = forwarded
        return deploy_main()
    finally:
        sys.argv = original_argv


if __name__ == "__main__":
    raise SystemExit(main())
