# SIGA Desktop — Danny Smith Tauri Template

A base desktop é o [Danny Smith Tauri Template](https://github.com/dannysmith/tauri-template), commit `437a18b9b63924833857f299217a5270f009d120`, licença MIT preservada em `desktop/LICENSE.md`. A adopção inclui React/Vite/TypeScript, Tailwind/shadcn, Zustand, TanStack Query, i18next, paleta de comandos, preferências, menus nativos, quick pane, recuperação de dados, testes e arquitectura Rust com tauri-specta.

## Estrutura e desenvolvimento

- `desktop/`: aplicação local completa e independente, com `package-lock.json` e npm.
- `src-tauri/`: crate nativa canónica. Não existe outra configuração Tauri em `desktop/`.
- `src-tauri/src/commands/`: comandos tipados do template e integração SIGA.
- `src-tauri/src/school/`: compatibilidade com os comandos escolares existentes, incluindo IPC binário de exportação.
- `desktop/UPSTREAM.json`: origem exacta da base adoptada.

Na raiz: `npm run desktop:install`, depois `npm run desktop:dev` ou `npm run desktop:build`. O Vite do template usa `localhost:1420`. `npm run desktop:check` valida configuração e permissões. `npm run desktop:quality` executa as verificações completas do template (requer Rust e bibliotecas Tauri do sistema). `npm --prefix desktop run rust:bindings` regenera os bindings em `desktop/src/lib/bindings.ts`.

Versões: o `tauri build` pára quando um pacote `@tauri-apps/*` instalado (em `desktop/` ou na raiz) difere da crate correspondente em major.minor (ex.: `@tauri-apps/api` 2.12.x com `tauri` 2.12.x; `@tauri-apps/plugin-updater` 2.13.x com `tauri-plugin-updater` 2.13.x). Ao actualizar o `Cargo.lock`, actualizar também `desktop/package-lock.json` e `bun.lock`. O `desktop:check` compara os três lockfiles e falha antes do build.

O launcher antigo (`launcher.js`, `launcher.css`) e `tauri.dev.conf.json` foram removidos. O frontend web SIGA continua a ser SSR: não pode ser incorporado a partir de `.output/public`.

## Janelas e permissões

`main` aloja o frontend local completo; `quick-pane` é o painel rápido do template. A acção «Abrir SIGA» cria ou foca a janela `school` em `https://portal-siga.com`. O portal preserva as funções nativas e a sua barra de título do sistema. Menus, preferências e atalhos da central usam a estrutura do template.

As capabilities locais autorizam os plugins do template apenas em `main` e `quick-pane`. A capability `school-portal` aplica-se exclusivamente a `school`, à origem exacta do portal, com comandos escolares e notificações. O portal não recebe acesso aos plugins de ficheiros, diálogos, processos, store, stronghold, shell ou updater do template. `print-*` e `payflow-*` não recebem capabilities.

Um comando tipado é registado em `bindings.rs` e no manifesto de `build.rs`, com permissão na capability local. Os comandos escolares existentes são registados em `school/mod.rs`, no mesmo manifesto e na capability escolar. O dispatcher mantém ambas as famílias. Os testes em `tests/tauri/capabilities.test.ts` verificam esse contrato.

Fechar `main` segue o comportamento do template: encerra no Windows/Linux e oculta no macOS, onde o Dock permite reabrir. Instância única e restauração de tamanho/posição vêm do template. O quick pane tem atalho global configurável.

## Arranque e actualizações

Um atalho global ocupado ou inválido não interrompe o arranque: tenta-se o padrão quando o personalizado falha, sem alterar a preferência guardada. Se ambos estiverem indisponíveis, o quick pane continua acessível pelos comandos da aplicação. Abrir uma segunda instância mostra e restaura a janela principal antes de lhe dar foco.

O updater só é registado com uma chave pública real em `plugins.updater`. A configuração base não inclui chaves fictícias nem servidores de exemplo. A central consulta disponibilidade sem instalar nem reiniciar; a instalação continua no portal escolar, com a protecção de gravações pendentes existente. Preferências e interface local funcionam sem Internet; os módulos académicos dependem do servidor.

## Armazenamento nativo (Store e Stronghold)

A app local (`main`) recebe os plugins completos `store:default` e `stronghold:default`. O portal não: os comandos destes plugins aceitam caminhos livres (absolutos ou com `..`) e, numa origem remota, um XSS poderia escrever ficheiros em qualquer pasta do utilizador. O portal usa comandos próprios (`src-tauri/src/school/native_storage.rs`), que gravam sempre nos mesmos ficheiros da pasta de dados da app:

- **Definições do posto** — `portal_store_get/set/delete` em `siga-portal.json` (plugin Store). Chaves `[A-Za-z0-9-_.:]`, até 128 caracteres; valores JSON até 64 KiB; até 256 chaves. No portal: `src/lib/native-store.ts`. As definições de catracas/impressora (`WindowsDesktopSettingsModal`) já usam este ficheiro; o localStorage fica como cópia para leituras síncronas e as definições antigas migram na primeira leitura.
- **Cofre cifrado** — `portal_vault_unlock/lock/get/set/remove` em `siga-portal.hold` (plugin Stronghold, chave derivada por argon2 com o sal `siga.salt`, partilhado com o cofre da app local). A primeira abertura cria o cofre com a palavra-passe indicada; as seguintes exigem a mesma. Cada gravação cifra o ficheiro de novo com scrypt (cerca de 1 s em release): guardar só o necessário. No portal: `src/lib/native-stronghold.ts`.
- **Sessão no cofre (PIN do posto)** — na app, o `auth.storage` do Supabase é `desktopSessionStorage()` (`src/lib/desktop-session-vault.ts`): a sessão fica no cofre e não no localStorage do WebView (texto simples no disco). Ao abrir a app, `DesktopVaultGate` pede o PIN deste computador (cria-o na primeira vez, 6 caracteres ou mais); até lá, a autenticação espera em vez de concluir que não há sessão. Cinco PIN errados seguidos bloqueiam 1 minuto. «Esqueci o PIN» (`portal_vault_reset`) apaga o cofre: é preciso entrar de novo, os dados da escola não se perdem. Uma sessão deixada no localStorage por versões anteriores passa para o cofre no primeiro desbloqueio. Cada actualização do token grava o cofre (cerca de 1 s, fora da thread principal). O PIN protege a sessão de quem abre a app no computador; não substitui a palavra-passe da conta nem o fim de sessão por inactividade (30 min).

O Stronghold está marcado para descontinuação no Tauri 3; nessa migração, substituir pelo cofre do sistema (Keychain, Credential Manager, Secret Service) mantendo os mesmos comandos `portal_vault_*`. Em desenvolvimento, o `Cargo.toml` optimiza as crates de argon2/scrypt: sem isso cada gravação demorava minutos.

## Comandos escolares preservados

Hardware (`hardware_bridge_request`, `pulse_turnstile_relay`, `print_thermal_receipt_native`), exportações (`save_file`, máximo 50 MB), impressão (`print_page`, `print_html`, macOS), PayFlow (`open_payflow`), links (`open_external_url`), diagnósticos, portal e actualizações (`check_app_update`, `install_app_update`) mantêm os contratos do frontend web. O protocolo `sigapage://` continua a servir documentos de impressão sem scripts.

## Hardware

O Rust envia TCP em tarefas de fundo, com limites de ligação e escrita, para IPs privados explícitos. Não resolve nomes nem aceita loopback como hardware real. O frontend não repete uma operação física pelo daemon após falha nativa: uma transmissão parcial pode já ter accionado o dispositivo. Quando existe `deviceId`, preserva a verificação de allowlist do daemon.

O modo navegador não simula sucesso. Resultados `simulated` do daemon são rejeitados pelo frontend. A impressão transmite o texto solicitado, limitado a 64 KiB, sem permitir comandos de controlo inseridos no texto. Sucesso de envio TCP não comprova impressão em papel nem abertura mecânica; é necessário validar protocolo e resposta do modelo concreto antes de uso operacional. O pacote de relé existente não constitui certificação de compatibilidade com todos os fabricantes.

O daemon Python permanece um componente instalado e iniciado separadamente. No Tauri, a UI comunica por IPC com `hardware_bridge_request`: o Rust faz HTTP apenas para `127.0.0.1:8088`, com lista fechada de métodos/endpoints, sem proxy, redireccionamentos ou retries, e com limites de pedido/resposta. Assim, a ligação ao daemon não depende de pedidos HTTP directos do WebView HTTPS. No navegador, o HTTP directo continua limitado às origens locais de desenvolvimento/preview.

O daemon rejeita origens desconhecidas (incluindo `null`), Host diferente do endereço local, escrita sem Content-Type JSON, corpos inválidos ou acima de 256 KiB e pedidos de hardware a IPs públicos. Ferramentas locais sem Origin continuam autorizadas: estas protecções impedem chamadas de páginas de terceiros, mas não substituem autenticação de processos locais. A rota de impressão também valida campos dos recibos antigos para impedir inserção de comandos ESC/POS.

## Notificações do sistema

`DesktopNotifications` (no `AppShell`, só na app) subscreve em tempo real as mensagens directas recebidas pela conta e os comunicados da escola, e avisa pelo sistema **só com a app em segundo plano** (com a janela à frente, o próprio ecrã mostra). Uma mensagem nova mostra só o remetente, nunca o texto: o aviso pode aparecer no ecrã bloqueado ou com o ecrã projectado. Um comunicado avisa com o título, pela mesma regra da lista (o pessoal vê todos; alunos e encarregados só os enviados e não os do corpo docente), só acabado de publicar e uma vez. Rajadas juntam-se num aviso («3 mensagens novas»). O aviso de ligação também avisa «Alterações enviadas» quando acaba de enviar o que ficou à espera. Usa o plugin de notificações (`notification:default` já na capability do portal); regras em `src/lib/desktop-notifications.ts`.

## Sem rede

**App desktop (portal na janela da app):**

- **Páginas.** O Service Worker guarda o HTML de cada página aberta e, com rede, pré-carrega as de trabalho (`/`, `/pedagogica`, `/tesouraria`, `/calendario`, `/alunos`) e o código JavaScript delas (`src/lib/offline/desktop-offline.ts`). Sem rede, abre a última versão guardada. O HTML não tem dados pessoais: o servidor nunca recebe a sessão (fica no cofre do cliente), só os cookies da escola activa e do indicador «tem sessão». No navegador e na PWA continua a regra da auditoria de 30/09: o HTML de navegação nunca é guardado (`tests/security/pwa-private-cache.test.ts`); o modo desktop só se liga com a mensagem `SIGA_DESKTOP_OFFLINE` da app (`tests/security/pwa-desktop-offline.test.ts`).
- **Consultas da instituição.** Configurações da escola, anos e períodos lectivos, calendário e salas ficam no localStorage da app (por escola) e só são repostas quando a app abre sem rede; com rede vem tudo fresco (`src/lib/offline/offline-queries.ts`). Por decisão do dono, nada de dados pessoais: turmas e disciplinas vêm do servidor junto com listas de alunos, por isso ficam de fora. Terminar sessão apaga-as.
- **Fila de envio.** Chamadas e notas lançadas sem rede (ou com a rede a cair durante o envio) ficam no cofre do posto, cifradas com o PIN, com o autor (`src/lib/offline/outbox.ts`). Seguem por ordem quando a rede volta, só com a sessão de quem as fez; saem da fila quando o servidor confirma. Erro de rede ou de sessão: ficam à espera. Recusa do servidor: aviso com «Descartar». Sobrevivem a fechar a app e ao fim de sessão por inactividade; «Esqueci o PIN» apaga-as. Só escritas que o servidor aceita repetir sem duplicar (chamada: upsert por sessão e aluno; notas: actualiza a nota existente). Limite: 60 KiB por posto (o cofre aceita 64 KiB por valor).
- **Pagamentos sem rede:** ainda não. `register_payment` não tem chave contra repetições e exige 2FA recente; precisa de uma migração na base de produção (chave de idempotência) antes de entrar na fila.
- **Instalação.** O instalador Windows leva o WebView2 completo (`webviewInstallMode: offlineInstaller`, verificado pelo `check-desktop`): instala sem Internet.

**Navegador e PWA:** as gravações feitas com `useMutation` ficam em pausa só em memória e o aviso de ligação pede confirmação antes de fechar. Chamadas e notas sem rede falham com erro, como antes.

Não existe base local completa nem resolução de conflitos: o offline total (base SQLite por escola, sincronização) é uma fase seguinte.

## Release

`release-desktop.yml` é o único workflow de instaladores: Windows (NSIS), macOS (universal) e Linux (`.deb`, `.rpm`, AppImage, compilados em Ubuntu 22.04). Executa apenas em tags `v*`, exige tag igual à versão Tauri/Cargo e cria release em draft. Não criar tags nem disparar runners pagos para validar uma PR. `native-ci.yml` mantém os checks Windows/macOS em main/manual, sem os duplicar nas PRs. Instalações npm do desktop e compilações Cargo usam lockfiles sem fallback que os altere.

Actualizações assinadas: `scripts/desktop/release-config.mjs` gera `src-tauri/tauri.release.conf.json` e o build usa-o com `--config`. Só com a variável `TAURI_UPDATER_PUBKEY` e o segredo `TAURI_SIGNING_PRIVATE_KEY` o build assina os artefactos e liga o updater ao `latest.json` da release publicada (os rascunhos não chegam às escolas). Sem elas, a versão sai sem actualizações automáticas e abre na mesma. A app verifica 15 s depois de abrir e só instala quando a pessoa carrega em «Instalar e reiniciar», nunca com gravações por enviar. O portal não recebe permissões `updater:` nem `process:`; usa `check_app_update` e `install_app_update`. Guia do dono: [PUBLICAR_VERSOES.md](./PUBLICAR_VERSOES.md).

## Limites actuais

O ecrã local permanece disponível sem Internet, mas os módulos académicos dependem do servidor. A sessão do portal fica no cofre nativo, aberto com o PIN do posto.

Para uma release de produção faltam testes reais dos instaladores Windows/macOS, certificados de assinatura/notarização e validação dos periféricos físicos. A impressão no macOS (`print_page`, `print_html`) foi verificada só no Linux. Compilação Linux e testes automatizados não substituem essas verificações.

## Testes Windows e manifesto

O `build.rs` liga `windows-app-manifest.xml` a todos os alvos MSVC, incluindo os testes de biblioteca. O conteúdo corresponde ao manifesto padrão do `tauri-build 2.7.1`: Common Controls v6. O manifesto automático é desactivado apenas nesse alvo para evitar recursos duplicados; ícone e restantes recursos continuam a ser gerados pelo Tauri. Rever este ficheiro ao actualizar `tauri-build`. Isto trata o erro de carregamento `STATUS_ENTRYPOINT_NOT_FOUND` antes da execução dos testes (tauri-apps/tauri#13419). A biblioteca usa o sufixo `_lib` para evitar colisões de nomes com o executável no Windows.

O arranque React cancela a continuação assíncrona após desmontagem e remove a subscrição de idioma. Os testes de ciclo de vida cobrem StrictMode e desmontagem durante preferências, idioma e criação de menus.
