import http.client
import json
import tempfile
import threading
import unittest
from http.server import HTTPServer
from unittest import mock

from siga_hardware_bridge import HardwareBridgeRequestHandler, TurnstileHardwareController, EscPosThermalPrinter


class TestHttpSecurity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), HardwareBridgeRequestHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def request(self, method="GET", path="/health", body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        try:
            conn.request(method, path, body=body, headers=headers or {})
            response = conn.getresponse()
            return response.status, json.loads(response.read()), dict(response.getheaders())
        finally:
            conn.close()

    def test_untrusted_origins_cannot_read_or_mutate(self):
        with mock.patch("siga_hardware_bridge.save_bridge_config") as save, mock.patch.object(TurnstileHardwareController, "send_pulse_relay") as pulse:
            for origin in ["https://evil.test", "null", "https://portal-siga.com.evil.test"]:
                headers = {"Origin": origin, "Content-Type": "application/json"}
                self.assertEqual(self.request(path="/hardware/bridge-config", headers=headers)[0], 403)
                result = self.request("POST", "/hardware/turnstile/open", "{}", headers)
                self.assertEqual(result[0], 403)
                self.assertNotIn("Access-Control-Allow-Origin", result[2])
            save.assert_not_called()
            pulse.assert_not_called()

    def test_rebinding_host_and_cross_site_without_origin_are_rejected(self):
        self.assertEqual(self.request(headers={"Host": "evil.test"})[0], 403)
        self.assertEqual(self.request(headers={"Sec-Fetch-Site": "cross-site"})[0], 403)
        self.assertEqual(self.request("OPTIONS", headers={"Origin": "null"})[0], 403)

    def test_native_origin_and_actual_development_port_work(self):
        for origin in ["tauri://localhost", "http://localhost:3006"]:
            status, _, headers = self.request(headers={"Origin": origin})
            self.assertEqual(status, 200)
            self.assertEqual(headers["Access-Control-Allow-Origin"], origin)
            self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(self.request()[0], 200)

    def test_malformed_or_oversized_writes_never_reach_hardware(self):
        with mock.patch.object(TurnstileHardwareController, "send_pulse_relay") as pulse:
            for body in ["[]", "null", "not-json"]:
                self.assertEqual(self.request("POST", "/hardware/turnstile/open", body, {"Content-Type": "application/json"})[0], 400)
            self.assertEqual(self.request("POST", "/hardware/turnstile/open", "{}", {"Content-Type": "text/plain"})[0], 415)
            self.assertEqual(self.request("POST", "/hardware/turnstile/open", "{}", {"Content-Type": "application/json", "Content-Length": "999999"})[0], 413)
            pulse.assert_not_called()

    def test_legitimate_configuration_write_still_works(self):
        with tempfile.TemporaryDirectory() as temp, mock.patch.dict("os.environ", {"SIGA_HARDWARE_STATE_DIR": temp}):
            status, data, _ = self.request("POST", "/hardware/bridge-config", json.dumps({"turnstile_ip": "192.168.1.20"}), {"Content-Type": "application/json", "Origin": "tauri://localhost"})
            self.assertEqual(status, 200)
            self.assertEqual(data["turnstile_ip"], "192.168.1.20")

    def test_receipt_http_route_preserves_text_and_rejects_legacy_commands(self):
        with mock.patch.object(EscPosThermalPrinter, "send_to_network_printer", return_value={"status": "success"}) as send:
            payload = json.dumps({"receipt_text": "Recibo 42 · António", "printer_ip": "192.168.1.20"})
            status, _, _ = self.request("POST", "/hardware/printer/thermal", payload, {"Content-Type": "application/json"})
            self.assertEqual(status, 200)
            self.assertIn("Recibo 42 · António".encode("utf-8"), send.call_args[0][1])
            send.reset_mock()
            payload = json.dumps({"school_name": "Escola\x1b@"})
            self.assertEqual(self.request("POST", "/hardware/printer/thermal", payload, {"Content-Type": "application/json"})[0], 400)
            send.assert_not_called()

    def test_public_targets_and_invalid_gates_do_not_open_sockets(self):
        with mock.patch("siga_hardware_bridge.socket.socket") as socket:
            for address in ["8.8.8.8", "0.0.0.0", "169.254.169.254", "example.com"]:
                self.assertEqual(TurnstileHardwareController(address).send_pulse_relay()["status"], "error")
                self.assertEqual(EscPosThermalPrinter.send_to_network_printer(address, b"receipt")["status"], "error")
            for gate in [0, 256, True, "1"]:
                self.assertEqual(TurnstileHardwareController("192.168.1.20").send_pulse_relay(gate_number=gate)["status"], "error")
            socket.assert_not_called()
