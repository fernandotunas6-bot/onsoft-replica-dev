#!/usr/bin/env python3
"""
Descoberta local de hardware para o SIGA (Linux-first, sem varrer o disco).

Regras de privacidade:
- Só lista portas série conhecidas (/dev/ttyUSB*, ttyACM*, serial/by-id) e impressoras CUPS.
- Não lê pastas pessoais, browsers, cookies nem ficheiros de configuração alheios.
- Allowlist fica em JSON local junto do daemon — nunca é enviada para a cloud.
"""

from __future__ import annotations

import glob
import json
import os
import platform
import subprocess
from pathlib import Path
from typing import Any

ALLOWLIST_FILENAME = "siga_hardware_allowlist.json"


def allowlist_path() -> Path:
    base = Path(os.environ.get("SIGA_HARDWARE_STATE_DIR", Path(__file__).resolve().parent))
    return base / ALLOWLIST_FILENAME


def _safe_read_sysfs(path: str, limit: int = 120) -> str | None:
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as handle:
            return handle.read(limit).strip() or None
    except OSError:
        return None


def discover_serial_ports() -> list[dict[str, Any]]:
    """Portas USB-série típicas de leitores RFID / controladoras."""
    patterns = [
        "/dev/ttyUSB*",
        "/dev/ttyACM*",
        "/dev/serial/by-id/*",
    ]
    found: dict[str, dict[str, Any]] = {}

    for pattern in patterns:
        for path in sorted(glob.glob(pattern)):
            if not os.path.exists(path):
                continue
            real = os.path.realpath(path)
            key = real
            label = os.path.basename(path)
            vendor = None
            product = None
            # sysfs tipico: /sys/class/tty/ttyUSB0/device/...
            tty_name = os.path.basename(real)
            vendor = _safe_read_sysfs(f"/sys/class/tty/{tty_name}/device/../idVendor")
            product = _safe_read_sysfs(f"/sys/class/tty/{tty_name}/device/../idProduct")
            found[key] = {
                "id": f"serial:{real}",
                "kind": "serial_usb",
                "path": real,
                "label": label if label != os.path.basename(real) else real,
                "vendor_id": vendor,
                "product_id": product,
                "platform": platform.system().lower(),
            }

    # macOS / BSD fallback comum (sem varrer /dev completo)
    if platform.system() == "Darwin":
        for path in sorted(glob.glob("/dev/tty.usb*")) + sorted(glob.glob("/dev/cu.usb*")):
            if not os.path.exists(path):
                continue
            found[path] = {
                "id": f"serial:{path}",
                "kind": "serial_usb",
                "path": path,
                "label": os.path.basename(path),
                "vendor_id": None,
                "product_id": None,
                "platform": "darwin",
            }

    return list(found.values())


def discover_cups_printers() -> list[dict[str, Any]]:
    """Impressoras do sistema via CUPS (`lpstat`), sem ler configs de utilizador."""
    printers: list[dict[str, Any]] = []
    try:
        completed = subprocess.run(
            ["lpstat", "-a"],
            capture_output=True,
            text=True,
            timeout=2.5,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return printers

    if completed.returncode != 0:
        return printers

    for line in completed.stdout.splitlines():
        name = line.split()[0] if line.strip() else ""
        if not name or name.startswith("lpstat"):
            continue
        printers.append(
            {
                "id": f"cups:{name}",
                "kind": "cups_printer",
                "path": name,
                "label": name,
                "vendor_id": None,
                "product_id": None,
                "platform": platform.system().lower(),
            }
        )
    return printers


def discover_local_devices() -> dict[str, Any]:
    serial = discover_serial_ports()
    cups = discover_cups_printers()
    return {
        "ok": True,
        "platform": platform.system().lower(),
        "machine": platform.machine(),
        "privacy": {
            "scope": "serial_usb_and_cups_only",
            "scans_home": False,
            "scans_browser": False,
            "leaves_host": False,
        },
        "devices": serial + cups,
        "counts": {"serial_usb": len(serial), "cups_printer": len(cups)},
    }


def load_allowlist() -> dict[str, Any]:
    path = allowlist_path()
    if not path.exists():
        return {"devices": [], "updated_at": None}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {"devices": [], "updated_at": None}
        devices = data.get("devices") or []
        if not isinstance(devices, list):
            devices = []
        # Sanitizar: só ids/kind/path/label
        clean = []
        for item in devices[:40]:
            if not isinstance(item, dict):
                continue
            device_id = str(item.get("id") or "").strip()
            if not device_id:
                continue
            clean.append(
                {
                    "id": device_id[:120],
                    "kind": str(item.get("kind") or "unknown")[:40],
                    "path": str(item.get("path") or "")[:180],
                    "label": str(item.get("label") or device_id)[:120],
                }
            )
        return {"devices": clean, "updated_at": data.get("updated_at")}
    except (OSError, json.JSONDecodeError):
        return {"devices": [], "updated_at": None}


def save_allowlist(devices: list[dict[str, Any]]) -> dict[str, Any]:
    import time

    path = allowlist_path()
    clean: list[dict[str, Any]] = []
    for item in devices[:40]:
        if not isinstance(item, dict):
            continue
        device_id = str(item.get("id") or "").strip()
        if not device_id:
            continue
        clean.append(
            {
                "id": device_id[:120],
                "kind": str(item.get("kind") or "unknown")[:40],
                "path": str(item.get("path") or "")[:180],
                "label": str(item.get("label") or device_id)[:120],
            }
        )
    payload = {"devices": clean, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return payload


def is_device_allowed(device_id: str) -> bool:
    allow = load_allowlist()
    return any(item.get("id") == device_id for item in allow.get("devices", []))
