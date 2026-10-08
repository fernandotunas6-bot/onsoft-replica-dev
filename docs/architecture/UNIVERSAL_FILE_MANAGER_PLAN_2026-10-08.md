# SIGA Plus — Plano de auditoria e implementação do Gestor Universal de Ficheiros

Estado: especificação inicial; **nenhuma correcção funcional implementada neste commit**.

## Problema
Botões de trocar fotografia, seleccionar ficheiros e anexar documentos não abrem de forma fiável o selector de ficheiros. Necessário auditar as implementações reais antes de substituir componentes.

## Inventário obrigatório
- Localizar todos os `input[type=file]`, refs e handlers de clique, `showOpenDialog`, integrações Tauri, uploads Supabase Storage e selecções de arquivos internos.
- Mapear os módulos: perfil, alunos, encarregados, docentes, RH, matrículas, secretaria, mensagens, calendário, avaliações, arquivos, financeiro e biblioteca.
- Identificar por módulo: origem, formato, limite, permissão, bucket, caminho, proprietário, tenant, operação de substituição, preview, erros e testes existentes.

## Contrato proposto
`UniversalFilePicker({mode: 'upload'|'library'|'both', multiple, accept, maxSize, scope, onSelect, onError})`.
Separar: UI, selector nativo, API de biblioteca, validação, armazenamento e autorização.
O selector local deve abrir por gesto explícito do utilizador, com fallback web `input type=file`; Tauri deve usar plugin/diálogo compatível com a versão realmente instalada. Não prometer acesso irrestrito ao filesystem.

## Fluxo
1. Abrir modal acessível com opções «Do dispositivo», «Dos meus ficheiros», «Partilhados comigo» e «Biblioteca pública autorizada».
2. Seleccionar, pré-visualizar, validar tipo/tamanho/conteúdo e confirmar.
3. Para upload: enviar com progresso, retries limitados e cancelamento, confirmar metadata e vínculo à entidade.
4. Para reutilização: vincular por identificador autorizado, sem duplicar blob desnecessariamente.
5. Para substituição: preservar versão/referências conforme política, confirmar operação, invalidar caches e auditar.

## Segurança não negociável
- Tenant e escola obrigatórios em queries, paths e políticas; negar por padrão.
- «Público» significa explicitamente publicado, nunca qualquer arquivo do bucket.
- Não permitir listar ficheiros privados de outros utilizadores, nem revelar URLs permanentes de conteúdo privado.
- RLS para metadata e Storage, validação de autorização no servidor, signed URLs de curta duração.
- Validar tamanho, MIME real e assinatura de conteúdo; sanitizar nomes; impedir execução de HTML/SVG não confiável; políticas de malware quando disponíveis.
- Não permitir selecção cruzada entre escolas sem partilha expressa e auditável.
- Auditar upload, download, associação, substituição, eliminação e falhas relevantes.

## Aceitação e testes
- Todos os botões de anexar/trocar foto abrem um selector funcional no Chrome, Edge, Firefox, Safari e Android; validar iOS e Tauri quando ambientes disponíveis.
- Upload e reutilização funcionam com teclado, toque e rato; estado vazio, erro, progresso e cancelamento acessíveis.
- Cobertura de ficheiro inválido, oversized, offline, sessão expirada, permissões insuficientes, URL adulterada, tenant diferente e substituição concorrente.
- Sem regressões nas entidades académicas/financeiras.
- CI: typecheck, lint, unitários, integração Storage/RLS, build web/Tauri conforme ambientes.
- Capturas e evidências por módulo antes de merge/deploy.

## Ordem de execução
1. Inspeccionar a base real e produzir matriz de componentes afectados.
2. Corrigir o selector actual e adicionar testes de regressão.
3. Implementar biblioteca autorizada e picker central.
4. Migrar módulos gradualmente, com feature flag e rollback.
5. Testes de segurança, builds, revisão visual e só então deploy controlado.

## Regra de entrega
Não alterar `main` nem produção antes de revisão. Nunca afirmar que um módulo está corrigido sem teste reproduzível e evidência.
