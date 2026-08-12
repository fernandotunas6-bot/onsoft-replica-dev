# Relatório de Segurança — SIGA

Última verificação: 2026-08-10 (scan completo do backend + auditoria de dependências).

> Estado local: a migração `20260810115513_harden_profiles_connections_integrity.sql`
> contém endurecimentos adicionais ainda não aplicados. A validação em banco depende do
> ambiente local Supabase ou da autenticação da CLI no projecto ligado.

## 1. Resultado do scan completo

| Verificação                                     | Ferramenta                   | Resultado                                               |
| ----------------------------------------------- | ---------------------------- | ------------------------------------------------------- |
| Backend (RLS, exposição de dados, configuração) | scanner de segurança Lovable | **0 problemas**                                         |
| Dependências npm (alta/crítica)                 | `npm audit` / `bun audit`    | **0 vulnerabilidades altas ou críticas**                |
| Findings anteriores                             | —                            | `app_user_connections_no_policies` corrigido e validado |

## 2. Row Level Security — estado validado e endurecimento local

### `public.profiles`

- RLS: **activo**
- `SELECT` — role `authenticated`, `USING (auth.uid() = id)`
- `INSERT` — sem acesso de cliente; o perfil nasce exclusivamente pelo trigger de Auth
- `UPDATE` — role `authenticated`, `USING (auth.uid() = id)` e `WITH CHECK (auth.uid() = id)`
- Migração local pendente: o cliente poderá actualizar apenas `full_name`; criação de perfil e
  gestão de `cargo` ficam exclusivamente no servidor.
- Sem acesso para `anon`: um visitante não autenticado não lê nem escreve perfis.
- Cada perfil é criado pelo trigger `on_auth_user_created`, ligado ao `id` do utilizador em
  `auth.users`. Na migração local, a função privilegiada é movida para o schema não exposto
  `private`.
- Migração local pendente: o cargo padrão para novos perfis será `Utilizador`; cargos privilegiados exigem operação
  administrativa no servidor.
- A mesma migração restringe `cargo` aos perfis reconhecidos pela aplicação e lista
  explicitamente quaisquer valores legados incompatíveis antes de instalar a constraint.

### `public.app_user_connections` (credenciais de conectores por utilizador)

- RLS: **activo e forçado** (`FORCE ROW LEVEL SECURITY`) — nem o dono da tabela contorna as políticas.
- Política única `No client access to connection credentials`
  - comandos: `ALL`
  - roles: `anon`, `authenticated`
  - `USING (false)` e `WITH CHECK (false)` → **negação total no cliente**
- A tabela concede acesso apenas ao `service_role`. Ainda não existem funções de negócio no
  repositório que consumam esse acesso.

### Fundação escolar, anexos e auditoria (migração local pendente)

- `schools`, `attachments` e `audit_logs` têm RLS activo e forçado.
- Cada utilizador autenticado só resolve a escola e o cargo do próprio perfil.
- Apenas `Administrador` actualiza os campos permitidos da própria escola; estado, versão,
  autoria e eliminação lógica não têm privilégio de escrita no cliente.
- Alterações da escola são auditadas automaticamente por trigger interno; o evento guarda
  apenas campos alterados e versão, sem duplicar os valores institucionais.
- `school_billing_settings` mantém uma linha versionada por escola para vencimento, multa,
  tolerância e desconto; somente `Administrador` e `Tesouraria` consultam ou actualizam.
- O formulário financeiro consulta essa linha somente para os papéis autorizados, valida os
  mesmos limites do banco e usa `version` para detectar edições concorrentes.
- Apenas `Administrador` e `Secretaria` podem consultar, criar ou actualizar metadados de
  anexos da própria escola.
- Privilégios por coluna impedem mover anexos entre escolas ou alterar a autoria original.
- Apenas `Administrador` consulta auditoria da própria escola.
- Clientes não inserem, actualizam nem apagam eventos de auditoria; a escrita fica reservada ao
  `service_role`, para que o histórico não possa ser forjado pelo browser.
- O painel consulta os dez eventos reais mais recentes e usa o índice reutilizável
  `(school_id, created_at DESC)`; utilizadores sem papel administrativo não iniciam a consulta.

## 3. Protecção das credenciais de conectores

> Estado actual: o repositório contém o armazenamento protegido, mas não contém ainda o fluxo
> servidor de ligação/desligamento nem a implementação AES-256-GCM. Portanto, conectores não
> devem ser considerados funcionais até esse fluxo ser implementado e testado.

- A coluna `connection_key_ciphertext` é o destino reservado para material cifrado; texto
  secreto em claro nunca deve ser gravado nela.
- O `anon` e o `authenticated` não possuem privilégios na tabela.
- A implementação futura deve trocar códigos de uso único e cifrar/decifrar exclusivamente no
  servidor, usando uma chave mantida apenas no ambiente protegido.
- Migração local pendente: a ligação recebe chave estrangeira para `auth.users` com eliminação
  em cascata.
- Migração local pendente: `connector_id` e `connection_key_ciphertext` rejeitarão valores
  vazios; a combinação
  `(user_id, connector_id)` permanece única.
- Antes de instalar as constraints, a migração normaliza nomes de perfil antigos e interrompe
  com uma mensagem explícita se encontrar conexões órfãs ou dados de conector inválidos. Os
  identificadores de conectores não são corrigidos automaticamente, pois isso poderia criar
  colisões na chave única.

## 4. Invariantes de segurança (o que nunca deve acontecer)

1. Nenhum cliente do browser deve conseguir ler `app_user_connections`.
2. Nenhum utilizador deve ler ou alterar o perfil de outro utilizador.
3. Segredos do servidor (chaves de serviço, futuras chaves de cifra ou integração) nunca são
   registados, devolvidos numa resposta, nem usados em código do browser.
4. Qualquer tabela nova em `public` tem de nascer com `GRANT` explícito + RLS + políticas.
5. O cliente partilhado e o middleware autenticado aceitam apenas chaves `sb_publishable_`
   ou a chave legada `anon`; chaves `sb_secret_`/`service_role` são recusadas antes de criar
   o cliente Supabase.

> Estado de integração: Pessoas, Alunos, Documentos e emissão/leitura/pagamento do Financeiro usam funções servidor protegidas por
> `requireSupabaseAuth`, RLS e validação Zod. O `AuthGate` envolve o `Outlet` na raiz do router:
> nenhuma página, consulta ou pré-carregamento é montado antes de confirmar uma sessão
> Supabase. Login, saída global e alteração de senha já são reais.
> Depois da sessão, `RouteAccessGate` consulta o `cargo` protegido em `profiles` e impede que
> módulos fora da função do utilizador sejam montados. Esta barreira reduz exposição visual e
> pré-consultas; menus e pré-carregamento de chunks usam o mesmo mapa de acesso. Os conjuntos
> de dados locais permanecem nos chunks das respectivas rotas e não são importados pelo shell
> autenticado. A autorização definitiva continua nas políticas RLS.
> A matriz é `deny-by-default`: uma nova rota operacional precisa declarar funções permitidas
> antes de poder ser aberta, mesmo por administradores.
> Cabeçalho, menu, conta, dashboard e configurações resolvem a identidade pela sessão e pelo
> próprio registo em `profiles`; enquanto o perfil carrega, o fallback usa apenas o e-mail da
> mesma sessão, nunca dados estáticos pertencentes a outra conta.
> A edição do nome usa a política de propriedade e o privilégio de coluna `full_name`. O
> `updated_at` funciona como controlo optimista para impedir que duas sessões sobrescrevam o
> perfil silenciosamente; e-mail e cargo permanecem somente administrativos.
> A alteração de senha exige a credencial actual e aplica uma regra única de complexidade em
> todas as interfaces. O painel não apresenta 2FA como activo enquanto a inscrição MFA e os
> códigos de recuperação ainda não estiverem implementados.
> Sessões autenticadas são bloqueadas localmente após 30 minutos sem actividade humana. O
> relógio é partilhado entre abas, verificado ao regressar à aplicação e não é renovado pela
> actualização automática de tokens.
> Os restantes módulos ainda serão migrados gradualmente para funções protegidas; os fluxos
> financeiros integrados não apresentam gravações simuladas como se fossem operações reais.

## 5. Automação em CI

- **`bun audit --audit-level=high`** em cada push e pull request: o build falha se entrar um pacote com vulnerabilidade alta/crítica.
- **Scan semanal agendado** (segundas, 04:00 UTC): repete a auditoria de dependências, gera `reports/security/*` e publica como artefacto; falha se surgirem novos problemas.
- Relatórios anteriores ficam disponíveis nos artefactos de cada execução.

## 6. Testes de segurança da base de dados

A suite pgTAP `supabase/tests/profiles_connections_security_test.sql` contém 65 verificações
dos privilégios, RLS, constraints, funções e triggers deste modelo.

A suite `supabase/tests/people_module_security_test.sql` acrescenta 44 verificações para as
tabelas reutilizáveis de pessoas, alunos, catálogo académico, matrículas, índices e view de
consulta rápida. A suite `supabase/tests/domain_immutability_security_test.sql` acrescenta 4
verificações para a proteção de identidade, escola e autoria em 20 tabelas mutáveis. A suite
`supabase/tests/domain_relationship_indexes_test.sql` valida 9 índices completos usados por
RLS, integridade referencial e consultas relacionais. A suite
`supabase/tests/finance_core_security_test.sql` acrescenta 16 verificações para faturas,
pagamentos, caixa, permissões e auditoria. A suite
`supabase/tests/finance_invoice_issuance_security_test.sql` acrescenta 13 verificações para o
diretório financeiro mínimo, sincronização e emissão protegida. A suite
`supabase/tests/finance_reporting_security_test.sql`
acrescenta 15 verificações para agregações globais, mensais e por categoria, elevando o total para
166 invariantes automatizados.
`supabase/tests/finance_expense_workflow_security_test.sql` acrescenta 8 verificações para
despesas idempotentes, documentos únicos e auditoria, elevando o total para 174 invariantes.
`supabase/tests/finance_reversals_security_test.sql` acrescenta 12 verificações para anulações
append-only, motivos obrigatórios e recomposição protegida, elevando o total para 186 invariantes.
`supabase/tests/document_workflow_security_test.sql` acrescenta 20 verificações para modelos,
pedidos, histórico e isolamento documental, elevando o total para 206 invariantes.

```sh
supabase test db --local supabase/tests/profiles_connections_security_test.sql
supabase test db --local supabase/tests/people_module_security_test.sql
supabase test db --local supabase/tests/domain_immutability_security_test.sql
supabase test db --local supabase/tests/domain_relationship_indexes_test.sql
supabase test db --local supabase/tests/finance_core_security_test.sql
supabase test db --local supabase/tests/finance_invoice_issuance_security_test.sql
supabase test db --local supabase/tests/finance_reporting_security_test.sql
supabase test db --local supabase/tests/finance_expense_workflow_security_test.sql
supabase test db --local supabase/tests/finance_reversals_security_test.sql
supabase test db --local supabase/tests/document_workflow_security_test.sql
```

O comando requer os containers locais do Supabase em execução. Para testar o projecto ligado,
use `--linked` apenas depois de autenticar a CLI e aplicar a migração num ambiente de teste.
