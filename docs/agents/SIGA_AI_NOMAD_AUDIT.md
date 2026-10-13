# Fase 1 — Auditoria SIGA Plus × Project NOMAD

Data: 2026-10-12. Autor: agente Claude Code. Estado: **verificada contra código, não presumida**.

## 1. O que foi inspeccionado

| Projecto | Referência fixada | Forma |
| --- | --- | --- |
| SIGA Plus | `main` @ `36d0b51` (este repositório) | leitura directa |
| Project NOMAD | `main` @ `54ee30a44902e5c252b477f8685c26ec3064ab72`, versão `1.35.1` | clone raso `--depth 1` |

O commit do NOMAD acima é o que esta integração cita. Qualquer reavaliação futura compara-se com ele.

## 2. Arquitectura real dos dois lados

### SIGA Plus (verificado)

- **Frontend/servidor:** TanStack Start 1.168 + React 19 + Vite 8 + Tailwind 4, Radix/shadcn
  (`components.json`), rotas por ficheiro em `src/routes`, lógica de servidor em `createServerFn`.
- **Autenticação:** Supabase Auth com middleware próprio `requireSupabaseAuth`
  (`src/integrations/supabase/auth-middleware.ts`), MFA/AAL2 (`session-mfa.ts`), step-up (`src/lib/step-up.ts`).
- **Autorização:** `requireSgaWriter` / `requireSgaWriterFor` / `resolveSgaMembershipAdmin`
  (`src/integrations/supabase/sga-admin.ts`), permissões por módulo em `staff_module_grants`
  (`ModuleGrantKey`), navegação e RBAC de ecrã em `src/features/auth/access-policy.ts` +
  `portal-engine.ts` + `navigation-catalog.ts` + `route-inventory.ts`.
- **Multi-tenant:** cada escrita resolve a escola pela membership do utilizador; tabelas sensíveis são
  `FORCE ROW LEVEL SECURITY` sem políticas e só acessíveis pela chave de serviço
  (`docs/agents/DATABASE_RULES.md`). Base de dados = **produção**.
- **Desktop:** Tauri 2 (`src-tauri/`, `desktop/`), com store/stronghold/updater.
- **Cloudflare:** build e deploy por `scripts/deploy-cf.mjs`, CSP em `src/lib/csp.ts`.
- **IA existente:** `src/lib/ai-gateway.server.ts` — **um** adaptador para o Lovable AI Gateway
  (`https://ai.gateway.lovable.dev/v1`, modelo `openai/gpt-6-astra`, chave `LOVABLE_API_KEY`),
  usado por `src/features/ai-assist/ai-assist.functions.ts` (diagnóstico de erros, risco de aluno)
  e por `src/features/lesson-plans/ai-lesson-plan-generator.ts`. É **100 % remoto**: sem ele não há IA,
  e qualquer corte de internet ou de créditos desliga as funcionalidades.
  Dependências já presentes: `ai@^7`, `@ai-sdk/openai@^4`.

### Project NOMAD (verificado)

- **Não é uma biblioteca de IA.** É uma aplicação **AdonisJS 6 + Inertia/React** (`admin/`) que serve de
  "Command Center": orquestra contentores Docker (Ollama, Qdrant, Kiwix, Kolibri, CyberChef, FlatNotes…)
  através de `docker_service.ts`, e instala-se por `install/install_nomad.sh` + `management_compose.yaml`
  num Debian/Ubuntu com privilégios de root.
- **O motor de IA não é código do NOMAD:** é o **Ollama** (inferência e embeddings) e o **Qdrant**
  (vectores), ambos processos externos. O NOMAD traz o *cliente* e a *tubagem*:
  - `app/services/ollama_service.ts` (1558 linhas) — descoberta do endpoint, `/api/tags`, `/api/show`,
    `/api/ps`, `/api/pull`, `/api/delete`, `/api/chat` nativo, `/api/embed` com recurso a
    `/v1/embeddings` (LM Studio, llama.cpp), perfis de amostragem, janela de contexto.
  - `app/services/rag_service.ts` (2776 linhas) — ingestão, fragmentação, embeddings, Qdrant, pesquisa,
    reordenação heurística, diversidade, piso de relevância.
  - `app/services/rag_pipeline_service.ts` — reescrita da pergunta, recuperação, juiz de relevância,
    orçamento de tokens, montagem final das mensagens.
  - `app/services/chat_service.ts`, `context_window_service.ts`, `token_calibration_service.ts`,
    `relevance_judge_service.ts`, famílias `eval_*` (arnês de avaliação).
- **Sem autenticação, por desenho.** O próprio README: *"By design, Project NOMAD is intended to be open
  and available without hurdles — it includes no authentication."* Não tem utilizadores, papéis nem
  tenants. Toda a base de conhecimento é uma colecção global (`nomad_knowledge_base`).
- **Persistência:** Lucid/SQLite + KV próprio. Nada compatível com Postgres/RLS do SIGA.
- **Licença:** **Apache-2.0** (`LICENSE`, `package.json`). Permite uso, modificação e redistribuição com
  aviso de licença e nota de alterações. Ollama (MIT) e Qdrant (Apache-2.0) são projectos à parte,
  consumidos como serviços — não são redistribuídos por nós.

## 3. Matriz de compatibilidade

| Componente NOMAD | Reutilizável no SIGA? | Decisão | Porquê |
| --- | --- | --- | --- |
| Ollama (inferência + embeddings) | **Sim, como serviço externo** | consumir por HTTP | é o motor; não se reescreve nem se empacota |
| Qdrant (vectores) | **Sim, como serviço externo** | consumir por HTTP REST | idem; isolamento por *payload filter* por escola |
| `ollama_service.ts` | **Não como código** | **porte do contrato** para `src/lib/siga-ai/ollama-client.server.ts` | depende de AdonisJS (`@inject`, `logger`), Docker e `axios`; o valor está no contrato HTTP e nos recursos (`/api/embed` → `/v1/embeddings`) |
| `rag_service.ts` | **Não como código** | **porte dos parâmetros e da heurística** (`nomad-params.ts`, `chunking.ts`, `rerank.ts`) | 2776 linhas acopladas a Lucid, ZIM, KV e colecção global; os números são o que foi calibrado |
| `rag_pipeline_service.ts` | parcialmente | porte de `context-limits.ts` + `prompts.ts` | orçamento por tamanho de modelo e forma dos *prompts* são transferíveis |
| `chat_service.ts` (histórico) | **Não** | reimplementar em Postgres + RLS | SQLite single-tenant; o SIGA precisa de `school_id` e auditoria |
| Juiz de relevância (LLM) | sim, conceito | **Fase posterior** | custa uma chamada extra ao modelo; não entra nesta PR |
| Kiwix / Kolibri / ProtoMaps / CyberChef / FlatNotes | **Fora de âmbito** | não integrar | são produtos próprios, não IA; nada no pedido os exige |
| Instalador, Docker orchestration, Supply Depot, benchmark | **Não** | não integrar | requer root no anfitrião e contraria o modelo de implantação do SIGA (Cloudflare + Tauri) |
| Ausência de autenticação | — | **rejeitado explicitamente** | o SIGA é multi-escola com dados de menores; ver §5 |

### Parâmetros portados (com proveniência)

Todos em `src/features/siga-ai/nomad-params.ts`, cada um com o ficheiro e a linha de origem:

| Parâmetro | Valor | Origem |
| --- | --- | --- |
| Modelo de embeddings | `nomic-embed-text:v1.5` | `constants/ollama.ts:65` |
| Dimensão / distância | 768 / `Cosine` | `rag_service.ts:86,167` |
| Prefixos de tarefa | `search_document: ` / `search_query: ` | `rag_service.ts` |
| Contexto do embedder | 2048 tok, teto seguro 1600 | `rag_service.ts:85-86` |
| Fragmento | 1500 tok, sobreposição 150 | `rag_service.ts:87,91` |
| Razão caracteres→tokens | 2 | `rag_service.ts:92` |
| Lote de embeddings | 8 | `rag_service.ts` |
| `top_k` / limiar denso | 5 / 0.30 | `constants/ollama.ts:100-101` |
| Candidatos para reordenar | `limit * 3` | `rag_service.ts:1025` |
| Porta de qualidade do boost | 0.35 | `rag_service.ts:1185` |
| Boosts (palavras-chave / termos / títulos) | 10 % / 7,5 % / 10 % do score, com raiz quadrada | `rag_service.ts:1199-1260` |
| Piso pós-reordenação | 0.62 (0.66 é o último valor sem perda de *recall*; o original escolhe 0.62 por margem) | `constants/ollama.ts:104-172` |
| Tectos por tamanho de modelo | ≤3B: 2 res./1000 tok; ≤8B: 4/2500; 13B+: 5/∞ | `constants/ollama.ts:91-95` |
| Janela mínima do servidor | 8192 | `constants/ollama.ts:83` |

Estes números **não são inventados nem presumidos**: são os do NOMAD, que os calibrou contra um conjunto
dourado de 99 perguntas (a tabela `recall@5 / precision@5` está citada no original e no nosso ficheiro).
Reescrevê-los "por intuição" seria perder exactamente o trabalho que justifica reutilizar o NOMAD.

## 4. Conflitos de dependências

- **Nenhuma dependência nova é necessária.** O cliente Ollama e o cliente Qdrant foram escritos sobre
  `fetch` nativo (24 e 12 métodos usados, respectivamente). Evita-se `ollama`, `@qdrant/js-client-rest`,
  `axios` e `langchain` — o NOMAD usa-os, mas trazem peso, *bundling* no Cloudflare Workers e superfície
  de segurança que o SIGA não precisa.
- `@adonisjs/*`, `@inertiajs/*`, `luxon`, `dockerode` — **incompatíveis**, não entram.
- `ai` / `@ai-sdk/openai` já existem e continuam a servir o modo remoto (Lovable Gateway).

## 5. Riscos de segurança identificados (e o que a integração faz)

| Risco | Mitigação nesta integração |
| --- | --- |
| NOMAD não tem autenticação; expor o seu padrão ao SIGA abriria dados de menores | nenhum endpoint do SIGA AI é público: todos passam por `requireSupabaseAuth` + membership |
| Colecção de vectores global (`nomad_knowledge_base`) | colecção `siga_ai_kb` com `school_id` em *payload* **obrigatório** no filtro de pesquisa; o filtro é construído no servidor, nunca aceito do cliente |
| `school_id` vindo do cliente | ignorado: a escola resolve-se sempre por `resolveSgaMembershipAdmin`/`requireSgaWriter` |
| SSRF pelo endpoint configurável (Modo B) | `assertSafeAiEndpoint` recusa esquemas não-HTTP, credenciais no URL, e em produção recusa anfitriões fora de `SIGA_AI_ALLOWED_HOSTS` |
| *Prompt injection* por documento ingerido | contexto entregue em bloco delimitado e marcado como dados não confiáveis; o *prompt* de sistema proíbe obedecer a instruções vindas do contexto; nenhuma ferramenta de escrita é exposta ao modelo |
| Fuga de dados escolares para serviços externos | Modo C só actua com `ai_remote_enabled` ligado pela escola; o estado é visível na interface |
| Exposição pública de Ollama/Qdrant | documentado em `docs/siga-ai/README.md` (ligar a `127.0.0.1` ou à rede interna, nunca à internet); nenhum URL destes serviços chega ao browser |
| Esgotamento de recursos por ficheiros grandes | limites de tamanho e de número de fragmentos nos *schemas* |

## 6. Decisão de abordagem

**Adaptadores + serviços externos**, não cópia de repositório.

> Copiar o `admin/` do NOMAD para dentro do SIGA Plus traria um segundo *framework* de servidor
> (AdonisJS), um segundo ORM (Lucid), um segundo modelo de persistência (SQLite), orquestração Docker
> com root, e um modelo de segurança sem autenticação — para obter acesso a dois processos que falam
> HTTP. O que tem valor real e é transferível são o **contrato HTTP** e os **parâmetros calibrados**;
> é isso que esta integração porta, com proveniência linha a linha e `NOTICE` Apache-2.0.

## 7. Plano de migração não destrutivo

1. Nada do existente é alterado em comportamento: `ai-gateway.server.ts` e `ai-assist` ficam intactos.
2. Módulo novo e isolado `siga-ai` (`src/features/siga-ai`, `src/lib/siga-ai`, `src/routes/siga-ai.tsx`).
3. Tabelas novas, nenhuma alterada: `siga_ai_settings`, `siga_ai_conversations`, `siga_ai_messages`,
   `siga_ai_documents`, `siga_ai_document_chunks`, `siga_ai_usage`. Todas só-servidor.
4. A indisponibilidade da IA devolve estado `offline`/`unavailable` — nunca uma excepção que suba ao
   ecrã de outro módulo.
5. SQL por aplicar à mão (`npm run siga:sql`); **não** se aplicam migrações pelo Lovable (AGENTS.md).

## 8. O que esta PR entrega e o que fica para depois

Entregue (Fases 2–5 em código, com testes): parâmetros portados, cliente Ollama, cliente Qdrant,
resolução de modo A/B/C com diagnóstico, gateway autenticado com isolamento por escola, pipeline RAG
(fragmentação → embeddings → pesquisa → reordenação → piso → orçamento → resposta com referências),
persistência de conversas e documentos, página SIGA AI, área administrativa por escola, SQL, documentação.

**Não entregue nesta PR, e por isso não declarado concluído:**

- Juiz de relevância por LLM e reescrita da pergunta por LLM (uma chamada extra por pergunta).
- Extracção de **PDF**: exige uma biblioteca de análise (pdfjs) que não está instalada; a
  decisão de acrescentar a dependência fica para o dono. TXT, Markdown, CSV e **DOCX** já são
  lidos — o .docx no próprio browser, com o ZIP e o `DecompressionStream` nativos
  (`src/features/siga-ai/docx-text.ts`), para o servidor receber texto e nunca o binário.
- Instalação de modelos pela interface administrativa (`/api/pull` com progresso).
- Resposta em *streaming* token a token (a resposta chega completa; o cancelamento aborta o pedido).
- Sincronização offline de dados académicos (explicitamente fora de âmbito: §9 do pedido exige
  resolução de conflitos e auditoria que não existem).
- Testes end-to-end com Ollama real: requerem um anfitrião com modelo instalado, que o CI não tem.
  Os testes desta PR cobrem a lógica pura e os limites de isolamento.
