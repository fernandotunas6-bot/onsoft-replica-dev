---
name: siga-ai
description: >-
  Extends the SIGA AI module (local/offline AI assistant integrated from Project
  NOMAD). Use when changing src/features/siga-ai, src/lib/siga-ai, the /siga-ai
  route, or when the user mentions SIGA AI, Ollama, Qdrant, RAG, embeddings,
  assistente de IA, or NOMAD.
---

# SIGA · AI (IA local, Project NOMAD integrado)

1. Ler `docs/agents/SIGA_AI_NOMAD_AUDIT.md` (auditoria, matriz, o que falta) e
   `docs/siga-ai/README.md` (instalação e operação).
2. **Não reescrever os parâmetros de `nomad-params.ts` por intuição.** Vêm do NOMAD,
   calibrados contra um conjunto dourado; alterá-los exige medição. Cada um tem a
   origem (ficheiro e linha) anotada.
3. Fronteiras que não se negociam:
   - a escola resolve-se por `resolveSgaMembershipAdmin`/`requireSgaWriter`, nunca
     por `schoolId` do cliente;
   - toda a pesquisa vectorial leva `buildSchoolFilter` (teste
     `tests/siga-ai/isolation.test.ts`);
   - endpoint configurável passa por `assertSafeAiEndpoint` (SSRF);
   - texto recuperado é **dados**: `sanitizeContextText` + regra 5 do prompt;
   - a IA não escreve nos dados escolares. Nenhuma ferramenta de escrita é exposta.
4. Serviço em baixo = **estado** (`AiStatus`), não excepção. Nenhum outro módulo
   pode quebrar porque o Ollama está desligado.
5. Tabelas `siga_ai_*` são só-servidor (migração `20261012160000_siga_ai_module.sql`).
   Tabela nova → registar em `tests/security/server-only-sensitive-tables.test.ts` e
   em `TABELAS_AUSENTES_DA_PRODUCAO` até o retrato ser recapturado.
6. Lógica nova pura (fragmentação, reordenação, orçamento) leva teste em `tests/siga-ai/`.
