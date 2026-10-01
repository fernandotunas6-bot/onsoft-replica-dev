# SIGA Desktop — instalação e arranque

## Âmbito e apresentação

O launcher é o ponto de entrada local do SIGA escolar; os módulos académicos continuam no portal. O ecrã usa identidade azul/navy, superfícies claras, tipografia do sistema e tema escuro. Os cartões Calendário, Pessoas e Documentos são ilustrações, não métricas nem atalhos de módulos antes da autenticação. O estado inicial não afirma que existe Internet ou que os periféricos estão prontos.

## Acções e subfunções

| Controlo                      | Operação                                                                | Sucesso                                                            | Falha / guarda                                                                         |
| ----------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Abrir SIGA / Tentar novamente | Verificar transporte ao portal fixo e recolher diagnóstico nativo       | Navegar para `https://portal-siga.com`; o portal autentica a conta | Timeout 8 s; sem retry automático; nenhuma escrita académica                           |
| Verificar ligação             | Executar a mesma verificação sem navegar                                | Mostrar hora, transporte, versão/SO/arquitectura e daemon          | Falha do daemon não impede acesso ao portal; não acciona hardware                      |
| Cancelar verificação          | Abortar fetch e invalidar a operação em curso                           | Reabilitar controlos e manter o launcher                           | Resultados atrasados são ignorados; não cancelam uma nova verificação                  |
| Abrir no navegador            | Comando nativo com URL fixa; na pré-visualização, abrir uma aba isolada | Informar que o pedido foi enviado                                  | Não há fallback web após erro nativo; pop-up pode ser bloqueado                        |
| Copiar diagnóstico            | Copiar apenas versão, SO/arquitectura, estado, URL e hora               | Informar cópia concluída                                           | Sem clipboard, mostrar texto seleccionável; não incluir credenciais ou dados escolares |
| Tema claro/escuro             | Alterar apresentação local                                              | Aplicar imediatamente e guardar preferência de tema                | Sem localStorage, continua a funcionar sem persistir                                   |
| Guia de instalação            | Abrir diálogo local com passos Windows/macOS e requisitos               | Foco contido no diálogo; fechar por botão ou Escape                | Não descarrega executáveis nem pede senhas; não contorna segurança do SO               |

Só uma verificação/abertura pode estar activa. Os três botões de acesso ficam desactivados durante a operação, enquanto cancelamento permanece disponível para verificações. Estados visuais: `idle`, `busy`, `success` e `error`; mensagens também usam `aria-live`. O sucesso do fetch opaco prova apenas transporte, não saúde HTTP, sessão ou permissões escolares. Cancelamento/timeout não pode navegar por um resultado tardio.

## Contratos nativos e permissões

- `get_desktop_diagnostics`: versão real, SO, arquitectura e saúde do daemon. Só consulta `/health`, com timeout 2,5 s; confirma identidade e estado `online`. Não retorna caminhos locais, API keys nem configuração escolar.
- `open_school_portal`: abre apenas a URL fixa do portal no sistema; não aceita URL fornecida pela página.
- A capability local autoriza estas duas operações e a informação de sistema; não concede comandos de impressão, catraca, configuração do daemon, shell, ficheiros, stores ou updater.
- A API global Tauri está disponível para o JavaScript estático, mas continua sujeita às capabilities. As permissões remotas do portal não foram alargadas para o diagnóstico local.

## Instaladores

Windows publica um único formato de instalador, definido em `tauri.windows.conf.json`: usa o wizard NSIS padrão, com cabeçalho BMP RGB 150×57, lateral 164×314, idioma Português/English, pasta OnSoft no menu Iniciar e instalação para o utilizador actual. Downgrades ficam bloqueados. O bootstrapper WebView2 mostra o processo quando é necessário descarregar o runtime; esse passo exige Internet e pode ter requisitos do próprio Microsoft WebView2. Não se assume que o daemon Python acompanha o instalador.

macOS usa DMG com fundo 660×400 e posições definidas para o ícone da aplicação e a pasta Aplicações. O utilizador arrasta a aplicação; o guia não recomenda ignorar Gatekeeper. A arte é gerada por `scripts/generate-desktop-installer.py` e fica versionada: a release não exige Python/Pillow nem fontes adicionais.

## Validação e evidência

`npm run desktop:check` verifica versão do HTML/Tauri/Cargo, origem, CSP, permissões, dimensões dos BMP/PNG, modo de instalação e downgrade. Os testes do launcher cobrem falhas, cancelamento, resultados tardios, cliques repetidos, timeout, diagnóstico e ausência de clipboard.

`node scripts/desktop/preview-launcher.mjs` gera capturas reais no Chromium local com a CSP configurada: temas claro/escuro, guia e formato estreito. As capturas são pré-visualizações web do launcher, não capturas do instalador Windows nem de uma sessão Tauri autenticada:

- [Launcher claro](screenshots/launcher-light.png)
- [Launcher escuro](screenshots/launcher-dark.png)
- [Guia de instalação](screenshots/installation-guide.png)
- [Formato estreito](screenshots/launcher-mobile.png)

Assinatura/notarização, instaladores Windows/macOS, actualização de uma versão anterior e periféricos reais exigem validação nos sistemas de destino. O launcher permanece offline, mas não implementa fila/sincronização académica nem sessão no cofre. Não criar tags, publicar releases ou disparar runners pagos para esta validação.
