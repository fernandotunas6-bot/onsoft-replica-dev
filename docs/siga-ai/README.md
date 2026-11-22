# SIGA PLUS AI — Powered by Local Intelligence

Assistente de IA do SIGA Plus, com os componentes do [Project NOMAD](https://github.com/Crosstalk-Solutions/project-nomad)
(Apache-2.0) adaptados à arquitectura, autenticação e multi-tenancy do SIGA.
Auditoria e decisões técnicas: [`docs/agents/SIGA_AI_NOMAD_AUDIT.md`](../agents/SIGA_AI_NOMAD_AUDIT.md).

## Como funciona

```
Browser / PWA / Tauri
        │  (sessão Supabase, sempre autenticada)
        ▼
SIGA AI Gateway  ── src/features/siga-ai/gateway.server.ts
        │  membership → escola · perfil → permissão · limite/hora · auditoria
        ├──► Ollama (ou servidor compatível com OpenAI): conversa + embeddings
        └──► Qdrant: vectores, filtrados por school_id
```

O browser nunca fala com o Ollama nem com o Qdrant. Os endereços desses serviços
existem só no servidor.

## Modos

| Modo | Onde corre a IA | Quando usar |
| --- | --- | --- |
| `local` | Ollama na mesma máquina da aplicação | posto único, ou desenvolvimento |
| `school_server` | servidor da escola na rede interna | várias salas sem internet |
| `remote` | serviço remoto institucional | só com `remote_allowed` ligado pela escola |

## Instalação

### 1. Ollama + modelos

```sh
curl -fsSL https://ollama.com/install.sh | sh

# Modelo de conversa: escolher pelo hardware disponível
ollama pull qwen2.5:7b          # ~8 GB de RAM/VRAM
# ollama pull llama3.2:3b       # máquinas modestas
# ollama pull llama3.3:70b      # GPU dedicada

# Modelo de embeddings (obrigatório para a pesquisa documental)
ollama pull nomic-embed-text:v1.5
```

Num servidor da escola, o Ollama tem de aceitar ligações da rede interna:

```sh
# /etc/systemd/system/ollama.service.d/override.conf
[Service]
Environment="OLLAMA_HOST=0.0.0.0"
Environment="OLLAMA_CONTEXT_LENGTH=8192"
```

`OLLAMA_CONTEXT_LENGTH=8192` não é decorativo: o Ollama assume 4096 em máquinas com
menos de 24 GB de VRAM e **trunca em silêncio** o que passa disso.

> **Nunca expor o Ollama à internet.** Não tem autenticação. Ligar a `127.0.0.1`
> (modo local) ou à rede interna da escola, e fechar a porta 11434 no router.

### 2. Qdrant (pesquisa documental)

```sh
docker run -d --name siga-ai-qdrant \
  -p 127.0.0.1:6333:6333 \
  -v siga-ai-qdrant:/qdrant/storage \
  qdrant/qdrant:v1.12.4
```

A colecção `siga_ai_kb` é criada pelo próprio módulo na primeira indexação. O mesmo
aviso se aplica: **não expor a porta 6333** fora do servidor ou da rede interna.

### 3. Base de dados

```sh
npm run siga:sql    # mostra a ordem; aplicar no SQL Editor do Supabase
```

O ficheiro é `supabase/migrations/20261012160000_siga_ai_module.sql`. Cria cinco
tabelas, nenhuma existente é alterada, e é idempotente.
**Não aplicar migrações pelo Lovable** (ver `AGENTS.md`).

### 4. Variáveis de ambiente

| Variável | Para quê |
| --- | --- |
| `SIGA_AI_OLLAMA_URL` | endereço do Ollama da instalação (ex. `http://127.0.0.1:11434`) |
| `SIGA_AI_QDRANT_URL` | endereço do Qdrant (ex. `http://127.0.0.1:6333`) |
| `SIGA_AI_CHAT_MODEL` | modelo por omissão quando a escola não escolhe |
| `SIGA_AI_ALLOWED_HOSTS` | **em produção**, anfitriões que uma escola pode configurar (lista por vírgulas) |

Em produção, um endereço escrito por uma escola só é aceite se o anfitrião constar de
`SIGA_AI_ALLOWED_HOSTS`. Fora de produção, aceitam-se também endereços de rede local.
É isto que impede que o campo de configuração se torne um SSRF com a chave de serviço.

### 5. Activar na escola

`Configurações → SIGA AI` (Administrador): activar, escolher o modo, confirmar o
endereço, escolher o modelo, definir os perfis com acesso, o limite por hora e a
retenção das conversas.

## Operação

- **Estado:** a página `/siga-ai` mostra o modo, o modelo, se a pesquisa documental
  está activa e se o browser está sem internet. Sem serviço, mostra o motivo —
  nenhum outro módulo do SIGA é afectado.
- **Base documental:** aba *Base documental*. TXT, Markdown, CSV, Word (.docx) e **PDF de
  texto**. A extracção é feita no browser (ZIP/`DecompressionStream` nativos para o .docx,
  leitor de operadores de texto para o PDF — sem dependências novas), por isso o servidor
  recebe texto e nunca o binário. **PDF digitalizado não serve:** não há reconhecimento
  óptico, e um PDF sem texto ou com tipos de letra em subconjunto é recusado com instruções,
  em vez de indexar lixo que a IA depois citaria. Âmbitos: pessoal (só o dono), escola,
  público da escola. Só administração e secretaria carregam documentos institucionais.
- **Métricas:** perguntas nas últimas 24 h e 7 dias, tempo médio e modelos usados, em
  `Configurações → SIGA AI`.

## Funcionamento offline

Funciona sem internet: conversa, pesquisa na base documental indexada e consulta de
documentos já carregados. Exige ligação ao servidor institucional: dados académicos
e financeiros, e qualquer escrita. **Não há** sincronização offline de dados
académicos — por desenho, enquanto não existirem resolução de conflitos e auditoria
próprias.

## Manutenção

| Situação | O que fazer |
| --- | --- |
| «Serviço de IA indisponível» | `systemctl status ollama`; confirmar o endereço configurado |
| «Modelo não instalado» | `ollama pull <modelo>`; a instalação pela interface ainda não existe |
| «Sem pesquisa documental» | Qdrant em baixo ou `nomic-embed-text:v1.5` em falta |
| Respostas lentas | modelo grande demais para o hardware; usar `llama3.2:3b` ou GPU |
| Resposta vazia / truncada | confirmar `OLLAMA_CONTEXT_LENGTH` |
| Documento indexado não é citado | o piso de relevância (0,62) corta fragmentos fracos; ver `nomad-params.ts` |
| «Não foi possível extrair texto deste PDF» | PDF digitalizado (imagem): usar a versão Word, ou colar o texto num .txt |
| «O texto deste PDF saiu ilegível» | tipo de letra embutido em subconjunto sem `/ToUnicode`: guardar como .docx |

## Streaming

A resposta chega token a token por `/api/siga-ai/chat` (NDJSON autenticado com o token da
sessão). «Parar» aborta o pedido, e o cancelamento chega ao próprio Ollama — liberta o
modelo em vez de só deixar o browser de esperar. Uma geração interrompida fica no ecrã
marcada como tal e **não** é gravada na conversa.

Onde um *proxy* acumule a resposta em vez de a deixar passar (ou o endpoint não responda),
o assistente volta sozinho à resposta completa pela função de servidor: perde-se o efeito de
escrita, não a resposta. O cabeçalho `x-accel-buffering: no` pede aos *proxies* que não
acumulem.

## Limites conhecidos

- Resposta sem *streaming*: chega completa. O botão «Parar» interrompe a espera do
  browser; o modelo pode continuar a gerar no servidor até terminar.
- Sem juiz de relevância por LLM e sem reescrita da pergunta (custam uma chamada
  extra ao modelo).
- Sem OCR: PDF digitalizado (imagem) é recusado, não indexado.
- Instalação de modelos pela área administrativa ainda não existe.

## Segurança

- Todos os pedidos passam por `requireSupabaseAuth` e por membership activa.
- Isolamento entre escolas em `buildSchoolFilter`, com teste próprio
  (`tests/siga-ai/isolation.test.ts`).
- Documentos recuperados são tratados como dados não confiáveis
  (`sanitizeContextText` + regra explícita no prompt).
- A IA **não altera** notas, matrículas, propinas, presenças nem dados pessoais:
  nenhuma ferramenta de escrita lhe é exposta.
- Configuração e indexação ficam em `audit_logs`.
