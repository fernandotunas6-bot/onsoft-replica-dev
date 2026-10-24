# SIGA Website Studio — contrato mestre de execução

Data: 24/10/2026. Repositório: `fernandotunas6-bot/onsoft-replica-dev`.
Base observada: `main` em `42ad7eff`; correcções de publicação na PR #275.

**Estado: primeiro incremento implementado com Puck 0.23.0 e validado localmente
com dados fictícios; ainda sem rollout de produção.** O nome «SIGA Website Studio»
identifica esta área, não altera a marca global. O contrato abaixo conserva o pedido
do proprietário; a [evidência de execução](../qa/website-studio-2026-10-24/README.md)
distingue o que foi implementado das capacidades ainda pendentes.

## 1. Pedido e resultado pretendido

O editor deve ter uma página própria dentro do SIGA Plus, com visual premium,
navegação e estilo dedicados. O utilizador deve perceber que entrou num ambiente
de criação do website, separado da operação académica. Deve poder seleccionar
páginas, editar os seus conteúdos e estilos suportados, verificar a apresentação
nos dispositivos, guardar e publicar com clareza.

A separação é de experiência e layout. Continuam a existir uma identidade,
autenticação, escola activa, backend e política de autorização institucionais.
Não criar outro produto, base de dados, conjunto de contas ou CMS paralelo.

O visual novo pertence ao **editor**. O website público aprovado conserva o seu
modelo e funcionamento; alterações editoriais só chegam ao público quando a
escola as publica pelo fluxo autorizado.

## 2. Referências observadas

Referências oficiais consultadas em 24/10/2026; inspiram padrões, não autorizam
copiar código, marcas ou interfaces integralmente.

| Referência | Padrão a aproveitar | Fonte |
| --- | --- | --- |
| Framer | Edição contextual a partir da página renderizada | [On-Page Editing](https://www.framer.com/academy/lessons/on-page-editing) |
| Framer | Verificação da página e do breakpoint em pré-visualização | [Previewing your site](https://www.framer.com/help/articles/how-to-preview-your-site/) |
| Webflow | Canvas central e navegação por elementos | [Canvas overview](https://help.webflow.com/hc/en-us/articles/33961319255059-Webflow-canvas-overview) |
| Webflow | Selecção de dispositivos e compreensão dos breakpoints | [Breakpoints overview](https://help.webflow.com/hc/en-us/articles/33961300305811-Breakpoints-overview) |
| Wix Studio | Inspector de propriedades do elemento, secção ou página | [Inspector panel](https://support.wix.com/en/article/studio-editor-using-the-inspector-panel) |
| Wix Studio | Organização responsiva por página e secção | [Managing breakpoints](https://support.wix.com/en/article/studio-editor-managing-breakpoints) |

Decisão para o SIGA: lista de páginas à esquerda, pré-visualização no centro e
inspector contextual à direita, com barra superior compacta. Esta composição é
uma proposta específica para o SIGA, não uma alegação de paridade com os produtos.

## 3. Prompt mestre para implementação

Actua como arquitecto sénior de produto, engenheiro frontend e especialista em
editores visuais de websites. Trabalha directamente sobre o SIGA Plus existente.

### A. Auditar e reutilizar

Antes de editar, ler `AGENTS.md`, os contratos visuais, a arquitectura de websites
e o estado real da PR #275. Confirmar branch, HEAD, alterações pendentes e trabalhos
já integrados. Não sobrescrever contribuições existentes.

Reutilizar `src/features/school-website`, manifesto de campos e páginas,
pré-visualização, gestor de ficheiros e funções de gravação actuais. Preservar
`school_settings`, controlo de revisão, snapshots draft/publicado e sonda de RLS.
Não importar o motor `school-site` nem o schema append-only da PR #200.

### B. Criar uma página dedicada

Usar `/website/editor` como rota proposta, confirmando antes colisões e a geração
de rotas. O acesso «Website escolar» nas Definições deve abrir o estúdio. Conservar
compatibilidade com `/configuracoes?painel=website`, os atalhos e o retorno contextual.

Usar layout próprio sem a sidebar académica, cartões financeiros ou conteúdo de
outros módulos. Identificar o estúdio, mostrar a escola e disponibilizar «Voltar ao
SIGA». A alteração de layout não pode retirar AuthGate, MFA, guardas de módulo ou
verificação da escola. Não declarar a rota do editor como pública para esconder o
chrome do sistema.

Guardar em URL apenas estado de navegação validado: página, dispositivo e zoom
suportados. Rascunhos, tokens, permissões e identificadores privados não entram na
URL. A selecção visual de escola nunca concede autorização no servidor.

### C. Organizar o espaço de trabalho

**Painel esquerdo:** páginas reais, pesquisa, agrupamento por secções e estado de
adopção/publicação quando o contrato fornecer esse estado. Seleccionar uma página
abre exactamente essa página, mantendo os seus campos associados. Não confundir
paginação de campos do editor actual com páginas reais do website.

**Centro:** pré-visualização da página, com o rascunho e template reais. O conteúdo
do preview nunca é obtido por uma API pública de rascunhos. Mostrar selecção de
campos apenas quando existir correspondência segura com o manifesto.

**Inspector direito:** propriedades do elemento, secção ou página seleccionados.
Separar Conteúdo e Aparência quando houver opções persistidas para ambos. Não
mostrar os formulários de todas as páginas em simultâneo. Não inventar controlos
para acções sem suporte no contrato.

Os painéis podem recolher para ampliar o canvas. A navegação, o foco e os campos
não devem desaparecer sem alternativa acessível.

### D. Barra superior e estados verdadeiros

Mostrar estúdio, escola, página, estado editorial, dispositivos, pré-visualização,
Guardar rascunho e Publicar. Evitar repetir títulos e acções nas três zonas.

Dar prioridade a Publicar; distinguir Alterações por guardar, A guardar, Rascunho
guardado, Publicado, Conflito e Erro ao guardar. Confirmar sucesso só após resposta
válida do servidor. Enquanto houver operação pendente, impedir envio duplicado.
A publicação deve deixar claro o âmbito e a escola afectados, sem texto burocrático.

### E. Dispositivos, largura, zoom e resolução

Disponibilizar Computador, Tablet e Telemóvel, largura suportada e zoom independente.
Verificar 320, 390, 768, 1024, 1440 e 1920 px. A largura corresponde ao viewport do
website dentro do preview, não à largura física do monitor nem ao tamanho do painel.

Mudar dispositivo ou zoom não grava estilos, não muda o breakpoint persistido e
não reduz a resolução de imagens. Manter texto e ícones nítidos. Só apresentar
edição específica por breakpoint quando o contrato puder guardar e renderizar
essas diferenças. Nunca simular essa capacidade com CSS apenas no editor.

No telemóvel, alternar entre Páginas, Pré-visualização e Propriedades; manter as
acções essenciais acessíveis, respeitar teclado e áreas seguras. Não comprimir
três painéis num ecrã estreito.

### F. Visual premium e coerência

Aplicar o contrato visual SIGA: Inter, pesos 400/500/600, ícones monocromáticos do
catálogo, superfícies claras, fundo de trabalho cinzento suave, bordas finas,
sombras mínimas e uma cor de destaque institucional. Espaçamento consistente,
hierarquia legível, canvas com prioridade e estados discretos.

O estúdio ganha composição própria; não troca a identidade global nem o visual
das páginas escolares. Não adicionar vídeo de abertura. Preferir painéis a modais;
reservar diálogos simples para confirmações necessárias.

Garantir teclado, foco visível, rótulos, contraste, movimento reduzido, zoom a 200%
e alvos de toque de 44 px. Estabelecer larguras dos painéis durante o protótipo,
validando conteúdos longos em vez de impor valores que cortem formulários.

### G. Segurança, conteúdo e continuidade

Exigir Administrador da própria escola e permissões de Gestão; alterações exigem
AAL2. Confirmar se as correcções da PR #275 já estão integradas antes de as assumir
presentes na base. Preservar conteúdo exclusivo do servidor e a sonda da base.

Guardar rascunho não publica. Editar não muda a publicação actual. Conflitos não
sobrescrevem outra sessão. Retirar publicação não apaga rascunhos nem transforma
um template ainda hospedado numa promessa falsa de desligamento do domínio.

Proteger alterações pendentes ao sair. Mudar página pode conservar o rascunho
comum em memória; se a operação o descartar, confirmar antes. Mudar conta/escola
limpa a selecção, cache e rascunho anteriores, cancela pedidos e rejeita respostas
atrasadas. Não transportar conteúdo de A para B.

Reutilizar o gestor de ficheiros e validar origem/âmbito de cada recurso. Recusar
HTML, JavaScript e CSS arbitrários, documentos privados e URLs assinadas como
recursos públicos. O controlo sintáctico de URL não substitui consentimento,
verificação de conteúdo, DNS ou redireccionamentos.

O preview actual é isolado e não interactivo. Não acrescentar `allow-scripts` ou
`allow-same-origin` por conveniência. Para selecção visual, avaliar primeiro uma
camada de selecção no editor ou um protocolo mínimo. Se houver mensagens entre
frames, validar `event.source`, origem aplicável ao sandbox e IDs do manifesto;
um iframe de origem opaca não pode ser autenticado apenas com a string `null`.
Mensagens nunca executam publicação nem concedem acesso a dados.

### H. Entregar incrementos completos

Implementar por fases: inventário, rota/layout, páginas/preview, inspector,
continuidade editorial e validação. Reutilizar código antes de criar componentes.
Carregar o estúdio e o manifesto pesado de forma adequada à rota, preservando o
arranque do portal académico.

Não criar botões fictícios de arrastar, adicionar páginas, histórico ou desfazer.
Se exigirem outro contrato, documentar a dependência e manter a funcionalidade
fora da primeira entrega. Autosave não é requisito inicial: se for proposto,
precisa de controlo de revisão, conflitos, falhas e identificação inequívoca de que
apenas grava rascunhos. Uma pré-visualização em página inteira continua privada.

Medir antes/depois: feedback ao toque, carregamento da rota, scroll e renderizações.
As metas do contrato global (INP p75 ≤200 ms, LCP p75 ≤2,5 s e CLS ≤0,1) exigem
medição adequada; amostras locais não equivalem a percentis reais.

Entregar testes, capturas, estado da implementação e limitações. Não declarar
pixel-perfect, sessão real, isolamento remoto ou Worker validado com base em mocks.

## 4. Inventário técnico e responsabilidades

| Capacidade | Evidência no repositório | Estado para o estúdio |
| --- | --- | --- |
| Editor de conteúdo | `WebsiteSettingsPanel.tsx` | Existente; ainda dentro das Definições |
| Editor de blog | `BlogSettingsPanel.tsx` | Existente; preservar acesso e rascunhos |
| Gravação/publicação | `content-server.ts`, `content-model.ts` | Existentes; reutilizar sem segundo escritor |
| Tema e opções por página | `WebsiteThemePanel.tsx`, `page-appearance.ts` | Existentes; expor só capacidades persistidas |
| Catálogo de campos | `template.json` | Existente; não inventar chaves |
| Catálogo de páginas | `site-pages.generated.json`, `editableWebsitePages` | Existente; filtrar páginas realmente suportadas |
| Pré-visualização privada | `website-preview.ts` | Existente, isolada e não interactiva |
| Aviso de saída | `use-draft-unload-warning.ts` | Existente; estender para navegação do estúdio |
| Admin exacto/AAL2/URLs/domínios | PR #275 e `RECONCILIATION_200.md` | Correcções no ramo; não declarar integração em main |
| Rota e layout dedicados | `/website/editor` | Implementado; rota privada e carregamento só no cliente |
| Lista de páginas + canvas + inspector | Primeiro incremento Puck | Implementado e ensaiado localmente |
| Selecção visual ligada aos campos | Exige mapeamento e modelo de isolamento | Por implementar; não habilitar scripts indiscriminadamente |
| Dispositivos, largura e zoom do canvas | Primeiro incremento Puck | Implementado e ensaiado localmente |
| Criação livre de páginas/drag-and-drop | Sem contrato auditado neste incremento | Fora da primeira entrega |
| MFA real, duas escolas e canário | Roteiro em `RECONCILIATION_200.md` | Pendente de ambiente de testes |

Caminhos relativos ao módulo `src/features/school-website`, salvo indicação diferente.

## 5. Fases e critérios de saída

| Fase | Entrega | Prova mínima |
| --- | --- | --- |
| 0 | Recapturar base, contratos, permissões e estado das PRs | Inventário actualizado e ausência de trabalho sobrescrito |
| 1 | Rota protegida e layout dedicado, atalhos antigos compatíveis | Entrada directa, reload, voltar, perfil recusado e zero chrome académico |
| 2 | Navegação por páginas e preview responsivo privado | Página exacta, estado recuperável e seis larguras sem overflow |
| 3 | Inspector contextual de conteúdo e aparência suportada | Selecção determinística, campos válidos e nenhuma opção sem persistência |
| 4 | Fluxo editorial integrado e protecção de rascunhos | Guardar/publicar/retirar/restaurar, conflito, falha e mudança de escola |
| 5 | Acessibilidade, desempenho e validação visual | Capturas, teclado, zoom, movimento reduzido e medições comparáveis |
| 6 | Ensaio real e decisão de integração/rollout | CI verde, Admin+AAL2, A/B, catálogo efectivo e domínio canário |

## 6. Matriz de aceitação funcional

| Cenário | Resultado esperado |
| --- | --- |
| Entrar por Definições ou URL directa | Mesmo estúdio protegido e mesma escola autorizada |
| Seleccionar Cursos | Preview e inspector correspondem à página real de Cursos |
| Seleccionar outro elemento | Só aparecem propriedades do âmbito seleccionado |
| Recarregar uma rota com página inválida | Estado seguro e opção válida; nenhuma chave arbitrária aplicada |
| Mudar dispositivo ou zoom | Só muda a visualização; rascunho e publicação conservados |
| Guardar com rede lenta ou falha | Feedback imediato; sucesso só com confirmação; dados locais conservados |
| Guardar um rascunho | Visitante continua a receber a publicação anterior |
| Publicar | Snapshot autorizado da escola, sem rascunhos ou dados privados |
| Editar uma revisão antiga | Conflito visível; sem sobrescrita nem perda silenciosa |
| Sair com alterações | Conservar ou confirmar descarte antes de abandonar |
| Trocar escola/conta durante pedido | Nenhum dado ou resposta atrasada de A aparece em B |
| Utilizador sem cargo ou AAL2 exigido | Operação recusada no servidor, mesmo por chamada directa |
| Página privada/portal no preview | Não executar operações privadas nem carregar dados de alunos |
| Imagem privada ou assinatura temporária | Recurso recusado; não o tornar público automaticamente |
| Teclado/200%/Android estreito | Foco e campos acessíveis, sem botões tapados pelo teclado |
| Retirar publicação | Estado verdadeiro da API, sem prometer desligar DNS/hospedagem |

## 7. Documentos relacionados e limites desta entrega

- [Índice dos websites escolares](README.md)
- [Arquitectura editorial actual](../architecture/SCHOOL_WEBSITE_CONTENT.md)
- [Reconciliação da PR #200 e validação de segurança](RECONCILIATION_200.md)
- [Contrato visual global](../design/VISUAL_MASTER_2026.md)
- [Orientações complementares](../design/SIGA_VISUAL_MASTER_2026-10-23.md)

A implementação reutiliza o contrato editorial actual: não grava JSON do Puck em
`school_settings`. O inspector edita campos autorizados por página/secção; não há
selecção livre do DOM por clique nem alteração livre de estrutura por drag-and-drop.
Essas capacidades continuam dependentes do modelo de isolamento e do contrato do
template. As opções completas anteriores continuam acessíveis pelo estúdio.

Não foram alterados DNS, migrações ou publicações de escolas reais. CI remoto,
Worker Cloudflare, sessões reais, aparelhos físicos e domínio canário continuam
pendentes; consultar a evidência antes de qualquer promoção.
