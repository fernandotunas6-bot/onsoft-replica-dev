# Auditoria SIGA Plus — 10. Base de dados e integridade

**Data:** 2026-09-25 · **Âmbito:** apenas a área 10.
A quarentena das migrações de Agosto (`28cf941`) saiu desta auditoria e está em 10.4.

Todos os números abaixo foram perguntados **à base de produção**, não lidos do repositório.
Onde há uma contagem, a consulta que a produziu está descrita.

---

## 10.1 Chaves, unicidade, índices e restrições

**Chaves primárias: completas.** Das 162 tabelas de produção, **0 sem chave primária**.

**Achado (P2): 297 das 528 chaves estrangeiras não têm índice que as sustente.**

Confirmado por duas consultas independentes com lógicas diferentes, que deram o mesmo
número. Consequência: cada `DELETE` ou `UPDATE` numa linha-pai obriga a varrer a tabela
filha inteira para verificar a restrição, e a segurar bloqueios enquanto o faz. Com as
tabelas actuais — dezenas de linhas — é invisível. Deixa de o ser quando uma escola tiver
três anos de presenças diárias.

Não é desleixo: `20260924005903_core_fk_index_coverage.sql` cobriu as relações de maior
tráfego, deliberadamente e com esse nome. O que falta é o resto — e a diferença entre 231
cobertas e 528 diz que o trabalho ficou a meio, não que não foi pensado.

## 10.2 RLS e isolamento em todas as tabelas relevantes

**RLS activa em 162 de 162 tabelas.** `FORCE ROW LEVEL SECURITY` em 74.

**Achado (P2): "RLS em 100% das tabelas" sobrestima a protecção real.** Em **26 tabelas a
RLS está activa e não há política nenhuma** — o que nega tudo ao cliente e é seguro, mas
significa que nessas a RLS não é a fronteira: é o código do servidor.

As 26 dividem-se, e a divisão importa:

| | Nº | |
|---|---:|---|
| Fechadas de propósito, **sem GRANT** | 8 | `siga_access_cards`, `siga_turnstile_devices`, `school_integration_secrets`, as 5 de escalões salariais |
| Sem política **mas com GRANT de SELECT** | 18 | os 15 `alumni_*`, `notification_preferences`, `import_table_specs`, `slug_reservations` |

As 8 primeiras são decisão tomada — guardam credenciais ou salários, e o GRANT foi
retirado para que a intenção se lesse no esquema. As 18 segundas são ambíguas: o GRANT
promete um acesso que a política nega. Ninguém é prejudicado hoje, mas quem leia o esquema
conclui que o módulo *alumni* é acessível ao cliente, e não é.

O módulo *alumni* inteiro — 15 tabelas — funciona só por service_role. Pode ser intencional;
não está escrito em lado nenhum que o seja.

## 10.3 Transacções atómicas

**Achado (P1, estrutural): a aplicação não consegue abrir uma transacção.**

O `supabase-js` fala com o PostgREST, e o PostgREST executa **cada pedido na sua própria
transacção**. Não há API de transacção no cliente. Portanto qualquer operação da aplicação
que escreva em mais do que uma tabela é, por construção, não atómica: se a segunda escrita
falhar, a primeira fica.

Não é um defeito do código — é a consequência de onde a lógica foi posta. E a base **tem**
a resposta certa para isto, e usa-a onde mais importa: `private.register_payment` e
`private.reverse_receipt` fazem tudo dentro de uma função, com `FOR UPDATE` na linha que
interessa. **32 das 224 funções usam `FOR UPDATE`.** Há 130 funções `public` chamáveis por
`rpc()`.

O que falta é cobertura. `enrollStudentInClass`, por exemplo, faz 1 chamada RPC **e 2
escritas soltas** à volta dela: a parte atómica é a do meio. Uma falha entre as três deixa
a matrícula num estado que nenhuma das partes previu.

As operações que a verificação nomeia — matrículas, pagamentos, transferências, fechos —
estão, portanto, desigualmente protegidas: **pagamentos sim, o resto parcialmente.**

## 10.4 Migrações versionadas, ambientes e rollback

**Achado (P0, mitigado durante esta auditoria): o registo de migrações e o repositório são
quase disjuntos, e um `db push` era destrutivo.**

Medido contra a base:

| | |
|---|---:|
| versões em `supabase_migrations.schema_migrations` | 110 |
| ficheiros em `supabase/migrations/` (antes) | 145 |
| ficheiros **por registar** | 126 |
| versões registadas **sem ficheiro** no repo | 91 |

A sobreposição entre as duas listas era de **19 ficheiros**. O registo descreve uma
história que o repositório não contém, e o repositório contém 126 ficheiros que o registo
nunca viu.

E entre os 126 estavam **os 27 de Agosto — todos**. Esses descrevem o modelo de dados
antigo do Lovable, e `supabase/DO_NOT_APPLY_TO_SGA.txt` diz, desde sempre, que nunca devem
ser aplicados. Um `supabase db push` — comando corrente, que qualquer pessoa ou agente
corre de boa-fé — aplicá-los-ia e criaria um modelo paralelo vazio ao lado do que está em
uso. **O que o impedia era um ficheiro de texto que nenhuma ferramenta lê.**

Mitigado em `28cf941`: os 27 foram movidos para
`supabase/migrations-lovable-nao-aplicar/`, com README e com um teste que falha se algum
reaparecer. Mover não toca em dados e é reversível.

**O que fica por resolver, e é decisão do dono:** os outros **99** por registar continuam
em `migrations/`. São trabalho recente aplicado à mão por `supabase db query` — incluindo,
para ser explícito, **as migrações que eu próprio apliquei nesta auditoria**: nenhuma
passou pelo `supabase migration up`, logo nenhuma consta do registo. Fechar isso exige
registar como aplicadas as que já o estão, o que é reescrever o registo para corresponder
à realidade. Não é correcção técnica.

**Rollback: não existe.** Um único dos 122 ficheiros contém algo que se pareça com um
caminho de reversão. É coerente com o estilo (migrações aditivas e idempotentes), mas
significa que desfazer uma migração aplicada é trabalho manual sobre produção.

## 10.5 Backups, recuperação testada e retenção

**Não verificável a partir daqui, e digo-o em vez de o presumir.**

Os backups do Supabase são configuração do projecto na consola, não estão no esquema nem no
repositório. Não encontrei no repositório nenhum registo de política de retenção, nenhum
procedimento de recuperação escrito, e nenhum sinal de um restauro alguma vez ter sido
testado — mas a ausência no repositório não prova a ausência na consola.

**O que isto significa para a decisão de produção:** esta verificação não pode ser dada
como cumprida por esta auditoria. Exige que alguém com acesso à consola confirme três
coisas — que os backups existem, qual a retenção, e **que um restauro já foi feito a
sério** — e o registe. Um backup nunca restaurado é uma hipótese, não uma salvaguarda.

## 10.6 Corridas, inconsistências e eliminação acidental

**Corridas: tratadas onde o dinheiro está, e agora também no gateway.** `FOR UPDATE` em 32
funções; o caminho do gateway, que corria sem tranca, passou a ter um índice único de
idempotência (`20260924120000`), verificado contra a base.

**Achado (P2): apagar uma escola propaga-se a 81 tabelas, 6 níveis de profundidade.**

São **162 chaves estrangeiras com `ON DELETE CASCADE`** (contra 323 `NO ACTION` e 3
`RESTRICT`). Partindo de `schools`, a cascata alcança 81 tabelas distintas — metade da
base. É o comportamento pretendido para remover um inquilino, mas não há rede: `schools`
tem `status`, e **não tem `deleted_at`**; não há eliminação lógica.

E há um caminho de código que dispara isto sem intervenção humana:
`saas/provisioning-core.ts:148` faz `db.from("tenants").delete()` ao reverter um
aprovisionamento falhado. Numa reversão com o identificador errado, o efeito é o mesmo de
um `DELETE` manual.

**Eliminação pelo cliente: praticamente fechada.** Só **4 políticas `DELETE`** em toda a
base — mas 30 tabelas têm políticas `ALL`, que incluem apagar. Foi essa a porta fechada nas
áreas 5 a 9.

## 10.7 Auditoria de funções privilegiadas, triggers e procedimentos

**Implementado, e é o melhor resultado de toda a auditoria.**

- **79 funções `SECURITY DEFINER`**, e **zero sem `search_path` fixo**.

Vale explicar porque importa: uma função `SECURITY DEFINER` corre com os privilégios de
quem a criou. Sem `search_path` fixo, quem a chama pode criar um esquema próprio à frente
do `public` e fazer a função invocar as *suas* tabelas e funções com privilégios de dono.
É o vector clássico de escalada em Postgres, aparece em auditorias há anos, e aqui está
fechado em todas as 79 sem excepção.

- **149 triggers** em `public`, e `audit_row_change` cobre **42 tabelas**.

**Achado (P2, já assinalado na área 5): `student_academic_history` não é uma das 42.** A
tabela do histórico académico não tem um único trigger — nem de auditoria, nem de
imutabilidade.

---

## Classificação

| Sev. | Achado | Evidência |
|---|---|---|
| **P0** | `db push` aplicaria 126 migrações por registar, incluindo as 27 que nunca devem correr — **mitigado** | 110 vs 145; `28cf941` |
| **P1** | A aplicação não pode abrir transacções: operações multi-tabela não são atómicas por construção | PostgREST; `enrollStudentInClass` = RPC + 2 escritas soltas |
| **P1** | 99 migrações aplicadas à mão continuam fora do registo — decisão do dono | `schema_migrations` |
| **P2** | 297 de 528 chaves estrangeiras sem índice | duas consultas independentes |
| **P2** | 26 tabelas com RLS e sem política; em 18 o GRANT promete o que a política nega | `pg_policies` + `has_table_privilege` |
| **P2** | Apagar uma escola alcança 81 tabelas; sem eliminação lógica; `provisioning-core.ts:148` apaga | cascata recursiva, 6 níveis |
| **P2** | `student_academic_history` sem trigger nenhum | 42 tabelas auditadas, não esta |
| **—** | Backups e recuperação **não verificáveis** desta posição | ver 10.5 |

### O que está bem, e é muito

Chaves primárias completas. RLS activa em todas as tabelas. **79 funções privilegiadas,
nenhuma com o `search_path` por fixar** — o detalhe que quase sempre falha, e aqui não
falha em nenhuma. As duas funções que movem dinheiro fazem-no com bloqueio de linha e
validação de saldo dentro da própria transacção. 42 tabelas com auditoria de alterações.

A base é, de longe, a camada mais bem construída deste sistema. O padrão que esta auditoria
encontrou repetidamente — funções boas que a aplicação não chama — é a mesma observação
vista do outro lado.

### A ordem que proponho

1. **Backups (10.5).** É a única verificação que não pode ser fechada por leitura de
   código, e a única cuja falha não tem recuperação. Confirmar retenção e **testar um
   restauro**, e registá-lo.
2. **Decidir o registo de migrações.** Enquanto 99 ficheiros estiverem fora dele, `db push`
   continua a ser um comando que ninguém pode correr com confiança — e agora que os 27
   perigosos saíram, há a tentação de o julgar seguro. Não está.
3. **Índices das chaves estrangeiras**, por ordem de tráfego esperado. É trabalho mecânico
   e sem risco.
4. Eliminação lógica em `schools`, ou uma confirmação explícita no caminho de reversão do
   aprovisionamento.

Os pontos 2 e 3 não são urgentes hoje porque as tabelas são pequenas e ninguém corre
`db push`. Ambas as razões deixam de valer sozinhas.
