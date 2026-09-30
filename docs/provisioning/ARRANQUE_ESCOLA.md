# Arranque de uma escola nova

Do registo no WEB (`/start`) à escola a operar no SIGA. O objectivo é que o director
chegue ao painel já com sessão aberta e veja, por ordem, o que falta e onde se faz.

## 1. Registo (WEB `/start` → `POST /api/saas/signup`)

1. **Verificação prévia** (`preflight` em `src/features/saas/provisioning-core.ts`), antes de
   gravar o que quer que seja:
   - subdomínio livre (`tenants.slug` e `tenant_domains.hostname`);
   - e-mail do administrador: com escola activa → recusa; conta sem escola (Google, tentativa
     falhada) → é ligada à escola nova.
2. Tenant, subscrição (trial de 14 dias), subdomínio, escola, conta do administrador (papel
   `owner`), papéis e permissões por omissão, sequências de documentos, definições académicas.
3. Ficha da escola já com NIF, contactos, localização, natureza e — se o responsável se
   identificou como «Director(a)» — o nome do director.
4. Formulário público de matrícula criado **fechado**: sem turmas, as famílias candidatavam-se
   a uma escola que não as podia receber.
5. Resposta com `adminLoginUrl` (uso único) quando a senha foi definida no registo: o WEB entra
   sozinho no painel ao fim de 8 s.

## 2. Primeiro ecrã: «Arranque da escola» (painel do Administrador)

`src/features/school/setup-guide.ts` (regras), `setup-guide-server.ts` (contagens na base),
`SchoolSetupGuide.tsx` (ecrã). Cada passo é decidido pelo que existe na base.

| Fase       | Passo                       | Feito quando                            | Depende de       | Onde                     |
| ---------- | --------------------------- | --------------------------------------- | ---------------- | ------------------------ |
| Base       | Dados da escola             | NIF, director(a), telefone ou e-mail    | —                | Definições → Escola      |
| Base       | Ano lectivo                 | ano `active`                            | —                | Calendário               |
| Base       | Três trimestres             | 3 trimestres com datas no ano activo    | ano              | Calendário               |
| Pedagógica | Cursos e classes            | ≥1 curso e ≥1 classe activos            | trimestres       | Pedagógica → Estrutura   |
| Pedagógica | Disciplinas                 | ≥1 disciplina activa                    | estrutura        | Pedagógica → Disciplinas |
| Pedagógica | Turmas                      | ≥1 turma no ano activo                  | ano, estrutura   | Pedagógica → Turmas      |
| Pedagógica | Modelo de avaliação         | regra `DEFAULT` activa                  | —                | Pedagógica → Modelos     |
| Financeiro | Propina e matrícula         | plano activo do ano com itens           | ano              | Definições → Financeiro  |
| Pessoas    | Equipa                      | outro membro activo ou convite pendente | —                | Acessos                  |
| Pessoas    | Alunos                      | ≥1 aluno                                | turmas, propinas | Alunos → Matricular      |
| Pessoas    | Matrícula online (opcional) | formulário aberto                       | turmas           | Definições → Matrícula   |

Porquê esta ordem: `class_groups` e `fee_plans` exigem ano lectivo; «Preparar estrutura
académica» só corre com os três trimestres; sem modelo não há pautas; a matrícula põe o aluno
numa turma e gera as facturas.

O cartão mostra também o plano e o fim do período experimental (liga a Assinatura e plano).
Quando tudo está feito fica uma linha «A escola está pronta a operar», que se pode ocultar.

## 3. O que o Administrador gere (só a sua escola)

- **Assinatura e plano** (`/configuracoes/assinatura`): uso face aos limites, pedido de mudança
  de plano, pagamento por transferência e envio do comprovativo.
- **Acessos** (`/acessos`): convites por papel, permissões por módulo, pedidos de acesso.
- **Definições**: escola, identidade digital, pedagógico, financeiro, matrícula, integrações.

A escola vem sempre da membership resolvida no servidor. As funções que recebem `tenantId`
(domínio, e-mail, branding) passam por `requireTenantAccess`, que só aceita o tenant da escola
da sessão ou um admin da plataforma com MFA.

## 4. Próximas fases (não feitas)

- Datas sugeridas do ano lectivo e dos trimestres a partir do calendário oficial do MED.
- Estrutura curricular por natureza da escola (primário, I/II ciclo, técnico-profissional).
- Pagamento do plano pelo PayFlow (referência Multicaixa) em vez de transferência manual.
- Aviso por e-mail antes do fim do período experimental.
- Exigir confirmação do e-mail no registo público (hoje a conta nasce confirmada).
