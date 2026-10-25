# Reprodução e leitura das evidências

Executar a partir da raiz do repositório. Os resultados guardados referem-se ao commit e à árvore inicial descritos no relatório. Não se modificou a implementação do produto. As alterações pré-existentes do utilizador foram preservadas.

## Provas locais de F01, F02 e F03

```sh
node_modules/.bin/vitest run --config docs/auditoria/2026-10-07/vitest.audit.config.ts --reporter=verbose
```

O ficheiro `probes.test.ts` executa handlers reais com autenticação e persistência simuladas, injecta as falhas intermédias e executa o parser e o cálculo reais. As cinco asserções aprovadas incluem a **confirmação dos defeitos**, portanto não indicam que estes tenham sido corrigidos. Não contacta o banco nem grava alunos reais.

## Inventário, matriz e lista de achados

```sh
python3 docs/auditoria/2026-10-07/collect-inventory.py
python3 docs/auditoria/2026-10-07/build-matrix.py
python3 docs/auditoria/2026-10-07/build-findings.py
```

O inventário é extracção estática; os guardas textuais não constituem prova semântica de autorização. A matriz separa cenários da jornada das provas locais e das superfícies inventariadas. Executar novamente pode actualizar os ficheiros; preservar as evidências originais antes de auditar outro commit.

## Verificações do produto

Os comandos e resultados concluídos estão na secção 8 do relatório. Os 15 scripts SQL foram executados sequencialmente com PGlite 0.3.14 em memória, instalado em `/private/tmp/siga-audit-20261007-pglite`, usando `SIGA_SQL_TEST_MODULE_PATH` conforme `tests/sql/README.md`. O ficheiro `evidencias/sql-results.json` contém os scripts exactos e os respectivos resultados. Os logs são conservados por ensaio. Fixtures e permissões são parciais; não equivalem a concorrência em PostgreSQL real.

A primeira suite desktop não iniciou por uma dependência ausente. Depois de `npm ci --prefix desktop --ignore-scripts`, a repetição com dois workers passou 40/40 testes e o build frontend passou. Não se alterou o lockfile nem se executou o build nativo.

## Banco, publicação e browser

`consultas-leitura.sql` fornece consultas de catálogo e agregados para reprodução, dentro de uma transacção explicitamente só de leitura. Não aplicar migrações nem executar os E2E com escrita contra o projecto de produção. As consultas deste ficheiro são um roteiro de reprodução; os resultados históricos efectivos estão nos JSON de evidências, recolhidos pela ligação Supabase em leitura.

`anon-probe.mjs` lê apenas com a chave pública, limita a consulta e guarda códigos/contagens, nunca registos pessoais. `collect-deployment.py` recolhe HTTP público e metadados Cloudflare por GET, lendo as credenciais internamente sem as imprimir. Não publica versões. Os estados publicados podem mudar depois da data de recolha.

Os scripts `browser-audit.mjs` e `browser-interactions.mjs` pressupõem os servidores locais SIGA na porta 3006 e WEB na 5174. Usam Chrome headless, bloqueiam a rede externa e exercitam navegação e validações vazias. Não autenticam, criam escolas ou concluem a jornada. As capturas finais e JSON registam dois viewports, não dispositivos reais. Ambos os servidores locais foram parados ao terminar.

## Salvaguardas e limitações

Não há credenciais nem dados pessoais de produção nos relatórios. `evidencias/secret-scan.json` regista a comparação dos artefactos com sete valores secretos da configuração, sem guardar esses valores. `evidencias/SHA256SUMS` permite verificar a integridade dos ficheiros entregues.

Os ficheiros de consultas iniciais com erro e a primeira reconciliação financeira com o estado incorrecto de recibo foram preservados para transparência; apenas a reconciliação **confirmed**, com `issued`, sustenta as conclusões. O resultado completo dos testes conserva duas falhas que passaram isoladamente; não se declara uma suite global aprovada.

Não executar os cenários de escrita da matriz até existir staging confirmado, duas escolas sintéticas, contas por papel/MFA e destinos de teste. Não foi possível verificar a jornada anual nem o isolamento autenticado A/B nesta execução. Nenhuma correcção, migração, publicação ou mensagem a terceiros foi efectuada.
