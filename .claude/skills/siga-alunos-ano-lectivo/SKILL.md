---
name: siga-alunos-ano-lectivo
description: >-
  Continue a PR #339 do SIGA Plus. Use quando trabalhar no login por BI/ID,
  registo de Pessoas, renovação do ano lectivo, turmas A-Z por idade e UI
  contextual de Alunos/Pessoas/Turmas. Consulte o prompt canónico.
---

# SIGA Plus — guia para Claude Code

Esta é a **entrada de compatibilidade para Claude Code**, não uma cópia nem um segundo contrato. **Ler integralmente** a seguinte fonte canónica:

1. [Skill transversal](../../../.cursor/skills/siga-alunos-ano-lectivo/SKILL.md).
2. [PROMPT MASTER integral](../../../.cursor/skills/siga-alunos-ano-lectivo/references/PROMPT_MASTER.md).
3. [Estrutura visual contextual e wireframes](../../../docs/design/STUDENT_LOGIN_CLASSES_CONTEXTUAL_UI_2026-10-26.md).
4. [Pesquisa e arquitectura](../../../docs/specs/SIGA_STUDENT_LOGIN_AGE_CLASSES_ROLLOVER_2026-10-26.md).
5. [Contrato visual master](../../../docs/design/VISUAL_MASTER_2026.md).
6. [Instruções base dos agentes](../../../AGENTS.md).

**Regras críticas:** reutilizar AuthGate, student-number-login, bi-login, Pessoas, StudentEnrollmentSheet, year-rollover, motor de contexto e componentes visuais existentes. Número do aluno não é UUID; a pessoa não desaparece ao mudar o ano; a turma A recebe os mais novos só quando a política é seleccionada e com lotação/segurança válidas. Uma página = uma função contextual.

A PR #339 está em **draft**: novas páginas de preparação, botão Organizar Turmas e escrita transaccional de lotes ainda são trabalho pendente. O motor actual é **somente simulação**. Não executar migrations de produção, não fazer merge, não fazer force-push e nunca afirmar que foram executados testes sem evidência.
