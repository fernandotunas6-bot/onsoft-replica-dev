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
| Pedagógica | Cursos e classes            | ≥1 curso e ≥1 classe activos            | ano              | Pedagógica → Estrutura   |
| Pedagógica | Disciplinas                 | ≥1 disciplina activa                    | estrutura        | Pedagógica → Disciplinas |
| Pedagógica | Turmas                      | ≥1 turma no ano activo                  | ano, estrutura   | Pedagógica → Turmas      |
| Pedagógica | Modelo de avaliação         | regra `DEFAULT` activa                  | —                | Pedagógica → Modelos     |
| Financeiro | Propina e matrícula         | plano activo do ano com itens           | ano              | Definições → Financeiro  |
| Pessoas    | Equipa                      | outro membro activo ou convite pendente | —                | Acessos                  |
| Pessoas    | Alunos                      | ≥1 aluno                                | turmas, propinas | Alunos → Matricular      |
| Pessoas    | Matrícula online (opcional) | formulário aberto                       | turmas           | Definições → Matrícula   |

Porquê esta ordem: `class_groups` e `fee_plans` exigem ano lectivo; o modelo de estrutura cria
as turmas no ano activo; sem modelo de avaliação não há pautas; a matrícula põe o aluno numa
turma e gera as facturas.

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

## 4. Sugestões do MED e modelos de estrutura

- **Calendário** (`src/features/academic/med-calendar.ts`): ano lectivo e trimestres sugeridos
  pelo calendário escolar nacional. 2025/2026 transcrito do Decreto Executivo n.º 686/25
  (2/9/2025 a 31/7/2026; I até 19/12; II de 5/1 a 27/3; III de 13/4 a 8/7). Os outros anos
  seguem a mesma regra (início no 1.º dia útil de Setembro, pausas de Natal e da Páscoa, fim a
  31/7), testada para reproduzir o decreto dia a dia. Quando sair o texto do decreto de um ano,
  acrescentá-lo a `DECRETOS`. Ensino superior (MESCTI, Decreto Executivo n.º 135/26: aulas a
  5/10/2026, semestres) não recebe trimestres do MED.
- **Modelo de estrutura** (Pedagógica → Estrutura académica → «Usar modelo de estrutura»,
  `curriculum-templates.ts`): Primário 1ª–6ª; I Ciclo 7ª–9ª; II Ciclo 10ª–12ª por área (CFB,
  CEJ, CH); Técnico-profissional 10ª–13ª (Informática, Contabilidade e Gestão, Electricidade e
  Electrónica, Construção Civil, Mecânica); Superior por anos (Direito, Economia, Gestão,
  Contabilidade e Auditoria, Eng. Informática, Enfermagem, Psicologia, Arquitectura). Cria
  níveis, cursos, classes, disciplinas dos planos curriculares, currículos por classe, turmas
  («10ª CFB A — Manhã») e salas (uma por turma do mesmo turno + laboratórios/oficina).
  Idempotente. A carga horária não é preenchida; no superior as unidades curriculares ficam
  para a instituição.

## 5. Registo público e acompanhamento

- **E-mail confirmado por código** antes de criar a escola: `/api/saas/signup/email-code` e
  `/email-verify` (serviço de OTP existente, propósito `signup_verification`). O código certo
  devolve um comprovativo assinado (2 h) que `/api/saas/signup` exige. Domínios reservados
  (`.test`, `.example`…) ficam isentos — testes E2E. Desligável só com
  `SIGNUP_EMAIL_VERIFICATION=off`.
- **Desistências** (`saas_signup_leads`, só servidor): cada visita ao assistente regista o passo
  atingido (sem dados pessoais); após a confirmação do e-mail guarda contacto. ADMIN →
  «Registos de escolas» mostra o funil e quem parou, com WhatsApp/e-mail. Lembretes
  automáticos 1, 3 e 7 dias após a última actividade, com ligação para deixar de receber.

## 6. Pagamento do plano e fim do período experimental

- Configurações → Assinatura e plano → Pagamento: «Gerar referência de pagamento» cria a
  cobrança no PayFlow (transferência com referência única e página para enviar comprovativo);
  sem PayFlow configurado mostra o IBAN da plataforma. «Já pagou? Envie o recibo» guarda o
  ficheiro no bucket privado `billing-proofs`. A referência Multicaixa (EMIS) só quando o
  adaptador do PayFlow estiver homologado.
- ADMIN → Subscrições → «Comprovativos de pagamento por confirmar»: ver o ficheiro (link de
  5 min) e «Confirmar pagamento» (activa o plano por um mês ou um ano).
- Tarefa diária `.github/workflows/saas-lifecycle.yml` → `POST /api/cron/saas-lifecycle`
  (`SIGA_CRON_SECRET`): avisos de fim do período experimental a 7, 3 e 1 dia(s) e lembretes de
  registo.

## 7. Por fazer

- Referência Multicaixa real (homologação EMIS no PayFlow).
- Carga horária por disciplina nos modelos (depende do plano curricular de cada escola).
- Calendário por semestres para o ensino superior (o SIGA trabalha por trimestres).
