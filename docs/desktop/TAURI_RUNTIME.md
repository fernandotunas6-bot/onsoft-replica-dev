# SIGA Desktop: execução e validação

O desktop pertence ao SIGA escolar. Windows é a prioridade; macOS usa o mesmo projecto. A aplicação TanStack Start requer servidor: `.output/public` não é uma aplicação autónoma. O instalador inclui `desktop/index.html`, um ecrã local que abre o portal HTTPS `https://portal-siga.com`. Não inclui ADMIN, WEB, DOC ou PAYFLOW.

## Desenvolvimento

- `npm run desktop:dev`: arranca Vite em localhost:3006 com permissões de desenvolvimento explícitas. Em `tauri dev` o `devUrl` é a origem local da app, por isso a capability `development` é `local: true` (só existe em `tauri.dev.conf.json`) e cobre as mesmas permissões do portal.
- `npm run desktop:check`: verifica launcher, origem de produção, CSP, versão, lockfile e que o updater só é registado com configuração.
- `npm run desktop:build`: compila com Cargo `--locked`. Exige Rust e os pré-requisitos Tauri do sistema operativo.
- `cd src-tauri && cargo test --locked --lib`: testes Rust sem accionar hardware.
- `python3 -m unittest discover -s python/hardware_bridge`: testes do daemon local.
- Linux sem ecrã: `xvfb-run` corre o binário; com um gestor de janelas (por exemplo openbox) vê-se a barra nativa.

A configuração de desenvolvimento não é incluída no build de produção. A capability de produção aceita apenas a origem exacta do portal escolar. Não autoriza shell, acesso livre a ficheiros ou stores, Stronghold, diálogos, updater ou controlo de processos: o que a app faz com eles passa por comandos próprios, cada um com a sua permissão. Links externos passam por validação de esquema e são abertos pelo sistema. Fechar a janela principal fecha a aplicação (também as janelas de impressão e do PayFlow); a bandeja oferece Abrir e Sair enquanto o processo está activo. Abrir o SIGA outra vez foca a janela que já existe.

## Arranque

O plugin do updater exige `plugins.updater` (chave pública) no `tauri.conf.json`. Registado sem essa configuração, a app terminava ao abrir (`PluginInitialization("updater", … invalid type: null, expected struct Config")`). O Rust só o regista quando a chave existe (`updater_configured`); `check-desktop.mjs` e `tests/tauri/native-startup.test.ts` recusam voltar atrás.

## Comandos da app e permissões

A janela principal mostra o portal (origem remota): o Tauri só deixa uma origem remota chamar comandos da app com permissão explícita. Um comando novo acrescenta-se em três sítios — `generate_handler!` (lib.rs), o manifesto de `build.rs` e a capability (`allow-<comando>`) — senão é recusado em produção. `tests/tauri/capabilities.test.ts` confere os três.

| Comando                                                                            | Para quê                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_system_info`, `get_desktop_diagnostics`, `open_school_portal`                 | launcher e diagnóstico                                                                                                                                                                                                                        |
| `hardware_bridge_request`, `pulse_turnstile_relay`, `print_thermal_receipt_native` | hardware (secção seguinte)                                                                                                                                                                                                                    |
| `open_external_url`                                                                | links para fora do portal no browser do sistema                                                                                                                                                                                               |
| `save_file`                                                                        | exportações (CSV, XLSX, PDF, ICS) pelo «Guardar como» nativo: o WKWebView e o WebKitGTK ignoram `<a download href="blob:">`. Bytes no corpo, nome em `x-file-name`; o diálogo abre no Rust e só se escreve no caminho escolhido; máximo 50 MB |
| `print_page`                                                                       | macOS: o `window.print()` do WKWebView não faz nada                                                                                                                                                                                           |
| `print_html`                                                                       | documentos oficiais no macOS: janela `print-<id>` servida por `sigapage://` com `script-src 'none'` (os modelos são editáveis pela escola) e diálogo nativo ao carregar                                                                       |
| `open_payflow`                                                                     | PayFlow numa janela `payflow-<id>` com a troca SSO; a asserção só vai para `https://payflow.portal-siga.com/api/v1/sso/exchange` (o PayFlow local só em builds de desenvolvimento)                                                            |
| `check_app_update`, `install_app_update`                                           | actualizações assinadas (secção Release)                                                                                                                                                                                                      |

As janelas `print-…` e `payflow-…` não entram em nenhuma capability: as páginas delas não chamam comandos. Só a origem exacta do portal fica na janela principal; DOC, PayFlow e ADMIN (subdomínios) abrem no browser do sistema.

No frontend, `DesktopIntegration` liga isto (exportações, links, impressão no macOS, atalhos F5/Ctrl+R, Alt+←/→, Ctrl/Cmd+P (o menu nativo do macOS não tem «Imprimir»), Ctrl + / − / 0 com zoom lembrado e o aviso de versão nova). A janela tem a barra de título nativa; a web já não desenha barras próprias dentro da app.

## Hardware

O Rust envia TCP em tarefas de fundo, com limites de ligação e escrita, para IPs privados explícitos. Não resolve nomes nem aceita loopback como hardware real. O frontend não repete uma operação física pelo daemon após falha nativa: uma transmissão parcial pode já ter accionado o dispositivo. Quando existe `deviceId`, preserva a verificação de allowlist do daemon.

O modo navegador não simula sucesso. Resultados `simulated` do daemon são rejeitados pelo frontend. A impressão transmite o texto solicitado, limitado a 64 KiB, sem permitir comandos de controlo inseridos no texto. Sucesso de envio TCP não comprova impressão em papel nem abertura mecânica; é necessário validar protocolo e resposta do modelo concreto antes de uso operacional. O pacote de relé existente não constitui certificação de compatibilidade com todos os fabricantes.

O daemon Python permanece um componente instalado e iniciado separadamente. No Tauri, a UI comunica por IPC com `hardware_bridge_request`: o Rust faz HTTP apenas para `127.0.0.1:8088`, com lista fechada de métodos/endpoints, sem proxy, redireccionamentos ou retries, e com limites de pedido/resposta. Assim, a ligação ao daemon não depende de pedidos HTTP directos do WebView HTTPS. No navegador, o HTTP directo continua limitado às origens locais de desenvolvimento/preview.

O daemon rejeita origens desconhecidas (incluindo `null`), Host diferente do endereço local, escrita sem Content-Type JSON, corpos inválidos ou acima de 256 KiB e pedidos de hardware a IPs públicos. Ferramentas locais sem Origin continuam autorizadas: estas protecções impedem chamadas de páginas de terceiros, mas não substituem autenticação de processos locais. A rota de impressão também valida campos dos recibos antigos para impedir inserção de comandos ESC/POS.

## Notificações do sistema

`DesktopNotifications` (no `AppShell`, só na app) subscreve em tempo real as mensagens directas recebidas pela conta e os comunicados da escola, e avisa pelo sistema **só com a app em segundo plano** (com a janela à frente, o próprio ecrã mostra). Uma mensagem nova mostra só o remetente, nunca o texto: o aviso pode aparecer no ecrã bloqueado ou com o ecrã projectado. Um comunicado avisa com o título, pela mesma regra da lista (o pessoal vê todos; alunos e encarregados só os enviados e não os do corpo docente), só acabado de publicar e uma vez. Rajadas juntam-se num aviso («3 mensagens novas»). O aviso de ligação também avisa «Alterações enviadas» quando acaba de enviar o que ficou à espera. Usa o plugin de notificações (`notification:default` já na capability do portal); regras em `src/lib/desktop-notifications.ts`.

## Sem rede

Fase 1 (desktop, PWA e web): sem rede, as gravações feitas com `useMutation` ficam em pausa e seguem quando a rede volta, mas só em memória. O aviso de ligação (`OfflineBanner`) diz quantas estão à espera, mostra «A enviar…» e confirma «Alterações enviadas.»; fechar ou recarregar com gravações por enviar pede confirmação. Gravações que chamam a função do servidor directamente continuam a falhar com erro.

Não existe ainda fila persistente, leitura sem rede nem resolução de conflitos: a análise do modo totalmente offline (interface embutida, base local cifrada, sincronização) está por decidir com o dono.

## Release

`release-desktop.yml` é o único workflow de instaladores. Executa apenas em tags `v*`, exige tag igual à versão Tauri/Cargo e cria release em draft. Não criar tags nem disparar runners pagos para validar uma PR. `native-ci.yml` mantém os checks Windows/macOS em main/manual, sem os duplicar nas PRs. Instalações Bun e compilações Cargo usam lockfiles sem fallback que os altere.

Actualizações assinadas: `scripts/desktop/release-config.mjs` gera `src-tauri/tauri.release.conf.json` e o build usa-o com `--config`. Só com a variável `TAURI_UPDATER_PUBKEY` e o segredo `TAURI_SIGNING_PRIVATE_KEY` o build assina os artefactos e liga o updater ao `latest.json` da release publicada (os rascunhos não chegam às escolas). Sem elas, a versão sai sem actualizações automáticas e abre na mesma. A app verifica 15 s depois de abrir e só instala quando a pessoa carrega em «Instalar e reiniciar», nunca com gravações por enviar. O portal não recebe permissões `updater:` nem `process:`; usa `check_app_update` e `install_app_update`. Guia do dono: [PUBLICAR_VERSOES.md](./PUBLICAR_VERSOES.md).

## Limites actuais

O ecrã local permanece disponível sem Internet, mas os módulos académicos dependem do servidor. A sessão do portal não está integrada com o cofre nativo.

Para uma release de produção faltam testes reais dos instaladores Windows/macOS, certificados de assinatura/notarização e validação dos periféricos físicos. A impressão no macOS (`print_page`, `print_html`) foi verificada só no Linux. Compilação Linux e testes automatizados não substituem essas verificações.
