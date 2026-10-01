#!/usr/bin/env python3
"""
SIGA — Python Hardware Integration Bridge Daemon (v1.1)
Serviço local Python para interface direta com Hardware de Escolas:
1. Controladores de Catracas Físicas (ZKTeco, Intelbras, Control iD, Hikvision via TCP/IP & Relés).
2. Impressoras Térmicas ESC/POS (Recibos de Propinas e Senhas de Portaria).
3. Impressoras de Cartões PVC de Estudante (Evolis, Zebra, Datacard).
4. Leitores Biométricos e USB Barcode Scanners.
5. Descoberta local Linux (USB série + CUPS) com allowlist — só localhost, sem vazar dados.
"""

import sys
import json
import time
import socket
import ipaddress
from http.server import HTTPServer, BaseHTTPRequestHandler

from device_discovery import (
    discover_local_devices,
    is_device_allowed,
    load_allowlist,
    save_allowlist,
)
from bridge_config import load_bridge_config, save_bridge_config
from siga_cloud_client import validate_gate_pass_remote

DEFAULT_PORT = 8088
BIND_HOST = "127.0.0.1"  # nunca expor na LAN
ALLOWED_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3006",
    "http://127.0.0.1:3006",
    "tauri://localhost",
    "http://tauri.localhost",
)


def _cors_origin(handler: BaseHTTPRequestHandler) -> str:
    origin = handler.headers.get("Origin", "")
    if origin in ALLOWED_ORIGINS:
        return origin
    return ""

MAX_REQUEST_BYTES = 256 * 1024


def _hardware_ip(value):
    address = ipaddress.ip_address(value)
    private_v4 = (ipaddress.ip_network("10.0.0.0/8"), ipaddress.ip_network("172.16.0.0/12"), ipaddress.ip_network("192.168.0.0/16"))
    allowed = any(address in network for network in private_v4) if address.version == 4 else address in ipaddress.ip_network("fc00::/7")
    if not allowed:
        raise ValueError("Configure um IP privado para o hardware físico.")
    return address


class TurnstileHardwareController:
    """
    Controlador de Hardware de Catracas via Socket TCP/IP ou Protocolo de Relé.
    O protocolo deve ser homologado para o modelo físico antes de uso operacional.
    """
    def __init__(self, ip_address="192.168.1.201", port=4370):
        self.ip_address = ip_address
        self.port = port

    def send_pulse_relay(self, gate_number=1, duration_ms=3000, direction="entry"):
        """
        Envia comando físico de relé para abrir o braço da catraca.
        Direção 'entry' (Entrada) -> Relé 1 (Braço Verde)
        Direção 'exit'  (Saída)   -> Relé 2 (Braço Azul/Laranja)
        Protocolo padrão Wiegand/Relé: 0x55 0xAA [DIRECTION_BYTE] [GATE] [DURATION]
        """
        if direction not in ("entry", "exit") or type(gate_number) is not int or not 1 <= gate_number <= 255:
            return {"status": "error", "error": "Catraca ou direcção inválida."}
        if type(duration_ms) is not int or not 1000 <= duration_ms <= 255000:
            return {"status": "error", "error": "Duração do pulso inválida."}
        dir_byte = 0x01 if direction == "entry" else 0x02
        try:
            address = None if self.ip_address in ("127.0.0.1", "localhost") else _hardware_ip(self.ip_address)
            sock = socket.socket(socket.AF_INET6 if address and address.version == 6 else socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2.0)
            command_payload = bytes([0x55, 0xAA, dir_byte, gate_number, (duration_ms // 1000) & 0xFF])
            if self.ip_address in ["127.0.0.1", "localhost"]:
                sock.close()
                return {
                    "status": "simulated",
                    "direction": direction,
                    "relay_channel": 1 if direction == "entry" else 2,
                    "message": f"Relé de {direction.upper()} (Braço {gate_number}) ativado por {duration_ms}ms (Simulado)"
                }
            
            try:
                sock.connect((self.ip_address, self.port))
                sock.sendall(command_payload)
                response = sock.recv(1024)
                return {
                    "status": "success",
                    "direction": direction,
                    "bytes_sent": len(command_payload),
                    "response": response.hex()
                }
            finally:
                sock.close()
        except Exception as e:
            return {
                "status": "error",
                "direction": direction,
                "gate": gate_number,
                "error": str(e)
            }

class ZkTecoProtocolHelper:
    """
    Helper de Protocolo TCP NATIVO para Placas ZKTeco C3 e InBio (Porta 4370).
    """
    @staticmethod
    def calc_checksum(data_bytes):
        chk = 0
        for i in range(0, len(data_bytes), 2):
            if i + 1 < len(data_bytes):
                val = (data_bytes[i + 1] << 8) + data_bytes[i]
            else:
                val = data_bytes[i]
            chk += val
            if chk > 0xFFFF:
                chk = (chk & 0xFFFF) + 1
        return (~chk) & 0xFFFF

    @staticmethod
    def build_open_door_command(door_index=1):
        # Comando ZKTeco CMD_ACCEVENT (0x0101) para abertura de porta/catraca
        cmd_id = 1007
        session_id = 0
        reply_id = 0
        payload = bytes([door_index, 0x00, 0x00, 0x00])
        header = bytearray([
            cmd_id & 0xFF, (cmd_id >> 8) & 0xFF,
            0x00, 0x00, # Checksum placeholder
            session_id & 0xFF, (session_id >> 8) & 0xFF,
            reply_id & 0xFF, (reply_id >> 8) & 0xFF
        ]) + payload
        
        chk = ZkTecoProtocolHelper.calc_checksum(header)
        header[2] = chk & 0xFF
        header[3] = (chk >> 8) & 0xFF
        
        prefix = bytes([0x50, 0x50, 0x82, 0x00, len(header), 0x00, 0x00, 0x00])
        return prefix + header

class EscPosThermalPrinter:
    """
    Driver de Impressão Direta ESC/POS para impressoras térmicas de recibos de propina.
    """
    @staticmethod
    def format_receipt_bytes(school_name, student_name, amount_kwanza, nif, receipt_no):
        EscPosThermalPrinter.format_text_bytes("\n".join(str(value) for value in (school_name, student_name, amount_kwanza, nif, receipt_no)))
        ESC = b"\x1b"
        GS = b"\x1d"
        
        buffer = bytearray()
        buffer.extend(ESC + b"@") # Reset
        buffer.extend(ESC + b"a" + b"\x01") # Center align
        buffer.extend(ESC + b"!" + b"\x30") # Double height + width
        buffer.extend(f"{school_name}\n".encode("utf-8"))
        buffer.extend(ESC + b"!" + b"\x00") # Normal text
        buffer.extend(b"RECIBO DE PAGAMENTO DE PROPINAS\n")
        buffer.extend(b"------------------------------------------\n")
        buffer.extend(ESC + b"a" + b"\x00") # Left align
        buffer.extend(f"Recibo N: {receipt_no}\n".encode("utf-8"))
        buffer.extend(f"Estudante: {student_name}\n".encode("utf-8"))
        buffer.extend(f"NIF Escola: {nif}\n".encode("utf-8"))
        buffer.extend(f"Valor Pago: {amount_kwanza} Kz\n".encode("utf-8"))
        buffer.extend(f"Data: {time.strftime('%Y-%m-%d %H:%M:%S')}\n".encode("utf-8"))
        buffer.extend(b"------------------------------------------\n")
        buffer.extend(ESC + b"a" + b"\x01") # Center
        buffer.extend(b"Obrigado! Documento processado por computador.\n\n\n")
        buffer.extend(GS + b"V" + b"\x41" + b"\x03") # Paper Cut
        return bytes(buffer)

    @staticmethod
    def format_text_bytes(text):
        if not isinstance(text, str) or not text.strip() or len(text.encode("utf-8")) > 65536:
            raise ValueError("Texto de impressão vazio ou demasiado longo.")
        if any(ord(char) < 32 and char not in "\n\r\t" or 127 <= ord(char) <= 159 for char in text):
            raise ValueError("Caracteres de controlo não permitidos no recibo.")
        return b"\x1b\x40\x1b\x61\x01" + text.encode("utf-8") + b"\n\n\n\x1d\x56\x41\x03"

    @staticmethod
    def send_to_network_printer(ip_address, raw_bytes, port=9100):
        try:
            address = None if ip_address in ("127.0.0.1", "localhost") else _hardware_ip(ip_address)
            sock = socket.socket(socket.AF_INET6 if address and address.version == 6 else socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(3.0)
            if ip_address in ["127.0.0.1", "localhost"]:
                sock.close()
                return {"status": "simulated", "message": "Impressão enviada em modo simulação."}
            try:
                sock.connect((ip_address, port))
                sock.sendall(raw_bytes)
                return {"status": "success", "bytes_sent": len(raw_bytes)}
            finally:
                sock.close()
        except Exception as e:
            return {"status": "error", "message": str(e)}

class HardwareBridgeRequestHandler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def _accept_request(self):
        port = self.server.server_address[1]
        if self.headers.get("Host", "") not in (f"127.0.0.1:{port}", f"localhost:{port}"):
            self._send_json({"error": "Host local inválido."}, 403)
            return False
        origin = self.headers.get("Origin")
        if origin is not None and origin not in ALLOWED_ORIGINS:
            self._send_json({"error": "Origem não autorizada pelo daemon local."}, 403)
            return False
        if origin is None and self.headers.get("Sec-Fetch-Site") == "cross-site":
            self._send_json({"error": "Pedido cross-site não autorizado."}, 403)
            return False
        return True

    def _send_json(self, data, code=200):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        if _cors_origin(self):
            self.send_header("Access-Control-Allow-Origin", _cors_origin(self))
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Vary", "Origin")
        encoded = json.dumps(data).encode("utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def do_OPTIONS(self):
        if not self._accept_request():
            return
        self.send_response(200)
        if _cors_origin(self):
            self.send_header("Access-Control-Allow-Origin", _cors_origin(self))
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Vary", "Origin")
        self.end_headers()

    def do_GET(self):
        if not self._accept_request():
            return
        if self.path == "/health":
            self._send_json({
                "service": "SIGA Python Hardware Bridge",
                "status": "online",
                "bind": BIND_HOST,
                "hardware": {
                    "turnstiles": "tcp_transport_available",
                    "zkteco_protocol": "command_builder_available",
                    "intelbras_webhook": "cloud_validation_route_available",
                    "esc_pos_printers": "tcp_transport_available",
                    "pvc_card_printers": "not_implemented",
                    "local_discovery": "serial_usb_and_cups",
                },
            })
        elif self.path == "/hardware/discover":
            self._send_json(discover_local_devices())
        elif self.path == "/hardware/allowlist":
            self._send_json({"ok": True, **load_allowlist()})
        elif self.path == "/hardware/bridge-config":
            self._send_json({"ok": True, **load_bridge_config()})
        else:
            self._send_json({"error": "Endpoint não encontrado"}, 404)

    def do_POST(self):
        if not self._accept_request():
            return
        if self.headers.get_content_type() != "application/json":
            self._send_json({"error": "Envie Content-Type application/json."}, 415)
            return
        try:
            content_length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self._send_json({"error": "Content-Length inválido ou em falta."}, 400)
            return
        if self.headers.get("Transfer-Encoding") or not 0 < content_length <= MAX_REQUEST_BYTES:
            self._send_json({"error": "Tamanho do pedido não permitido."}, 413)
            return
        try:
            post_data = self.rfile.read(content_length)
            if len(post_data) != content_length:
                raise ValueError("Pedido incompleto")
            payload = json.loads(post_data.decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("Envie um objecto JSON")
        except (ValueError, UnicodeError, TimeoutError):
            self._send_json({"error": "Pedido JSON inválido ou incompleto."}, 400)
            return

        if self.path == "/hardware/allowlist":
            devices = payload.get("devices") if isinstance(payload, dict) else None
            if not isinstance(devices, list):
                self._send_json({"error": "Envie { devices: [...] }"}, 400)
                return
            saved = save_allowlist(devices)
            self._send_json({"ok": True, **saved})
            return

        if self.path == "/hardware/bridge-config":
            if not isinstance(payload, dict):
                self._send_json({"error": "Envie um objecto JSON."}, 400)
                return
            saved = save_bridge_config(payload)
            self._send_json({"ok": True, **saved})
            return

        if self.path == "/hardware/turnstile/open":
            ip = payload.get("ip_address", "127.0.0.1")
            gate = payload.get("gate", 1)
            direction = payload.get("direction", "entry")
            device_id = payload.get("device_id")
            # Se o cliente indicar device_id da allowlist, exige estar autorizado.
            if device_id and not is_device_allowed(str(device_id)):
                self._send_json(
                    {
                        "error": "Dispositivo fora da allowlist local.",
                        "device_id": device_id,
                    },
                    403,
                )
                return
            ctrl = TurnstileHardwareController(ip_address=ip)
            res = ctrl.send_pulse_relay(gate_number=gate, direction=direction)
            self._send_json({
                "action": "turnstile_pulse",
                "result": res,
                "timestamp": time.time()
            })

        elif self.path in ["/hardware/webhook/scan", "/webhook/turnstile-event"]:
            config = load_bridge_config()
            token = (
                payload.get("card_number")
                or payload.get("qr_code")
                or payload.get("token")
                or payload.get("rfid")
                or ""
            )
            gate = payload.get("gate_id", payload.get("gate", 1))
            direction = payload.get("direction") or config.get("default_direction") or "entry"
            api_key = payload.get("api_key") or payload.get("apiKey") or config.get("device_api_key") or ""
            turnstile_ip = payload.get("ip_address") or config.get("turnstile_ip") or "127.0.0.1"
            siga_url = config.get("siga_app_url") or "http://127.0.0.1:3006"

            granted = False
            person_name = None
            reason = "Token em falta."
            pulse_result = None

            if token and api_key:
                validation = validate_gate_pass_remote(
                    app_url=str(siga_url),
                    api_key=str(api_key),
                    token=str(token),
                    direction=str(direction),
                )
                granted = bool(validation.get("granted"))
                person_name = validation.get("personName")
                reason = validation.get("reason") or ("Acesso autorizado." if granted else "Acesso negado.")
            elif token and not api_key:
                reason = "API key do dispositivo não configurada no daemon local."

            if granted:
                ctrl = TurnstileHardwareController(ip_address=str(turnstile_ip))
                pulse_result = ctrl.send_pulse_relay(gate_number=gate, direction=direction)

            self._send_json({
                "result": {
                    "allow": granted,
                    "gate": gate,
                    "pulse_ms": 3000,
                    "message": reason,
                    "person_name": person_name,
                },
                "siga": {
                    "granted": granted,
                    "reason": reason,
                    "person_name": person_name,
                },
                "pulse": pulse_result,
            })

        elif self.path == "/hardware/printer/thermal":
            school = payload.get("school_name", "ESCOLA SIGA")
            student = payload.get("student_name", "Estudante")
            amount = payload.get("amount", "0,00")
            nif = payload.get("nif", "500000000")
            receipt_no = payload.get("receipt_no", "REC-001")
            printer_ip = payload.get("printer_ip", "127.0.0.1")
            
            try:
                if "receipt_text" in payload:
                    raw_bytes = EscPosThermalPrinter.format_text_bytes(payload["receipt_text"])
                else:
                    raw_bytes = EscPosThermalPrinter.format_receipt_bytes(school, student, amount, nif, receipt_no)
            except ValueError as error:
                self._send_json({"error": str(error)}, 400)
                return
            res = EscPosThermalPrinter.send_to_network_printer(printer_ip, raw_bytes)
            
            self._send_json({
                "action": "print_thermal_receipt",
                "status": "processed",
                "printer_result": res,
                "bytes_generated": len(raw_bytes),
                "preview_text": f"Recibo {receipt_no} para {student} - {amount} Kz"
            })

        else:
            self._send_json({"error": "Endpoint de hardware desconhecido"}, 404)

    def log_message(self, format, *args):
        # Evitar logar payloads; só método e path.
        sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))


def run_bridge_server(port=DEFAULT_PORT):
    server_address = (BIND_HOST, port)
    httpd = HTTPServer(server_address, HardwareBridgeRequestHandler)
    print(f"✓ SIGA Python Hardware Bridge em http://{BIND_HOST}:{port} (só localhost)")
    httpd.serve_forever()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    run_bridge_server(port)
