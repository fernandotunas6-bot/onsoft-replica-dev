#!/usr/bin/env python3
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from device_discovery import (
    discover_cups_printers,
    discover_local_devices,
    discover_serial_ports,
    is_device_allowed,
    load_allowlist,
    save_allowlist,
)
from siga_hardware_bridge import TurnstileHardwareController, EscPosThermalPrinter, ZkTecoProtocolHelper


class TestHardwareBridge(unittest.TestCase):
    def test_turnstile_simulated_pulse(self):
        controller = TurnstileHardwareController(ip_address="127.0.0.1")
        res_entry = controller.send_pulse_relay(gate_number=1, duration_ms=2000, direction="entry")
        self.assertEqual(res_entry["status"], "success")
        self.assertEqual(res_entry["direction"], "entry")
        self.assertEqual(res_entry["relay_channel"], 1)

        res_exit = controller.send_pulse_relay(gate_number=1, duration_ms=2000, direction="exit")
        self.assertEqual(res_exit["status"], "success")
        self.assertEqual(res_exit["direction"], "exit")
        self.assertEqual(res_exit["relay_channel"], 2)

    def test_zkteco_protocol_command_builder(self):
        cmd_bytes = ZkTecoProtocolHelper.build_open_door_command(door_index=1)
        self.assertGreater(len(cmd_bytes), 10)
        self.assertEqual(cmd_bytes[:4], b"PP\x82\x00")

    def test_thermal_receipt_formatting_and_send(self):
        bytes_out = EscPosThermalPrinter.format_receipt_bytes(
            school_name="Colégio SIGA",
            student_name="Manuel António",
            amount_kwanza="45.000,00",
            nif="541882910",
            receipt_no="REC-2026-9910",
        )
        self.assertGreater(len(bytes_out), 50)
        self.assertIn(b"RECIBO DE PAGAMENTO", bytes_out)

        send_res = EscPosThermalPrinter.send_to_network_printer("127.0.0.1", bytes_out)
        self.assertEqual(send_res["status"], "simulated")


class TestDeviceDiscovery(unittest.TestCase):
    def test_discover_local_devices_privacy_flags(self):
        result = discover_local_devices()
        self.assertTrue(result["ok"])
        self.assertFalse(result["privacy"]["scans_home"])
        self.assertFalse(result["privacy"]["scans_browser"])
        self.assertFalse(result["privacy"]["leaves_host"])
        self.assertEqual(result["privacy"]["scope"], "serial_usb_and_cups_only")
        self.assertIn("devices", result)

    def test_serial_discovery_uses_glob_only(self):
        with mock.patch("device_discovery.glob.glob", return_value=["/dev/ttyUSB0"]) as mocked:
            with mock.patch("device_discovery.os.path.exists", return_value=True):
                with mock.patch("device_discovery.os.path.realpath", return_value="/dev/ttyUSB0"):
                    devices = discover_serial_ports()
        self.assertEqual(len(devices), 1)
        self.assertEqual(devices[0]["kind"], "serial_usb")
        self.assertTrue(devices[0]["id"].startswith("serial:"))
        self.assertTrue(mocked.called)

    def test_cups_discovery_parses_lpstat(self):
        fake = mock.Mock(returncode=0, stdout="SIGA_Termica accepting requests since …\n")
        with mock.patch("device_discovery.subprocess.run", return_value=fake):
            printers = discover_cups_printers()
        self.assertEqual(len(printers), 1)
        self.assertEqual(printers[0]["kind"], "cups_printer")
        self.assertEqual(printers[0]["path"], "SIGA_Termica")

    def test_allowlist_roundtrip_local_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ["SIGA_HARDWARE_STATE_DIR"] = tmp
            try:
                saved = save_allowlist(
                    [
                        {
                            "id": "serial:/dev/ttyUSB0",
                            "kind": "serial_usb",
                            "path": "/dev/ttyUSB0",
                            "label": "Leitor RFID",
                        }
                    ]
                )
                self.assertEqual(len(saved["devices"]), 1)
                loaded = load_allowlist()
                self.assertEqual(loaded["devices"][0]["id"], "serial:/dev/ttyUSB0")
                self.assertTrue(is_device_allowed("serial:/dev/ttyUSB0"))
                self.assertFalse(is_device_allowed("serial:/dev/ttyUSB9"))
                self.assertTrue(Path(tmp, "siga_hardware_allowlist.json").exists())
            finally:
                os.environ.pop("SIGA_HARDWARE_STATE_DIR", None)


if __name__ == "__main__":
    unittest.main()
