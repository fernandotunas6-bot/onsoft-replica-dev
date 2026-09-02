---
name: siga-arquivos
description: >-
  Extends SIGA school file library (Moodle-style picker). Use when editing
  /arquivos, FilePickerModal, siga_files, or src/features/arquivos.
---

# SIGA · Arquivos

- Rota: `src/routes/arquivos.tsx` — **só no waffle / painel da conta / Definições**, nunca na sidebar.
- UI: `FileBrowser` opaco estilo OneDrive — breadcrumb (área › pastas), barra de comandos, multi-selecção, lista/grelha, drag-drop, painel Detalhes.
- Pastas: `is_folder` + `parent_id` em `siga_files`; **Nova pasta**, **Mover** selecção, navegação por pasta.
- Modais expansíveis: botão Expandir/Reduzir no picker, inquérito e mover (`dialog-expand.tsx`).
- Ícones: `FileKindIcon` com selo de partilha quando Escola/Público; tipo `folder` com ícone de pasta.
- Picker: `FilePickerModal` + `PickFileButton` nas funções pequenas (documentos, alunos, comunicações, pedagógica).
- Metadados: tabela `siga_files` (título, categoria, descrição, data, referência, `related_user_id`, `related_person_id`). Bytes: bucket privado `siga-files`. Auditoria: `siga_file_events`. Sem tabela/bucket: IndexedDB local.
- Upload: inquérito obrigatório (`FileUploadInquiryModal`) com **descrição** e **área de destino**; filtros por categoria e utilizador relacionado.
- **Fotografia**: categoria `foto` exige aluno; aplica no perfil via `applyLibraryPhotoToPerson`; ficha mostra `StudentRelatedFilesPanel`; filtro `/arquivos?pessoa=`.
- **Organização**: `fileNeedsOrganization` marca ficheiros incompletos; filtro **Por organizar** + modal de organização.
- **ID do documento**: `reference_code` no padrão `REC-260812-K4M2` (`document-code.ts`); pesquisa por nome/título/ID atravessa pastas.
- **Financeiro na biblioteca**: categorias `recibo`/`talao`/`fatura`; `archiveFinanceDocument` / `insertFinanceArchive` (stub `.txt`, idempotente); ficha do aluno lista IDs.
- Tipos: PDF, Word, Excel, PowerPoint, CSV, PNG, JPEG, WebP, GIF, SVG. Máx. 8 MB. Lista só metadados (48). Miniaturas raster (não SVG).
- Ícones: cada tipo tem cor/ícone próprio (`FileKindIcon` / `FileCover`).
- Áreas: `escola`, `secretaria` (reservada Admin/Secretaria), `pessoal`, `publico`.
- Acesso: `visibility` Privado/Escola/Público; o seu nível = Proprietário / Pode editar / Só leitura (`myFileAccess`).
- **Utilizador obrigatório**: cada ficheiro tem `related_user_id` (inquérito + fallback ao dono); `fileNeedsOrganization` se faltar.
- **Ficheiros de sistema** (`is_system`): listáveis; conteúdo oculto sem permissão (`canAccessFileContent` / `canManageSystemFile`). Recibos/talões/faturas da tesouraria.
- Filtros **Meus** / **Sistema**; SQL backfill liga `related_user_id` ao dono e marca financeiros como sistema.
- Auditoria: tentativa de abertura sem permissão → evento `access_denied` (visível no painel Detalhes).
- Drive: Microsoft 365 / OneDrive catalog-ready (`m365.onedrive` → `/arquivos`). Sem chave gratuita partilhada entre escolas.
- Ligação: perfil e logótipo da escola, foto do aluno/pessoa (`applyLibraryPhotoToPerson`), anexo em `person_documents` (`file_id`/`file_name`), referência em comunicados, materiais de turma (`class_group_id` + `ClassMaterialsPanel` em `/pedagogica` e no workspace do professor).
- Browser: abrir, descarregar, renomear, apagar; filtro por turma (`/arquivos?turma=`). Partilha: `schoolFileShareText` + WhatsApp catalog-ready.
- SQL: `supabase/APPLY_ENROLLMENT_AND_PREMIUM.sql` (inclui `class_group_id`, auditoria e colunas de anexo em `person_documents`).
- Testes: `tests/arquivos/schemas.test.ts`.

## Regras

1. Não guardar blobs no Postgres.
2. Não fazer HTTP a Google/Microsoft — só catalog-ready.
3. Sem tabela: degradar para armazenamento local neste dispositivo.
4. Estender `schemas.ts` / `server.ts` / o picker; não criar um segundo gestor de ficheiros.
5. Miniaturas só a pedido (nunca na listagem de metadados em massa).
6. Fotos de ficha: copiar a imagem para `school-logos` e gravar URL em `people.photo_url` (não depender de signed URL efémera).
7. Materiais de turma: ligar ficheiro existente via `linkSchoolFileToClass`; sem coluna, fica só no IndexedDB.
8. Auditoria: eventos em `siga_file_events`; sem tabela, a coluna Actividade usa `last_action`/`created_at`.
