#!/usr/bin/env python3
"""Impressão digital SHA-256 do certificado que assina um APK (esquema v2/v3).

Sem dependências (só a biblioteca padrão): lê o «APK Signing Block» que fica antes
do directório central do ZIP e devolve o SHA-256 do primeiro certificado do
primeiro signatário — o mesmo número que `keytool -list -v` mostra para a chave.

Uso:
  python3 scripts/apk-certificado.py app.apk [outro.apk …]
  python3 scripts/apk-certificado.py --esperado AA:BB:… app.apk   # sai com 1 se diferir
"""

import hashlib
import struct
import sys

V2, V3 = 0x7109871A, 0xF05368C0


def _lp(buf, off):
    n = struct.unpack("<I", buf[off : off + 4])[0]
    return buf[off + 4 : off + 4 + n], off + 4 + n


def certificado_sha256(caminho):
    data = open(caminho, "rb").read()
    eocd = data.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise ValueError("não é um ZIP/APK")
    cd = struct.unpack("<I", data[eocd + 16 : eocd + 20])[0]
    if data[cd - 16 : cd] != b"APK Sig Block 42":
        raise ValueError("sem assinatura v2/v3 (só v1, ou não assinado)")
    size = struct.unpack("<Q", data[cd - 24 : cd - 16])[0]
    start = cd - size - 8
    pairs, i, found = data[start + 8 : cd - 24], 0, {}
    while i < len(pairs):
        plen = struct.unpack("<Q", pairs[i : i + 8])[0]
        found[struct.unpack("<I", pairs[i + 8 : i + 12])[0]] = pairs[i + 12 : i + 8 + plen]
        i += 8 + plen
    block = found.get(V2) or found.get(V3)
    if block is None:
        raise ValueError("bloco de assinatura sem esquema v2/v3")
    signers, _ = _lp(block, 0)
    signer, _ = _lp(signers, 0)
    signed_data, _ = _lp(signer, 0)
    _, off = _lp(signed_data, 0)  # digests
    certs, _ = _lp(signed_data, off)
    cert, _ = _lp(certs, 0)
    h = hashlib.sha256(cert).hexdigest().upper()
    return ":".join(h[k : k + 2] for k in range(0, 64, 2))


def main(argv):
    esperado = None
    if argv[:1] == ["--esperado"]:
        esperado, argv = argv[1].upper(), argv[2:]
    if not argv:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    erro = 0
    for caminho in argv:
        try:
            fp = certificado_sha256(caminho)
        except ValueError as e:
            print(f"{caminho}: {e}", file=sys.stderr)
            erro = 1
            continue
        ok = esperado is None or fp == esperado
        print(f"{caminho}: {fp}{'' if ok else '  ← DIFERENTE do esperado'}")
        erro |= 0 if ok else 1
    return erro


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
