# SIGA Desktop — plano de autonomia offline e actualizações (25/10/2026)

## Estado real e meta

**Hoje:** Tauri 2 empacota a central local `desktop/`, enquanto a janela escolar
`school` abre `https://portal-siga.com` por WebView remoto. O Service Worker
retém algumas páginas previamente visitadas; consultas institucionais não sensíveis
são cacheadas por escola e notas/presenças suportadas usam fila no Stronghold.
Isto **não** equivale a uma instalação integral do SIGA nem a módulos escolares
autónomos, e a aplicação não pode prometer operação total sem internet.

**Meta:** instalação completa das interfaces e dados autorizados no posto de trabalho,
operação offline por escola/actor, sincronização bidireccional controlada com
Supabase/Cloudflare e actualização do binário Tauri por releases assinadas.

## Responsável e limites

Skill: `.cursor/skills/siga-desktop/SKILL.md`, regras:
`.cursor/rules/siga-desktop.mdc`, `AGENTS.md` e `desktop/AGENTS.md`.
Tauri é só do SIGA escolar. Nunca transplantar o backend Cloudflare/Supabase,
segredos da service role ou acesso a outras escolas para o instalador.
`school-portal.json` é uma capability REMOTA mínima, não uma permissão geral.

## Fases com critérios verificáveis

### 0. Integridade e ciclo de actualização — melhoria em curso

- Fila protegida contra chamadas simultâneas; não apagar a fila em erro de leitura.
- Sincronizações concorrentes serializadas, inclusive após uma primeira tentativa sem entradas; regressão coberta por testes.
- Cada lançamento novo associa escola e actor de origem; replay só com a escola e o actor originais, e os dois são novamente validados no servidor.
- A cache institucional não é restaurada sem escola activa e só é persistida se a escola continuar a mesma quando expira o debounce; cache legada `default` não é usada.
- A fila anterior sem `schoolId` permanece cifrada e bloqueada para envio automático; reconciliação manual antes de qualquer migração.
- Bloquear actualização enquanto houver *qualquer* lançamento no Stronghold,
  incluindo os recusados, além de mutações React ainda pendentes.
- Voltar a procurar uma release ao recuperar a ligação, sem instalar à força.
- Os instaladores continuam em release draft até revisão e publicação manual.
- **Pendência:** ensaio E2E com perda de rede, reinício e validação de integridade
  dos artefactos assinados em Windows/macOS/Linux.

### 1. Interface executável e recursos locais

- Identificar páginas que exigem SSR, server functions, cookies e URLs remotas.
  Separar adaptadores de dados da interface; produzir bundle estático local
  de todas as páginas necessárias ou uma shell desktop específica **sem**
  duplicar o motor de regras. O `desktop/dist` actual só contém a central.
- Alterar o launcher para abrir as rotas escolares locais apenas **depois**
  de haver paridade de permissões, navegação, autenticação e armazenamento.
  Não apontar para `WebviewUrl::App` antes de existir bundle escolar.
- Instalação inicial sem internet: artefactos de WebView2 Windows já configurados;
  ensaiar Safari/WebKit macOS e WebKitGTK Linux e dependências por distribuição.

### 2. Base local segura por escola

- Criar SQLite local versionado com migrations transaccionais, sem replicar a
  base PostgreSQL de produção. Por escola, utilizador e dispositivo: metadados
  de sincronização, revisões, `outbox`, `inbox` e *tombstones*.
- Escolher retenção, cifragem da base e chave em cofre do sistema/Stronghold;
  rever partilha de dispositivo, roubo, expiração de sessão, MFA e revogação.
- Download inicial **autorizado e com internet**; downloads incrementais com
  cursor por escola/actor e escopos explícitos. Nunca copiar indiscriminadamente
  tabelas de pagamentos, pessoais, credenciais ou Storage.
- Nenhuma leitura offline passa a conceder novos direitos: usar snapshot de
  permissões com validade limitada; funções de alto risco exigem online + MFA.

### 3. Sync seguro (não «last write wins» automático)

- Contrato por módulo: `school_id`, `actor_id`, `device_id`, `op_id`
  idempotente, versão de registo, revisão do servidor, `created_at`.
- Validar auth, MFA, RBAC e RLS **no servidor** em cada operação enviada.
- Usar transacções e respostas idempotentes; nunca inferir sucesso de timeout.
  Conflitos de pauta/período fechado/matrícula/pagamento mostram resolução
  explícita, sem sobrescrever notas do servidor.
- Anexos exigem upload recuperável, checksums e consentimento para cache.
- Bloquear sincronização cruzada de escolas e de utilizadores; migração da
  fila legada de 60 KiB sem perda de dados é pré-condição.
- Pagamentos e fiscalidade permanecem **online** até existir idempotência,
  autorização reforçada e reconciliação. Não emitir recibo definitivo offline.

### 4. Entrega de actualizações como aplicação instalada

- Manter Tauri v2 updater com `TAURI_UPDATER_PUBKEY`, chave privada **só**
  nos secrets do CI, `latest.json` numa release publicada e assinatura
  verificada antes da instalação; nunca activar TLS inseguro.
- No arranque, retorno da rede e revisões periódicas: procurar versão;
  apresentar notas e pedir confirmação. Se houver fila ou tarefas abertas,
  adiar. Guardar rollback operacional e esquema local retrocompatível.
- Distinguir **versão da aplicação** (instalador Tauri) de **dados escolares**
  (sincronização): um não substitui o outro. Um novo site web não actualiza
  automaticamente uma shell escolar local, pelo que é preciso versão empacotada.

## Aceitação obrigatória antes de anunciar «100% offline»

1. Windows 10/11, macOS e Linux instalam e iniciam **sem rede** em máquina limpa.
2. Todas as rotas escolares abrangidas abrem sem servidor, com dados previamente
   autorizados e aviso do momento da última sincronização.
3. Dados de escola A/actor A não ficam visíveis a B nem após logout, troca de escola,
   revogação ou perda do dispositivo.
4. Desligar rede durante criação/edição, reiniciar app/posto, recuperar rede:
   zero perdas, zero duplicados e conflitos explícitos.
5. Atualizações assinadas válidas são aceites; assinatura errada, versão
   incompatível ou operações pendentes impedem instalação.
6. Testes de RLS/MFA/roles e dispositivos físicos passam; evidências ficam na PR.
7. Não usar dados demo para anunciar sincronização real em produção.

## Validação recomendada

`node scripts/check-desktop.mjs`; `npm run desktop:quality`;
`npm --prefix desktop run check:all`; `bunx vitest run
tests/tauri/offline-outbox.test.ts tests/tauri/native-updater.test.ts`;
CI do repositório, ensaio manual dos instaladores e sincronização com duas
escolas reais de ensaio autorizadas. Não publicar nem lançar migrações em
produção sem essa evidência.
