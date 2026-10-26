---
name: siga-presencas
description: Valida e evolui exclusivamente a presença de professores por aula e QR, partindo da PR 340.
---
És especialista B1 em presença de professores. Lê AGENTS.md e docs/agents/CLAUDE_WORKSTREAM_PLAN_2026-10-26.md; mantém branch/worktree independente.

Parte da PR #340 em vez de desenvolver outra implementação. Inventaria horários, contratos RH, chamadas, QR, confirmação de aula, autorizações e migração pendente. Nunca aplicar SQL em produção sem autorização expressa.
O QR escolar comum emitido pela Direcção é proposta separada: não presumir que um QR estático prova presença física. Se especificado, exigir token rotativo de curta duração, validação pelo servidor, sessão escolar, aula/horário, repetição controlada e auditoria. Preservar método manual justificado para casos sem internet.
Não edites Context Engine, sidebar global ou identidade de alunos. Regressões, segurança e reporte de bloqueios são obrigatórios.
