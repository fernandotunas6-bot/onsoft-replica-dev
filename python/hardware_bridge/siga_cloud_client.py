#!/usr/bin/env python3
"""Cliente HTTP local → SIGA para validação de cartões via webhook público."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any


def validate_gate_pass_remote(
    app_url: str,
    api_key: str,
    token: str,
    direction: str = "entry",
    timeout_sec: float = 4.0,
) -> dict[str, Any]:
    """
    Chama POST /api/catracas/device-scan no SIGA (sem sessão — autentica por api_key).
    """
    base = (app_url or "http://127.0.0.1:3006").rstrip("/")
    url = f"{base}/api/catracas/device-scan"
    payload = json.dumps(
        {"apiKey": api_key.strip(), "token": token.strip(), "direction": direction}
    ).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_sec) as response:
            body = response.read().decode("utf-8")
            parsed = json.loads(body) if body else {}
            if isinstance(parsed, dict):
                return parsed
            return {"granted": False, "reason": "Resposta inválida do SIGA."}
    except urllib.error.HTTPError as err:
        try:
            detail = json.loads(err.read().decode("utf-8"))
            if isinstance(detail, dict):
                return {"granted": False, **detail}
        except (OSError, json.JSONDecodeError, UnicodeDecodeError):
            pass
        return {
            "granted": False,
            "reason": f"SIGA respondeu HTTP {err.code}.",
        }
    except urllib.error.URLError as err:
        return {
            "granted": False,
            "reason": f"Não foi possível contactar o SIGA em {base}: {err.reason}",
        }
    except json.JSONDecodeError:
        return {"granted": False, "reason": "Resposta JSON inválida do SIGA."}
