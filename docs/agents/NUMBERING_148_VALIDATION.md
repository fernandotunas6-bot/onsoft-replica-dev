# PR #148 — validação da numeração antes de aplicar

Estado: implementação refinada; **migração por aplicar**. Não há aprovação de produção
neste documento. As contagens 85 alunos / 76 matrículas / 0 documentos são a medição
histórica da descrição da PR, não um inventário actual nem prova de ausência de cartões,
PDFs, QR ou códigos distribuídos fora da tabela `issued_documents`.

## Comportamento

- Aluno: ano de admissão; matrícula: ano de início do ano lectivo; documento escolar:
  ano de emissão em Africa/Luanda. Sequência de 0001 a 9999 por escola, ano e categoria;
  declarações e certificados partilham a categoria `document`.
- UUIDs não mudam. Facturas, recibos, notas de crédito e despesas conservam os geradores
  fiscais. O lote exclui também essas quatro categorias em `issued_documents` e na
  reconstrução do contador documental. Confirmar os tipos efectivos antes da aplicação.
- Datas ausentes/fora de 2000–2099, ano lectivo de outra escola, números já digitais com
  ano divergente ou sequência zero e lotes acima da capacidade interrompem a migração.
- O mapa `private.siga_numbering_changes` guarda escola, categoria, UUID, número antigo,
  novo e instante da mudança, na mesma transacção. Sem acesso PUBLIC/anon/authenticated;
  service_role só lê. Não publicar o mapa nem usá-lo como credencial.
- Locks sobre alunos, matrículas, documentos e anos lectivos estabilizam o plano.
  **Executar o ficheiro completo numa transacção única**, com rollback em qualquer erro;
  não executar instruções isoladas no SQL Editor.
- No login geral, 50 resultados obrigam a usar o endereço da escola: um conjunto
  saturado não prova unicidade. É uma recusa conservadora, mesmo que só uma das fichas
  visíveis tenha conta e opção ligada. O endereço da escola filtra antes do limite.

## Matriz de evidência

| Área                    | Estado                     | Evidência local                                                                                | Próxima validação                                                        |
| ----------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Números/contadores      | Validado localmente        | PGlite: duas escolas, anos, continuidade, limite                                               | PostgreSQL real com pedidos concorrentes                                 |
| Preflight e recuperação | Validado localmente        | Datas inválidas, ano divergente, zero, excesso; falha após UPDATE desfaz mapa/números/gatilhos | Cópia recente com esquema e triggers completos                           |
| Documentos existentes   | Validado localmente        | Lote misto antigo/digital, viragem de ano Luanda, contador e repetição                         | PDFs, hashes, QR e verificador; decisão sobre documentos já distribuídos |
| Mapa protegido          | Validado localmente        | Valores antigo/novo, repetição sem duplicação, anon recusado                                   | Privilégios efectivos authenticated/service_role e retenção              |
| Login por número        | Validado com base simulada | 12 testes, incluindo limite realista e escola após a posição 50                                | Host/proxy/domínio real, captcha, senha, MFA e sessão                    |
| PayFlow                 | Por validar                | Contrato envia UUID e código; PIN deriva do UUID                                               | Re-sync actualiza o mesmo aluno, preserva dívida e não duplica cobranças |
| Flutter/PWA             | Por validar                | Sem ensaio autenticado neste incremento                                                        | Login e acesso apenas à escola/recurso autorizado                        |

PGlite não representa concorrência real, RLS remota, todos os triggers, Auth ou emissão
real. O teste de login simula o PostgREST e não substitui o ensaio autenticado.

## Critérios de aplicação

1. Reconciliar a PR com main e passar CI no commit final. Tratar a falha de análise Flutter
   ou documentar a sua origem com evidência; não chamar ao conjunto "todos os checks verdes".
2. Repetir o inventário no destino autorizado; verificar datas, anos, capacidade e números
   digitais existentes. Não apagar dados E2E sem identificar os respectivos vínculos.
3. Confirmar funções, grants, constraints e triggers efectivos; comparar as funções
   substituídas com as da produção para não reverter melhorias posteriores.
4. Backup com restauração ensaiada e cópia recente: aplicar duas vezes, induzir falha e
   verificar UUIDs, vínculos, notas, presenças, dívidas, totais e histórico antes/depois.
5. Verificar referências por número fora das três tabelas: ficheiros, QR/cartões,
   importações, caches e integrações. Documentos já distribuídos exigem decisão de
   preservação/reemissão e reconciliação de conteúdo/assinaturas, não só UPDATE no número.
6. Ensaiar PayFlow com aluno já sincronizado e cobranças existentes, incluindo repetição
   do re-sync; demonstrar ausência de duplicação e definir transição do código antigo.
7. Login autorizado em duas escolas com o mesmo número; testar opção ligada/desligada,
   conta bloqueada, vínculo revogado, senha errada, captcha/MFA, refresh e regressões
   B.I./e-mail/Google, Flutter e PWA. Autenticar não concede autorização escolar.
8. Aprovação de produção, janela com escritas controladas, transacção única, conferência
   pós-aplicação e recaptura oficial do snapshot/tipos. Não editar os gerados à mão.

Rollback posterior ao commit exige plano próprio: novos números podem já ter sido usados
ou enviados ao PayFlow. O mapa permite reconciliar; não autoriza reposição automática.

## Verificações executadas neste incremento

- Node 24; dependências do projecto instaladas com `bun install --frozen-lockfile --ignore-scripts`.
- `npm test`: 3.458 aprovados, 19 ignorados (508 ficheiros aprovados e 3 ignorados).
- `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit`: 0 erros.
  A primeira tentativa com o heap padrão de 2 GB esgotou memória.
- `npm run lint`: 0 erros, 47 avisos existentes.
- `npm run build`: aprovado.
- `npm run siga:check`: aprovado.
- `SIGA_SQL_TEST_MODULE_PATH=<PGlite 0.5.10>/dist/index.js node tests/sql/numbering-one-year-digits.mjs`:
  aprovado, incluindo exclusão das quatro categorias fiscais no lote.
- Nenhum teste autenticado remoto, re-sync PayFlow ou SQL de produção foi executado.
