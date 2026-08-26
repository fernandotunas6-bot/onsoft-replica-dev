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
