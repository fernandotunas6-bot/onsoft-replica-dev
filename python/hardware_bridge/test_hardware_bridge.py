#!/usr/bin/env python3
import unittest
import json
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
            receipt_no="REC-2026-9910"
        )
        self.assertGreater(len(bytes_out), 50)
        self.assertIn(b"RECIBO DE PAGAMENTO", bytes_out)
        
        send_res = EscPosThermalPrinter.send_to_network_printer("127.0.0.1", bytes_out)
        self.assertEqual(send_res["status"], "simulated")

if __name__ == "__main__":
    unittest.main()
