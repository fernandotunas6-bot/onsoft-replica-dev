# Correcções críticas — contratos e aceitação

Estado a 08/10/2026: implementação em desenvolvimento; SQL preparado e ensaiado localmente; nada aplicado/publicado em produção. Segue o banco SGA actual, sem novas tabelas ou colunas. Achados históricos continuam em `docs/auditoria/2026-10-07`.

## Matrícula interna (F01)

**Antes:** criar pessoa → registar aluno → encarregados → colocar em turma → histórico. Falha na turma deixava o aluno; reenviar podia duplicar. Também o valor `outro` não coincidia com `people.sex='other'`, e Observações não tinha destino persistido.

**Implementado no código / preparado no SQL:** `enrollNewStudent` exige `requestId` UUID, guard de pessoas e AAL2. Consulta apenas a existência da conclusão no audit log da escola/actor/pedido; pedido novo verifica limite do plano, pedido concluído pode recuperar a resposta mesmo com plano cheio. Chama uma única RPC `siga_enroll_new_student_atomic`. Sem RPC aplicada, falha explícita; não recua para as escritas antigas.

Contrato SQL:

- `p_school_id`: derivado do vínculo autorizado, não do formulário.
- `p_request_id`: UUID estável durante a tentativa e depois de perda da resposta; renovado ao fechar/abrir uma nova folha.
- `p_person`: campos existentes de people, sexo `male/female/other`; `notes` é indicação para a secretaria, gravada no motivo do histórico da matrícula, sem inventar coluna em people.
- `p_guardians`: pessoas activas da mesma escola, sem repetição, no máximo um principal; parentesco segue enum SGA; autorização de busca é preservada.
- `p_class_group_id` e `p_academic_year_id`: ambos presentes ou ambos ausentes; grupo activo da mesma escola/ano. O RPC existente `enroll_student` continua responsável pela vaga, data, número MAT e activação do aluno.
- `p_admission_date`: opcional; data civil de Luanda por omissão, sem data futura.
- Resposta: `id`, `person_id`, `student_number`, `status` applicant/active e `enrollment_number` ou null. Validada por schema de saída.

Uma chamada compõe `create_person_bundle`/`register_student` e `enroll_student`, encarregados e `student_status_history`. O evento `students.enrollment_created` usa `audit_logs.request_id`, hash de comparação do pedido e resposta com IDs; não guarda o payload pessoal completo no audit log. Um advisory lock por escola/actor/pedido serializa o reenvio. Depois da procura de reenvio, um lock da escola protege a conferência de quota do tenant/plano antes do novo cadastro; limite zero ou ausente conserva a regra existente de ausência de limite. Mesma chave/dados devolve a resposta; mesma chave/outros dados é recusada. Falha de histórico/auditoria também desfaz o cadastro.

**UI:** formulário e chave conservados no erro; confirmar lotação extraordinária foi retirado porque a regra do banco a recusa. Uma turma cheia orienta a escolher outra turma. A lista só actualiza após resultado confirmado. Não se criam contratos/propinas automaticamente se não existir regra prevista no fluxo institucional.

**Aceitação local:** falha de turma duas vezes deixa zero pessoas/alunos/matrículas; sucesso/reenvio deixa um de cada e um historial; mudança de payload é recusada; referência B e encarregado inválido são recusados; falha de auditoria faz rollback; candidato sem turma mantém applicant; AAL1 e falta de grant não fazem RPC; repetição no limite do plano recupera resultado.

**Por verificar:** UI autenticada→API→DB, concorrência PostgreSQL em duas ligações, quotas entre todos os caminhos de cadastro (incluindo RPCs legados), renovação/obrigações financeiras/portal e duas escolas em staging. Não se afirma resolução integral desses caminhos.

## Ano lectivo (F02)

`setActiveAcademicYear` e `createAcademicYear` usam `siga_save_active_academic_year`; Administrador, vínculo e grant pedagógica de escrita, AAL2. Input contém escola autorizada e, alternativamente, ID do ano ou nome/datas. Não permite mudar simultaneamente identidade/datas no pedido só de activação.

SQL bloqueia a escola, valida a pertença do ano ou cria/reutiliza por nome, guarda datas, fecha o anterior e activa o destino numa única transacção. Índice de um ano activo é conservado. Falha de criação, activação ou trigger desfaz todas as alterações. Datas e nome são institucionais, sem defaults inventados. Reenvio de criação com mesmo nome e datas reutiliza o ano; datas diferentes são recusadas, sem alterar o ano existente.

**Aceitação local:** falha após fechar A preserva A activo; criação que falha não deixa novo ano; ano B de outra escola recusado; AAL1 recusado; sucesso deixa exactamente um activo; reenvio não duplica. Auditoria de linhas conserva os triggers existentes de produção; o fixture local não reproduz todos esses triggers.

**Por verificar:** concorrência real, calendários/termos já usados, reabertura de ano fechado/arquivado conforme decisão institucional e fecho anual de todas as áreas. Activar outro ano não é encerramento anual certificado.

## Importação (F03)

**Implementado:** `MAX_ROWS_PER_SHEET=25000`. CSV e cada folha visível XLSX contam linhas não vazias; a linha adicional provoca erro antes de staging/commit. Não há `slice` silencioso. CSV com aspas ou quantidade de colunas inválidas é recusado. O aviso PapaParse de delimitador indetectável é tolerado para CSV de uma coluna válida. BOM/acentos/datas/vazios são preservados.

**Aceitação local:** 25000 linhas CSV aceites com última linha conferida; 25001 CSV/XLSX recusadas; malformado recusado; 200 linhas preservadas. **Por verificar:** importação persistida, reenvio/idempotência de lote e rollback em staging. Rejeitar excesso não prova o restante motor de importação.

## MFA de permissões (F08)

Endpoints `setStaffModuleGrant` e `clearStaffModuleGrant` exigem AAL2 antes de escrever. O primeiro conserva validação do alvo/pessoal/escola. Política preparada acrescenta restrições independentes a INSERT/UPDATE/DELETE, conservando a política de administrador/âmbito e SELECT existente.

**Aceitação local:** AAL1 não insere; UPDATE/DELETE devolvem zero linhas e não mudam dados; SELECT AAL1 conservado; AAL2 de administrador na escola permite a operação; outra escola é recusada. SQL corre duas vezes. **Por verificar:** token real AAL1/AAL2 e catálogo após aplicar em staging. Guard de aplicação não resolve sozinho chamadas REST directas à produção enquanto o SQL preparado não for aplicado.

## E2E, dependências e lint (F04/F06/F07)

Guard recusa o projecto `xodgfmxiaunpamctfeea` em qualquer URL configurado e em Management API; exige destino isolado, opt-in e apps locais. Entrada directa Python, runners Node, globalSetup Playwright e clientes/helpers de escrita passam pelo guard. CI usa secrets `STAGING_SUPABASE_*`; não criar tenants se esses secrets faltarem. Limpeza de E2E também é recusada em produção; remoção de restos antigos de produção é trabalho administrativo separado.

Overrides pontuais: MCP SDK 1.31.0 e shell-quote 1.11.0; lockfile actualizado apenas nesses pacotes e overrides. Audit high não encontra altos/críticos; avisos inferiores não são declarados inexistentes. Build/testes continuam necessários para compatibilidade.

Lint exclui `chat/**`, referência local já ignorada pelo Git, e mantém cobertura do produto. A falha de formatação dessa referência não era falha funcional do chat SIGA. Novas alterações seguem Prettier e os gates globais.

**Proposto / por decidir:** investigação da instabilidade da suite completa (F11), rastreabilidade de deploys (F10), configurações Auth (F09), fornecedor/SSO/SIGA/liquidação PayFlow (F05). Nenhuma destas configurações é activada ou certificada por este documento.

[Índice](README.md) · [Revisão e reversão](../implementation/2026-10-07/REVISAO_SQL.md)

## Privacidade de erros e publicação

Erros da base registam apenas códigos e nomes de constraints conhecidos; não registam SQL ou mensagens arbitrárias que possam conter dados pessoais. Testes injectam e-mail/SQL/segredo e verificam a ausência no log. `check-release-contracts.mjs` bloqueia os scripts de deploy e o workflow de produção enquanto o snapshot confirmado não tiver os dois novos RPCs e as três políticas restritivas MFA de grants. O bloqueio actual é deliberado; não houve publicação.

## Dependências — pendências residuais

Os overrides de MCP SDK e shell-quote removem os alertas altos verificados. A auditoria completa ainda encontra cinco avisos: três baixos e dois moderados, nos pacotes DOMPurify, esbuild e uuid. Evidência: `docs/implementation/2026-10-07/evidencias/dependency-audit-all.json`. O gate `--audit-level=high` aprovado não significa ausência de avisos.

- dompurify: low, versões `>=3.4.13 <=3.4.15` — [DOMPurify: IN_PLACE: node-removing afterSanitize hook leaves detached subtree event handlers armed, causing DOM XSS](https://github.com/advisories/GHSA-p98j-92pf-mc4p).
- dompurify: low, versões `<=3.4.15` — [DOMPurify: IN_PLACE returns a force-removed rawtext root whose text carries attacker markup — pure HTML reparse executes](https://github.com/advisories/GHSA-6688-9rhm-gjv2).
- esbuild: moderate, versões `<=0.24.2` — [esbuild enables any website to send any requests to the development server and read the response](https://github.com/advisories/GHSA-67mh-4wv8-2f99).
- esbuild: low, versões `>=0.27.3 <0.28.1` — [esbuild allows arbitrary file read when running the development server on Windows](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr).
- uuid: moderate, versões `<11.1.1` — [uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

A promoção requer avaliar o consumidor e a compatibilidade antes de actualizar transições maiores (especialmente uuid e a cadeia de ferramentas esbuild); estes cinco avisos permanecem documentados, sem certificação de inexistência de risco.
