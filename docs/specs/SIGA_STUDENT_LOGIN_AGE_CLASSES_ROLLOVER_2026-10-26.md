# SIGA Plus — PR de estudantes: acesso, organização etária e renovação anual

**Estado:** proposta técnica + motor de simulação testável. **Não aplicada na base de dados nem em produção.**
**Base:** `main` observado em 26/10/2026. **Objectivo:** melhorar o que já existe; nenhuma reescrita.
**Regra de interface:** uma página = uma função principal; sidebar e cabeçalho contextuais; operações extensas em página própria; apenas confirmações simples em modais.

## 0. Decisão final e o que a PR seguinte entrega (26/10/2026)

### Diagnóstico medido na produção (só leitura)

| Escola SIGA-AO-000001 | Valor |
|---|---|
| Alunos activos | 72 |
| Com conta de acesso (`people.user_id`) | **0** |
| «Entrar com o nº de aluno» | **desligado** |
| Sem BI registado | 70 |
| Com número de aluno e data de nascimento | 72 |
| Slug do tenant | `minha-escola` (tratado como portal geral) |

O login não falhava por causa do resolvedor: **nenhum aluno tinha conta**. Corrigir o BI (§ desta PR) não
chega sem contas; o caminho real é o número de aluno, que todos têm.

### A lógica «no fim do ano todos voltam a Pessoas»

Certa na intenção, ajustada na forma: **Pessoas é o cadastro permanente e nunca se esvazia**. O que
termina no fim do ano é a matrícula. Na base, uma matrícula tem sempre turma (`enrollments.class_group_id`
é obrigatório), por isso o aluno não fica «solto»: a renovação coloca-o numa turma da classe seguinte e a
organização por idade redistribui dentro da classe antes de começarem as aulas.

```
Pessoas (permanente: ficha, BI, nº de aluno, conta)
  └─ Fecho do ano: notas homologadas, resultado no histórico (nada se apaga)
      └─ Renovar matrículas (por turma, #330): aprovados → classe seguinte; retidos → mesma
          └─ Organizar turmas (por classe e turno): A = mais novos … até à lotação
              └─ Imprimir listas (com o ID do aluno) e fichas de acesso → começar o ano
```

### Regras da organização por idade (implementadas)

- Por **ano + classe + turno** (a classe já identifica o curso). A letra vem do código (`7A-M`, `CFB10A-T`,
  `DEMO1C`); letras repetidas ou ilegíveis impedem aplicar.
- Mais novo primeiro (data de nascimento mais recente), desempate pelo nº de aluno.
- **Quem já tem notas, presenças, entregas ou boletins fica** onde está e o lugar conta como ocupado:
  mudar de turma misturava pautas (havia 286 notas lançadas). Organiza-se antes das aulas.
- Sem data de nascimento válida: fica, e a ficha é assinalada.
- Lotação: assinala acima de 36 e acima de 45 (DP 162/23, art. 10.º; 26 com alunos
  com deficiência).
- Aplicar recalcula no servidor, confere a **assinatura** do plano pré-visualizado, exige 2FA e muda cada
  aluno pela regra única `placeStudentInClass` (gatilho de lotação, histórico), numa ordem que nunca passa
  a lotação.

### Contas dos alunos (implementadas)

- Pessoas → **Acessos dos alunos**: criar as contas em falta de uma turma (lotes de 10), imprimir as fichas
  (endereço, nº de aluno, senha provisória), «Nova senha» para quem esqueceu.
- Conta Supabase Auth com endereço interno `<nº>.<código da escola>@alunos.portal-siga.com` (sem caixa de
  correio, nunca mostrado), perfil, membership com papel «Estudante», ficha ligada — tudo ou nada.
- Senha provisória legível (`KMPT-4827-ra`), mostrada uma vez, nunca guardada. `app_metadata.must_change_password`
  obriga a escolher senha no primeiro acesso (ecrã antes da aplicação; só o servidor desliga o sinal).
- Nova senha só para contas que são **apenas de aluno nesta escola**; criar e redefinir exigem 2FA.
- O Administrador liga «Entrar com o nº de aluno» no mesmo ecrã (servidor existente, com 2FA e auditoria).

### Pendente (fora desta PR)

- Mudar o slug `minha-escola` para o nome real da escola (o portal da escola passa a mostrar «Nº de aluno»).
- Contas dos encarregados com o mesmo modelo.
- Política «A = mais novos» como definição por escola (hoje é a única regra do ecrã).
- Teste com contas reais em ambiente de ensaio (login por nº, primeiro acesso, nova senha).

### Prompt melhorado (substitui o § 10)

> Antes de mudar, **medir na produção** (só leitura): quantos alunos têm conta, que identificadores têm,
> que regras a escola ligou. Reutilizar: `student-number-login`, `bi-login`, `placeStudentInClass`,
> `year-rollover`, `setStudentNumberLogin`, o motor `class-age-allocation`. Pessoas é permanente; a
> matrícula é anual e tem sempre turma. Criar contas de aluno em massa com senha provisória e troca
> obrigatória (`app_metadata`), sem e-mail real. Organizar por idade por ano + classe + turno, sem mexer
> em quem já tem notas/presenças, com pré-visualização assinada e 2FA ao aplicar. Uma página por função
> (Pessoas → Organizar turmas; Pessoas → Acessos dos alunos), modais só para confirmar. Listas e fichas
> com o nº de aluno. Testes: puro, servidor com base em memória, ecrãs; catraca ARQ-01 com razão escrita.

## 1. Pesquisa comparativa (fontes primárias)

| Sistema | Prática útil | Tradução para SIGA Plus |
|---|---|---|
| PowerSchool SIS | Processo de fim de ano valida próximo estabelecimento/nível; promoção, retenção, transferência e conclusão | Simulação de destino individual antes de encerrar o ano; histórico imutável |
| openSIS | Rollover com verificação prévia, histórico de matrículas, opção promoção/retenção; horários e secções refeitos por ano | Pessoa persistente + matrícula anual; não copiar horários nem turmas como factos |
| Gibbon | Pessoas, matrículas e Form Groups separados; colocação por grupo e por estudante no ano seguinte | Pessoas como cadastro-mestre; propostas de turma editáveis |
| Frappe Education | Student, Program Enrollment e Student Group distintos; grupos com ano, curso e lotação | Respeitar ano, classe, curso, turno e capacidade |
| Moodle | Autenticação, matrícula, coortes e grupos são conceitos separados | Não usar identificador de login como matrícula; contas sobrevivem à troca de ano |
| Supabase Auth | Login nativo com e-mail/telefone e senha; outras credenciais requerem resolvedor próprio | ID/BI resolvidos exclusivamente no servidor, depois senha via Auth |
| OWASP | Erros genéricos, limitação de tentativas por conta e IP, protecção de sessão | Não enumerar BI, matrícula, existência de conta ou e-mail |
| Angola (regulação) | Organização das turmas antes do ano e lotação conforme subsistema | Lotação regulamentar parametrizada, verificada antes da publicação |

Fontes:
- https://ps.powerschool-docs.com/pssis-admin/25.1/end-of-year-process
- https://help.opensis.com/portal/en/kb/articles/how-to-perform-rollover-to-a-new-academic-year-in-opensis
- https://help.opensis.com/portal/en/kb/articles/manage-student-enrollment-and-rolling-retention-information
- https://docs.gibbonedu.org/guides/modules/user-admin/rollover
- https://docs.frappe.io/education/student-group
- https://docs.frappe.io/education/program-enrollment
- https://supabase.com/docs/guides/auth/passwords
- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- https://lex.ao/docs/presidente-da-republica/2019/decreto-presidencial-n-o-276-19-de-06-de-setembro/
- https://lex.ao/docs/presidente-da-republica/2023/decreto-presidencial-n-o-162-23-de-01-de-agosto/

**Nota normativa:** a ordenação da turma A por alunos mais novos é uma preferência operacional solicitada, NÃO uma imposição legal identificada. A lotação angolana varia por subsistema, tipo de estabelecimento e condições dos alunos; **não fixar 35 como máximo nacional**. Validar regra aplicável à escola/ano com fontes oficiais e Direcção Pedagógica antes de activar.

## 2. Inventário confirmado em `main`

### Já existe — reutilizar

- `src/features/access/student-number-login.ts`: número `1 + ano + 4 dígitos`; activação por escola em `school_settings.student_access.student_number_login`; resolve escola por hostname e evita escolher entre múltiplas contas.
- `src/features/access/server.ts`: `signInWithIdentifierFn`; limites por IP e identificador; bifurcação número escolar vs. BI/telefone.
- `src/features/access/bi-login.ts`: resolução no servidor e troca de senha por sessão do Supabase Auth.
- `src/components/auth/AuthGate.tsx`: login e-mail, identificador+senha, captcha, sessão e MFA.
- `src/features/students/enrollment-core.ts`: matrícula protegida com 2FA, verificação de vagas e janelas anuais.
- `src/features/students/current-enrollment.ts`: distingue matrícula antecipada da matrícula corrente.
- `src/features/academic/year-rollover{,-server}.ts`: destino anual por resultado, tratamento de retenção, capacidade e 2FA.
- `src/routes/pedagogica_.turmas.$turmaId_.renovar.tsx`: página dedicada à renovação.
- `src/routes/alunos/index.tsx`: número de estudante já consta da lista principal e há exportações.
- `src/routes/pessoas/index.tsx`: cadastro-mestre de pessoas com vários papéis.
- `src/features/auth/portal-engine.ts`: navegação por papel e módulo disponível.

### Lacunas concretas a tratar

1. **BI:** `resolveBiOrEmailToUserEmail` usa `people.email`; este campo pode ser diferente do e-mail real de `auth.users`, mesmo com `people.user_id`. Reconciliar através da identidade Auth associada e nunca confiar exclusivamente no e-mail que a Secretaria digitou. Ensaiar contas multi-escola e divergências, sem expor endereço real no browser.
2. **ID:** validar criação e vinculação de contas de aluno para números existentes; um número escolar NÃO é globalmente único. Não criar conta duplicada ao rematricular, e não efectuar renumeração em produção sem reconciliação dos documentos.
3. **Turmas:** `suggestTargetGroup` favorece a mesma letra no ano seguinte. Isso não garante `A = mais novos`. Activada a nova política, esta heurística deixa de decidir a turma final; a distribuição etária acontece **depois** da progressão/seleção de classe.
4. **Listas:** número escolar aparece em `/alunos`, mas é necessário verificar e uniformizar ficha, turma, relatórios, PDF, CSV, importações, portal e mobile. **Não criar coluna duplicada com UUID em vez de `student_number`.**
5. **Pessoas:** o módulo guarda as pessoas, mas falta uma superfície própria de preparação anual com selecção de alunos elegíveis, simulação, excepções e confirmação.
6. **Fluxos de recuperação:** aluno sem e-mail próprio, encarregado, BI duplicado entre escolas, conta ainda não vinculada, conta inactiva e troca de escola exigem testes completos de login.
7. **Navegação:** reutilizar motor contextual existente; não criar segunda sidebar, separadores globais indevidos ou modais para fluxos longos.

## 3. Modelo de dados — não apagar nem duplicar

```text
people (cadastro permanente)
   └── students (vínculo do aluno com a escola + student_number estável)
         ├── enrollments (escola + ano + classe + turma + estado)
         ├── student_academic_history (resultados finais por ano)
         ├── documentos/boletins/pautas (referências históricas)
         └── people.user_id ↔ auth.users (identidade de login)
```

- O encerramento **não move fisicamente alunos para Pessoas**: eles já fazem parte de Pessoas. Encerra-se a matrícula anual e prepara-se a próxima sem apagar dados.
- Novos anos precisam de novas matrículas/vínculos a turmas; notas, presenças, horários, facturas, recibos, contratos e documentos do ano anterior continuam associados ao período original.
- `student_number` pertence ao aluno naquela escola; a troca de escola exige política de novo vínculo/número, não colisões globais.
- Restringir a uma matrícula actual por aluno/escola/ano conforme as regras do produto; permitir antecipada para ano seguinte se já existir mecanismo seguro.
- Guardar razão da decisão, actor, data/hora, escola e versões do plano aprovado (auditoria e repetição idempotente).

## 4. Organização de turmas por idade — política configurável

**Nome da política:** `youngest_first_A_to_Z`. **Default:** desligada até a escola optar por ela. Alternativa: distribuição manual/equilibrada.

**Âmbito obrigatório:** `school_id + academic_year_id + grade_level_id + program_id + shift` e, quando relevante, campus, turno, plano curricular e necessidades de apoio. Nunca misturar estes grupos numa mesma distribuição.

**Regra precisa:**
1. Decidir primeiro: aprovado → classe seguinte; retido → mesma classe; concluído/transferido/desistente → não matricular automaticamente. Resultado em falta → revisão.
2. Tomar a **data de nascimento validada** em data de referência fixada pela escola (início do ano); mais novo = nascimento mais recente.
3. Ordenar data de nascimento decrescente. Desempatar de modo estável pelo `student_number` e `student_id`.
4. Encher a turma **A** até a sua capacidade permitida; continuar **B**, **C** ... **Z**, **AA**. Não deduzir a letra do nome livre da turma.
5. Considerar matrículas existentes, vagas reais, turnos, sala, casos protegidos, inclusividade e decisão humana documentada.
6. Data de nascimento ausente, inválida ou futura → **não adivinhar**, deixar pendente de verificação. BI duplicado não serve como substituto de data de nascimento.
7. Alunos novos durante o ano: por omissão ocupar vaga sem reorganizar turmas já publicadas. Para garantir `A = mais novos` estritamente, requer simulação de reorganização integral e aprovação explícita.
8. **Nunca reatribuir automaticamente** aluno cuja turma tem avaliações, presença, horários ou documentos emitidos; elaborar plano de impacto e transferências com histórico.
9. Cada simulação deve indicar número escolar, nome, data validada, idade na referência, turma actual/proposta, lotação, excepções e motivos.
10. Organizar por idade não pode suprimir adaptações pedagógicas, necessidades de apoio nem lotação/regime legal. Excepções devem ser auditáveis, sem expor informação sensível a outros alunos.

### Motor introduzido nesta PR

`src/features/academic/class-age-allocation.ts` é um **planeador puro sem acesso à base**. Tem modos `vacancies` e `reorganize`, valida escopo, datas e lotações e não altera matrícula. `ageOrderComplete` significa que a pré-visualização não encontrou excepções; NÃO é uma autorização.

**Ainda não ligar o botão “Publicar” à função.** A próxima fase deve implementar a leitura autorizada no servidor e a escrita atómica/idempotente no banco, recomputando as vagas e os direitos do utilizador no momento do commit.

## 5. Páginas e navegação contextual

- **Pessoas → Preparar ano lectivo** (nova página, sem modal complexo). Contexto do ano e escola activa; lista de pessoas com papel Aluno, identidade estável, número escolar, estado e elegibilidade. A partir daqui escolher `Organizar turmas`.
- **Académico → Turmas → Organizar turmas** (nova página dedicada): classe/curso/turno, política de agrupamento, comparação antes/depois, capacidade, alunos sem nascimento, conflitos, `Simular` e `Publicar` após autorização.
- **Turma → Alunos**: número, nome, data de nascimento apenas para perfis autorizados, idade na data de referência, classe, ano e estado; pesquisar e exportar. Entradas contextuais apenas da turma.
- **Aluno → Identificação / Académico / Histórico / Documentos**: uma secção = uma função, conservar os caminhos do motor contextual e controlo por permissão.
- **Login → Escolher escola (quando ambíguo) → Identificador e senha → MFA quando aplicável → Meu portal**; mensagens curtas sem revelação de dados.
- **Renovar ano lectivo**: reutilizar a página já existente e acrescentar etapas: verificação de fecho, resultado final, nova classe, organização, revisão, confirmação.
- Um único botão principal por tarefa; sidebar esquerda alinhada ao design system SIGA Plus e menus contextuais coerentes em desktop/mobile. Preservar estados vazios, teclado, acessibilidade e desempenho.

## 6. Login por ID de aluno, BI e senha — critérios de aceitação

1. Identificadores aceites: e-mail validado; BI angolano normalizado; número de aluno quando activado para a escola; telefone apenas se política permitir. Password da **mesma conta Supabase Auth**, não uma senha guardada em `people`.
2. Fluxo por número de aluno: hostname institucional fiável resolve tenant/escola; se usar domínio geral e número se repetir, solicitar escola antes da autenticação, sem revelar que aluno existe.
3. Correspondência BI ↔ pessoa ↔ conta `auth.users` deve vir de ligação **verificada**. BI em fichas de várias escolas não escolhe e-mail arbitrariamente nem expõe a identidade de terceiros.
4. Sem `user_id`: criar/vincular conta num fluxo institucional seguro, com verificação da identidade e consentimento de responsável quando necessário. Não provisionar senha por adivinhação ou por simples conhecimento do BI.
5. Conta inactiva, senha errada, ID não encontrado, escola ambígua: respostas não enumeráveis; rate limit por IP **e** identificador/escola; captchas e observabilidade sem logs de senhas ou documentos completos.
6. Fluxo de recuperação assistida para menores sem e-mail próprio, verificando o encarregado autorizado; não permitir à Secretaria resetar senha de contas com outros vínculos sem verificação independente.
7. MFA para administrativos e acções sensíveis; suporte a alunos conforme idade, política e dispositivo. Restringir cookies/sessões por tenant e testar expiração, mudança de escola e elevação AAL2.
8. Testes matriciais: aluno novo/existente, aprovação de candidatura, troca de turma, rematrícula, retido, concluído, outro tenant com igual `student_number`, BI repetido, conta sem e-mail, senha recuperada, número legado, login mobile, rede lenta e indisponibilidade de Auth.

## 7. Fecho e abertura de ano — passos seguros

1. Validar três períodos/trimestres configurados para a escola quando aplicável, presenças, notas, reclamações e resultados finais.
2. Congelar notas e documentos fechados; guardar trilha de auditoria.
3. Gerar **simulação por aluno**: aprovado, retido, incompleto, transferência, desistência, concluído. Nunca inferir aprovação exclusivamente por turma ou data.
4. Criar ano de destino e estruturas por classe, curso, turno, salas e professores.
5. Renovar matrículas **no ano novo** só para alunos elegíveis, de forma idempotente; nenhuma movimentação física de `people`.
6. Simular turmas por idade sob política da escola; mostrar lotações legais e excepções; exigir revisão e confirmação.
7. Executar transacção autorizada, com bloqueios contra concorrência e vagas ultrapassadas; se falhar, não deixar metade dos alunos alterados.
8. Publicar listas/portais de acordo com o ano/estado da matrícula; conservar acesso ao histórico legítimo do aluno quando terminar o ano.
9. Guardar plano e relatório de sucessos/falhas, com recuperação ou reversão controlada antes da publicação.
10. Contas dos alunos não devem ser desactivadas só porque encerrou o ano; o portal muda de **contexto anual**, não de identidade.

## 8. Segurança, testes e gates

- Nenhuma consulta/alteração entre tenants, mesmo mudando `studentId`, `schoolId`, `classGroupId`, host ou URL.
- No servidor, `requireSgaWriterForWrite` e AAL2 para atribuição em lote; na base, RLS/RPC e validação de escola, ano, classe, turno e lotação com lock.
- Proibido confiar em `school_id`, lotações, id de destino ou permissões enviados pelo cliente; servidor recalcula e valida no momento da gravação.
- Testar duplicados, dados de nascimento inválidos, empates, `A` com lotação cheia, `Z/AA`, aluno com currículo especial, transferência, importações massivas e utilizadores simultâneos.
- QA Playwright autenticado para secretarias, alunos e encarregados, com duas escolas de IDs iguais; viewport mobile e desktop, leitor de ecrã, teclado, estados de erro, links directos e impossibilidade de acesso indevido.
- Rodar `npm run typecheck`, `npm run lint`, `npm run test`, segurança e CI completo; fazer verificação real em staging com cópia anonimizada.
- **Não fundir na main, não executar migrações em produção e não ligar publicação automática sem os gates.**
- Sem impacto em salário, propina, documentos antigos, QR, transporte ou websites; compatibilidade com SIDEBAR CONTEXT ENGINE (#332) e trabalho paralelo em curso.

## 9. Ordem de entregas dentro desta PR ou PRs dependentes

1. **Esta entrega:** inventário, regras, motor de simulação e testes unitários (sem acções reais).
2. **Login:** corrigir resolução BI, provisão/vínculos, tratamento de ambiguidade de escola, recuperação e bateria de testes reais.
3. **Listas:** `student_number` em todas as listas de turma e exportações sem duplicar o que já está em Alunos.
4. **Pessoas:** página “Preparar ano lectivo” e botão contextual “Organizar turmas”, com pré-visualização.
5. **Servidor e BD:** planear com consulta autorizada, publicar atomically/idempotently, auditar, testar condições de corrida.
6. **Encerramento anual:** acoplar ao rollover existente e suprimir sugestão da mesma letra somente quando a política por idade estiver activa.
7. **QA integral:** testes E2E e staging, revisão da Direcção Pedagógica, revisão de segurança, aprovação; só depois discutir merge/publicação.


## Actualização do que já ficou implementado na PR #339

- **BI/telefone:** `bi-login.ts` deixou de confiar em `people.email` e consulta o e-mail de `auth.users` somente por `people.user_id` não ambíguo; `bi-identity.ts` e testes correspondentes foram acrescentados. Atenção a contas legadas sem vínculo Auth: precisam de verificação/reconciliação em staging antes de disponibilizar a alteração.
- **Mensagens de login:** `AuthGate.tsx` passou a usar erro genérico de identificador/senha e orientação para entrar pelo portal institucional em números de aluno ambíguos.
- **Listas:** a renovação anual (`TurmaRenewalPanel`) já apresenta `student_number`, sem criar número duplicado; demais listas/relatórios continuam pendentes de auditoria.
- **Turmas por idade:** engine e testes criados **somente em modo simulação**. O botão em Pessoas, a nova página dedicada, a leitura autorizada do servidor e o gravador transaccional **ainda não existem** nesta PR.
- **Controlo de qualidade:** uma primeira execução CI revelou apenas formatação Prettier nos ficheiros alterados; foram feitos commits de correcção. A nova execução deve ser verificada antes da revisão/merge.

## 10. PROMPT MASTER para o agente responsável

> Trabalha **exclusivamente no SIGA Plus já existente**, na PR dedicada. Primeiro lê os módulos reais citados neste documento e o estado do `main` e das PRs abertas. Não reescrevas AuthGate, não dupliques tabelas de Pessoas/Alunos nem cries outra sidebar. Corrige o login de alunos por ID/BI com senha Supabase Auth e isolamento por escola; usa os dados existentes como fonte única. Implementa as páginas contextuais para preparar matrículas e simular turma A–Z por data de nascimento — os mais novos primeiro, dentro do mesmo ano/classe/curso/turno — com lotação e excepções legais. Preserva a pessoa e o ID ao mudar o ano, cria apenas matrícula anual nova e conserva o histórico imutável. Revê `suggestTargetGroup` quando a política etária estiver activada. Garante ID escolar em listas, turmas e exportações. Toda escrita exige validação no servidor e no banco, AAL2 quando requerido, auditoria, atomicidade e testes entre tenants. Uma página deve ter uma função principal, visual premium SIGA Plus, contexto/sidebar existentes, sem modais extensos. Apresenta provas de testes, falhas conhecidas, migrações pendentes e não fundas na `main` ou em produção sem gates.
