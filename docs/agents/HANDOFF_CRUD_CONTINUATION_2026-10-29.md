# Continuação do CRUD e acções em lote — 29/10/2026

Base: `main@009678618f3325ccea78c97f8e5be02776c5f3a8`.
Ramo: `fix/crud-shared-forms-20261029`.
Origem: revisão dos lotes 2–4 da PR #378, já integrada, e das acções da #392.
Trabalho recuperado de código, PRs e handoffs; sem acesso a sessões privadas.

Esta entrega é independente da #404 e não inclui a sua migração académica.
Não interpretar os estados históricos de `CRUD_PREMIUM_2026-10-28.md` como
homologação actual de todos os módulos.

## Matriz de correcções

| Área | Problema | Correcção | Estado e limite |
| --- | --- | --- | --- |
| QuickFormModal | Senhas eram aparadas com `trim()` | Preserva senha exacta; mantém normalização dos campos de cadastro | Implementado; teste de valores enviados |
| Labels/erros/sugestões | IDs de campo repetidos entre formulários | IDs por instância com `useId`, mantendo `name` e contrato do servidor | Teste com dois formulários abertos |
| Gravação | Campos permaneciam editáveis durante pedido pendente | Desactiva os controlos até confirmação/falha; conserva valores e permite retentar | Teste de falha e segundo envio |
| BI/NIF | O componente ignorava a indicação de obrigatório | Propaga `required` nativo sem mudar o padrão dos outros consumidores | Testes de obrigatório e opcional |
| Pessoas/vínculos | Permissão/rede com mensagem `person_roles` podia ser ignorada | Compatibilidade só para códigos conhecidos de esquema ausente; falhas reais propagadas | Testes com cliente fictício, não RLS remoto |
| Pesquisa institucional | Texto por papel institucional podia devolver zero após falha | Exige leitura dos vínculos também na pesquisa textual por esse papel | Testes de filtro e texto parcial |
| Acessos em lote | Êxitos parciais e interrupção de identidade limpavam selecção | Retém apenas falhas e contas não tentadas; só limpa no êxito integral | Testes de sucesso, erro parcial e step-up |
| Contexto do lote | Um pedido seguinte podia usar o contexto após troca de escola | Para pedidos subsequentes e callbacks ao mudar conta/escola/cargo ou desmontar | Não cancela nem reverte pedido já aceite; guardas do servidor preservadas |

## Verificação executada

- Suite global após as alterações de produção: 792 ficheiros aprovados / 3
  ignorados; 5.514 testes aprovados / 19 ignorados.
- Após acrescentar o cenário de desmontagem e reforçar a simulação de duplo
  envio: 13 testes dirigidos aprovados em dois ficheiros; não somar contagens.
- `npm run typecheck` e build cliente/SSR/Worker aprovados.
- ESLint do escopo, Prettier, `git diff --check` e verificadores estáticos de
  estilo/acessibilidade aprovados.
- O teste de sugestões de disciplinas passou a consultar o ID indicado pelo
  próprio campo, preservando a verificação das duas opções e do aviso enquanto
  se escreve; não fixa um ID global incompatível com formulários simultâneos.

Sem SQL, migrações, dados institucionais, envio de mensagens, merge ou deploy.
DOM e cliente em memória não comprovam browser/dispositivo físico, operações
reais, isolamento remoto ou concorrência PostgreSQL.

## Continuação por prioridade

1. Conferir CI da SHA final desta PR e QA autenticado de edição/repetição por
   perfil; formulários de sucesso, erro, teclado e redes lentas.
2. `updateTeacher` ainda actualiza pessoa e professor em operações separadas:
   a atomicidade/CAS depende de incremento transaccional próprio. Não anunciar
   que esta melhoria de formulário resolveu esse problema do lote 3.
3. A #404 tem CI e Academic Import Check aprovados no HEAD `ff93aaf8`, mas
   continua bloqueada pela homologação/instalação da migração de notas.
4. Preservar os ramos antigos até reconciliar contribuições exclusivas; não
   integrar automaticamente #128/#338/#345 ou outras PRs sobrepostas.
