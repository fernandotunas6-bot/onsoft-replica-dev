#!/usr/bin/env python3
"""Configuração local do daemon hardware (URL SIGA + API key do dispositivo)."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

CONFIG_FILENAME = "siga_hardware_bridge_config.json"

DEFAULT_CONFIG: dict[str, Any] = {
    "siga_app_url": "http://127.0.0.1:3006",
    "device_api_key": "",
    "turnstile_ip": "127.0.0.1",
    "default_direction": "entry",
}


def config_path() -> Path:
    base = Path(os.environ.get("SIGA_HARDWARE_STATE_DIR", Path(__file__).resolve().parent))
    return base / CONFIG_FILENAME


def load_bridge_config() -> dict[str, Any]:
    path = config_path()
    if not path.exists():
        return {**DEFAULT_CONFIG}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            raw = json.load(handle)
        if not isinstance(raw, dict):
            return {**DEFAULT_CONFIG}
        merged = {**DEFAULT_CONFIG, **raw}
        return merged
    except (OSError, json.JSONDecodeError):
        return {**DEFAULT_CONFIG}


def save_bridge_config(updates: dict[str, Any]) -> dict[str, Any]:
    current = load_bridge_config()
    for key in ("siga_app_url", "device_api_key", "turnstile_ip", "default_direction"):
        if key in updates and updates[key] is not None:
            current[key] = str(updates[key]).strip()
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(current, handle, indent=2, ensure_ascii=False)
    return current
