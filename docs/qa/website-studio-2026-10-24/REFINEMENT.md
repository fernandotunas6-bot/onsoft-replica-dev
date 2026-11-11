# Website Studio — refinamento editorial

Continuação da PR #277, dependente das guardas de publicação da #275. Nenhum SQL,
DNS, deployment ou escrita numa escola real foi executado neste incremento.

## Funcionalidades completas neste incremento

| Capacidade | Implementação | Limite da prova |
| --- | --- | --- |
| Selecção na página | Clique ou Tab/Enter sobre elementos ligados ao manifesto; inspector mostra os campos desse elemento; opção para voltar à secção inteira | Chromium com fixture e testes do protocolo |
| Desfazer/refazer | 20 estados imutáveis em memória; digitação agrupada em 800 ms por página/secção/painel; guardar conserva histórico; restaurar publicação reinicia histórico | Testes do hook, Puck real e browser |
| Atalhos | Ctrl/Cmd+S guarda rascunho; Ctrl/Cmd+Z e Shift+Z fora dos inputs; conserva o undo nativo dos campos | Contrato cliente; nunca publica por atalho |
| Publicação em leitura | Alterna a prévia e o inspector para o snapshot publicado; não substitui o rascunho nem activa edições | Browser com fixture; nomes académicos continuam do catálogo actual |
| Revisão de publicação | Diálogo simples com escola, âmbito, revisão e diferenças de campos; validação local; confirmação explícita; foco regressa ao botão | O servidor continua a validar acesso/revisão/AAL2; não é prova de sessão real |
| Acessibilidade | Nome explícito no checkbox de adopção; foco no campo após selecção e regresso ao fechar revisão | Checker estático e browser; aparelhos físicos pendentes |
| Dependências | Overrides body-parser 2.4.0 e Undici 7.30.1 | Auditoria da raiz passou de três para um alerta alto; Zod continua bloqueante |

Não foi acrescentado outro formato de persistência. Histórico e selecção desaparecem
ao desmontar o contexto da escola; não se guardam conteúdos em localStorage.

## Fronteira da selecção visual

A prévia normal continua com `sandbox=""`. Só ao activar **Seleccionar elemento**
o iframe passa a `sandbox="allow-scripts"`; **nunca** recebe `allow-same-origin`,
formulários, popups, navegação superior ou permissões de download.

A composição executa primeiro a prévia sanitizada já existente, remove scripts,
frames, object/embed, base, meta http-equiv e atributos `on*`, `srcdoc`, `nonce` e
marcadores de selecção fornecidos pelo documento. Só depois adiciona marcações
obtidas dos comentários/atributos reais que correspondem a campos conhecidos.
Não interpreta texto do utilizador como código nem aceita nomes de componentes.

Uma CSP nova é colocada no início do head: `default-src 'none'`, `script-src` com
nonce aleatório exclusivo, `script-src-attr 'none'`, `connect-src 'none'`,
`frame-src 'none'`, `object-src 'none'`, `base-uri 'none'` e `form-action 'none'`.
Só estilos/imagens/fontes necessários ao modelo continuam permitidos. A única
script autorizada é o bridge estático gerado pelo SIGA; o nonce é inserido depois
da serialização para evitar a ocultação do atributo que ocorre em browsers reais.

A ponte só envia `{type, channel, keys}` para a origem exacta do pai. O pai exige:

1. A janela exacta do iframe actual como `event.source`.
2. `event.origin === "null"` (documento opaco).
3. Canal aleatório do documento actualmente apresentado.
4. Tipo de mensagem único e entre 1 e 20 chaves conhecidas da página actual.

Mensagens não guardam, publicam, navegam, trocam escola, enviam HTML ou alteram
valores. Apenas seleccionam campos existentes no inspector. Actualizar o documento
renova canal/nonce, rejeitando mensagens atrasadas. Não há listener sem cleanup.
Ao desactivar a selecção ou consultar a publicação, o iframe volta ao sandbox vazio.

## Evidência e bloqueios

O ensaio real verificou selecção, inacessibilidade de `parent.document`, bloqueio
por CSP de uma script injectada sem nonce, revisão de publicação, snapshot em
leitura, undo/redo, falhas preservando rascunho e seis larguras sem overflow.
Os scripts do template público continuam sem execução no editor.

O CI da versão anterior falhou por um checkbox sem identificação explícita e
pelas auditorias de dependências. A identificação foi corrigida e o checker
incremental passou. Não se desactivaram jobs, regras de acessibilidade ou auditoria.
O job do template desktop tem dependências Zod próprias; não confundir com o editor.

O [aviso oficial do Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) indica
correcção a partir de 4.6.6. A base desta PR ainda usa a API 3 em muitos schemas e integrações.
Forçar 4 globalmente sem migrar/testar esses contratos pode alterar validações
académicas, financeiras e de autenticação. O alerta permanece explícito nesta branch. Em 25/10, a consulta de `main`
(`48fb87cd`) já mostra Zod 4.6.7 e migração dos schemas. É necessário reconciliar
a base empilhada com esse trabalho e repetir CI; não se duplicou nem sobrescreveu
a migração de outro trabalho neste commit.

Continuam pendentes CI integral verde, ensaio Admin+AAL2 real, duas escolas num
ambiente de testes, visitante anónimo, Worker/domínio canário e aparelhos físicos.
O arrastar livre de estrutura e a criação livre de páginas continuam fora do
contrato actual; não se simula suporte a operações sem persistência aprovada.

## Fecho do commit — 25/10/2026

A branch continua empilhada em `fix/school-website-publication-20261024`; não foi
reescrito histórico publicado nem incorporadas silenciosamente as alterações
académicas/financeiras que chegaram entretanto a `main`. O commit entrega o
refinamento do editor e os seus ensaios. A compatibilidade final com a nova base
e o rollout continuam dependentes da reconciliação das PRs e dos ensaios reais.

Validação repetida no fecho: 43 ficheiros / 343 testes passaram; typecheck, ESLint
dos ficheiros afectados (sem erros/avisos), Prettier, checker incremental de estilo
e acessibilidade passaram. O resultado da suite completa iniciada antes da
interrupção de ambiente não foi conservado; não se afirma que todo o repositório
tenha passado com base neste subconjunto. Capturas/JSON do Chromium e medição
do build estão na mesma pasta.

O build de produção Node foi repetido e passou em 25/10. A pré-carga da raiz
conserva 39 recursos e 969875 bytes sem compressão; o chunk dedicado do editor
continua fora da pré-carga e do bundle SSR, conforme `performance.json`.
