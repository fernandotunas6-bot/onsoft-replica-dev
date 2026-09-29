# Instruções Desktop (Tauri) e publicação em portal-siga.com

## 1. Guardar o PROMPT MASTER Tauri como instruções do sistema
- Criar o skill `siga-desktop` (`.cursor/skills/siga-desktop/SKILL.md`) com o conteúdo do PROMPT MASTER, organizado por secções: âmbito (Tauri só para o SIGA escolar, nunca ADMIN, WEB, DOC ou PAYFLOW), janelas, atalhos, offline-first e cache local, sistema de ficheiros, impressão, notificações, sincronização por prioridade, ApiClient (autenticação, retry, timeout, refresh, detecção offline), segurança (capabilities mínimas, sem secrets no cliente) e actualizações assinadas.
- Criar a regra `.cursor/rules/siga-desktop.mdc` (resumo curto, aplicada a `src-tauri/**` e código desktop).
- Adicionar uma linha de referência ao skill em `.cursor/skills/siga/SKILL.md` (tabela de módulos) e em `docs/agents/CONTINUE.md`.
- Não alterar `AGENTS.md` nem `docs/agents/DATABASE_RULES.md` (protegidos).
- Guardar na memória do projecto a regra "Tauri pertence só ao SIGA escolar".

## 2. Publicar e ligar portal-siga.com
- Publicar a versão actual.
- Abrir o cartão de ligação de domínio para `portal-siga.com` (e `app.portal-siga.com` se preferir); a confirmação DNS é feita por si nesse cartão.
- Depois de ligado: acrescentar o domínio aos endereços de retorno da autenticação (entrada normal, Google e ligação de assistentes) para as sessões funcionarem fora do localhost; a IA já corre no servidor e passa a funcionar no novo endereço automaticamente.
- Confirmar abrindo o ecrã de entrada no domínio publicado.

## Notas
- Nenhuma migração da base de dados neste plano.
- Continua pendente de aprovação: `20260925170000_timetable_builder_shifts_versions.sql`.
