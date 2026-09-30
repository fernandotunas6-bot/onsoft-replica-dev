# SIGA Desktop: execução e validação

O desktop pertence ao SIGA escolar. Windows é a prioridade; macOS usa o mesmo projecto. A aplicação TanStack Start requer servidor: `.output/public` não é uma aplicação autónoma. O instalador inclui `desktop/index.html`, um ecrã local que abre o portal HTTPS `https://portal-siga.com`. Não inclui ADMIN, WEB, DOC ou PAYFLOW.

## Desenvolvimento

- `npm run desktop:dev`: arranca Vite em localhost:3006 com permissões de desenvolvimento explícitas.
- `npm run desktop:check`: verifica launcher, origem de produção, CSP, versão e lockfile.
- `npm run desktop:build`: compila com Cargo `--locked`. Exige Rust e os pré-requisitos Tauri do sistema operativo.
- `cd src-tauri && cargo test --locked --lib`: testes Rust sem accionar hardware.
- `python3 -m unittest discover -s python/hardware_bridge`: testes do daemon local.

A configuração de desenvolvimento não é incluída no build de produção. A capability de produção aceita apenas a origem exacta do portal escolar. Não autoriza shell, acesso livre a ficheiros ou stores, Stronghold, updater ou controlo de processos. Links externos passam por validação de esquema e são abertos pelo sistema. Fechar a janela fecha a aplicação; a bandeja oferece Abrir e Sair enquanto o processo está activo.

## Hardware

O Rust envia TCP em tarefas de fundo, com limites de ligação e escrita, para IPs privados explícitos. Não resolve nomes nem aceita loopback como hardware real. O frontend não repete uma operação física pelo daemon após falha nativa: uma transmissão parcial pode já ter accionado o dispositivo. Quando existe `deviceId`, preserva a verificação de allowlist do daemon.

O modo navegador não simula sucesso. Resultados `simulated` do daemon são rejeitados pelo frontend. A impressão transmite o texto solicitado, limitado a 64 KiB, sem permitir comandos de controlo inseridos no texto. Sucesso de envio TCP não comprova impressão em papel nem abertura mecânica; é necessário validar protocolo e resposta do modelo concreto antes de uso operacional. O pacote de relé existente não constitui certificação de compatibilidade com todos os fabricantes.

O daemon Python permanece um componente instalado e iniciado separadamente. A integração HTTP local depende das políticas CORS/mixed-content do WebView; não é considerada validada no portal HTTPS apenas por passar nos testes unitários.

## Release

`release-desktop.yml` é o único workflow de instaladores. Executa apenas em tags `v*`, exige tag igual à versão Tauri/Cargo e cria release em draft. Não criar tags nem disparar runners pagos para validar uma PR. `native-ci.yml` mantém os checks Windows/macOS em main/manual, sem os duplicar nas PRs. Instalações Bun e compilações Cargo usam lockfiles sem fallback que os altere.

## Limites actuais

O ecrã local permanece disponível sem Internet, mas os módulos académicos dependem do servidor. Não existe ainda fila persistente de escritas, sincronização idempotente ou resolução de conflitos offline. A sessão do portal não está integrada com o cofre nativo. O updater permanece desactivado e sem permissões até existir endpoint, chave pública, artefactos assinados e guarda contra actualização com escritas pendentes.

Para uma release de produção faltam testes reais dos instaladores Windows/macOS, certificados de assinatura/notarização e validação dos periféricos físicos. Compilação Linux e testes automatizados não substituem essas verificações.
