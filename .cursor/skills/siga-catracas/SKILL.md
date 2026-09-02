---
name: siga-catracas
description: Módulo independente de Catracas, Cartão Virtual e Controlo de Acesso Físico no SIGA.
---

# SIGA — Módulo de Catracas e Cartão Virtual

Este módulo gere o controlo de acesso físico ao recinto escolar, os cartões virtuais/físicos com QR Code dinâmico anti-fraude, e a integração com leitores e catracas físicas.

## Funcionalidades Principais

1. **Cartão Virtual do Estudante / Funcionário**:
   - Geração de cartão digital com foto, código de barras (Code128), identificação de escola/turma.
   - QR Code dinâmico renovado periodicamente (HMAC/TOTP) para evitar capturas de ecrã falsificadas.
   - Emissão de layout pronto para impressão em PVC de cartão físico de estudante.

2. **Catracas e Dispositivos Físicos**:
   - Registo de equipamentos (Catracas, Leitores QR/RFID/Wiegand, Totens, App Scanner de Portaria).
   - Comunicação via API REST / Webhooks para validadores de hardware.

3. **Validação de Entrada e Registo no Recinto**:
   - Verificação em tempo real de estado de matrícula e cartão ativo.
   - Registo em `siga_access_logs` com status (`granted` / `denied`) e direção (`entry` / `exit`).
   - Sincronização opcional com a presença diária escolar.

4. **Descoberta local (ciclo 39)**:
   - Daemon `python/hardware_bridge/` em **só** `127.0.0.1:8088`.
   - USB-série + CUPS via `device_discovery.py`; allowlist JSON local (nunca cloud).
   - Cliente: `discoverLocalHardwareDevices` / `getLocalHardwareAllowlist` / `saveLocalHardwareAllowlist` em `src/lib/tauri-bridge.ts`.
   - UI: secção «Hardware local» em `WindowsDesktopSettingsModal` (`/catracas`).
   - Não varrer disco/browser; não inventariar o PC para a SGA cloud.

5. **Pulso no grant (ciclo 40)**:
   - Após `validateGatePassToken` com `granted`, a UI chama `triggerTurnstileRelay`.
   - `resolveTurnstilePulseIp` em `hardware-pulse.ts` (dispositivo → desktop → loopback).
   - Health: `checkPythonHardwareBridgeHealth` + badge no painel.

6. **Operação (ciclo 41)**:
   - `setAccessCardStatus` / `updateTurnstileDevice`.
   - Cartão digital: Suspender · Perdido · Reactivar.
   - Dispositivos: estado + selector no simulador; filtro de logs.

7. **RFID / QR / API key (ciclo 42)**:
   - `linkAccessCardRfid`, `rotateAccessCardQr`, `gate-pass-token.ts`.
   - Cartão digital: campo RFID + Renovar QR.
   - Lista de catracas: copiar `api_key`.

8. **Lista + webhook (ciclo 43)**:
   - `listAccessCards`, `AccessCardsPanel`, `validateGatePassByDeviceApiKey`.
   - `gate-pass-validation.ts` — validação única UI + hardware.

9. **Bridge → SIGA (ciclo 44)**:
   - `POST /api/catracas/device-scan` — rota HTTP para leitores/daemon.
   - `device-webhook-handler.ts` — lógica partilhada.
   - Python: `siga_cloud_client.py`, `bridge_config.py`, webhook com pulso após grant.
   - UI desktop: URL SIGA + API key em `WindowsDesktopSettingsModal`.
