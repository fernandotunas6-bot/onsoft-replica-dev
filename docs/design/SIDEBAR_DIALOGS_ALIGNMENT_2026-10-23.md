# Contrato de navegação contextual e diálogos mínimos — 23/10/2026

## Origem e limites
Consolida **orientações recuperadas** do trabalho visual em paralelo, o [prompt master de performance](../../.cursor/skills/siga-performance/references/prompt-master.md), a [implementação visual](../visual/2026-10-23/spec-compliance/README.md) e a [PR #259](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/259). Não é uma transcrição literal do prompt nem comprova acesso à conversa do outro agente em tempo real.

## Sidebar — contrato a manter
- **Padrão:** barra compacta e contextual; organização operacional ao estilo Atlassian, com identidade própria do SIGA Plus
- **Forma desktop:** margem esquerda recta, sem folga; junção à superfície principal com cantos interiores/côncavos do lado direito, já implementada no `AppShell`
- Área activa identificada na rota inicial e no detalhe; pesquisa, escola, utilizador, papel e plano actualizam o contexto sem expor áreas não autorizadas
- Acesso a «Todas as áreas», teclado, foco visível, gaveta mobile e retorno ao módulo sem múltiplas árvores de permissões
- As preferências de apresentação mais ampla e dos diálogos por escola só devem ser usadas **se estiverem implementadas e verificadas**; não impor globalmente uma preferência nem criar controlos fictícios
- Não substituir `AppShell`, `AppSidebar`, `MoreHub` ou o catálogo autorizado; coordenar alterações da sidebar com a PR #259

## Diálogos — simples e objectivos
- Priorizar páginas existentes para formulários extensos e configurações com muitas categorias; conservar apenas os diálogos necessários para confirmação, selecção ou acção breve
- Reutilizar `Dialog`, `StackedModal` e o sistema actual; não empilhar modais por decoração
- Título claro, conteúdo exacto, acções Cancelar/Confirmar e foco acessível; tamanho adaptativo a mobile
- Ao fechar **ou mudar de categoria** com alterações por guardar, perguntar antes de descartar; cancelar mantém o formulário e a categoria actual
- Não remover conteúdos, campos, validações, permissões ou acções dos diálogos existentes sem migração funcional comprovada

## Integração e testes
A [PR #259](https://github.com/fernandotunas6-bot/onsoft-replica-dev/pull/259) continua responsável pelo destaque contextual e pela integração com o agente paralelo; esta entrega isola a protecção de rascunhos dos diálogos. Não editar a branch do outro agente sem coordenação, não reescrever histórico, nem publicar sem CI. QA autenticada e dispositivos físicos permanecem dependentes de staging isolado, como documentado na [issue #249](https://github.com/fernandotunas6-bot/onsoft-replica-dev/issues/249).
