# SIGA Plus — Arquivos como serviço transversal, inspirado no Moodle File API

Data: 20/10/2026 · Estado: **refinamento incremental em PR #194**. Sem alterações de schema ou produção.

## Referências estudadas

- [Moodle File API](https://moodledev.io/docs/5.2/apis/subsystems/files): armazenamento, metadados, serviço de conteúdo, browsing e áreas de ficheiros.
- [Moodle File API internals](https://moodledev.io/docs/5.2/apis/subsystems/files/internals): contextos por módulo, File Picker, File Manager, permissões e áreas de rascunho.
- [Moodle Repository API](https://docs.moodle.org/dev/Repository_API): descoberta e selecção de arquivos de diversas origens.
- [Moodle upload/draft files](https://moodledev.io/docs/5.0/apis/subsystems/external/files): envio temporário e confirmação de área/campo de destino.

**Adaptação, não cópia literal:** no SIGA, `school_id` é o contexto institucional; `area` (escola/secretaria/pessoal/publico) e `parent_id` representam repositório e pasta. `related_person_id`, `class_group_id` e o vínculo por módulo representam o item. `siga_files` fornece metadados; Supabase Storage guarda o conteúdo; funções do servidor validam autorização e geram URLs de duração curta.

## Contrato de integração entre módulos

`src/features/arquivos/file-request.ts` declara a finalidade da selecção:

| Purpose              | Regra adicional antes de o módulo receber o ID                             |
| -------------------- | -------------------------------------------------------------------------- |
| `general`            | escolha de ficheiro visível; compatível com arquivos locais no dispositivo |
| `message-attachment` | exige Storage escolar, nunca apenas IndexedDB                              |
| `student-document`   | Storage escolar, pessoa exacta, Secretaria, visibilidade privada           |
| `class-material`     | Storage escolar e turma exacta                                             |
| `finance-document`   | Storage escolar e categoria fatura/recibo/talao                            |

### Exemplo do consumidor React

```tsx
<PickFileButton
  label="Anexar documento da turma"
  request={{ purpose: "class-material", classGroupId }}
  onPick={(file) => setSelectedFileId(file.id)}
/>
```

Ou directamente `<FilePickerModal request={{ purpose: "message-attachment" }} ... />`.

O `PickFileButton` propaga `request` até o Picker. A escolha faz uma pré-verificação local e chama `resolveRequestedSchoolFile`: sessão, escola activa, autorização de leitura da área, acesso ao conteúdo, integridade dos atributos associados e finalidade. **Devolve apenas ID/nome/tipo/finalidade, nunca `storage_path`, tokens ou URLs.**

**Regra obrigatória para o backend de destino:** a pré-verificação do Picker não substitui a validação **no acto de gravar a associação**. Por exemplo, `assertSenderMayAttach` no chat volta a verificar a escola, papéis e autorização, incluindo recusa de ficheiro apenas local. Evitar uma janela TOCTOU entre selecção e utilização.

### Fluxo dos módulos

1. Solicitar ficheiro: o módulo informa a finalidade + id de turma/pessoa quando aplicável.
2. No File Picker: escolher arquivo existente ou enviar um novo pelo File Manager actual.
3. O servidor garante escola activa + leitura autorizada + contexto correcto e devolve ID de arquivo.
4. O módulo persiste apenas o ID da referência; ao abrir, cria URL assinada depois de revalidar sessão e acesso.
5. Mudança de escola/revogação de sessão exige invalidação de cache e nova verificação de autorização.

O chat foi o primeiro cliente migrado; os restantes podem aderir **incrementalmente**, sem alteração de API pública nem migrações obrigatórias.

## Diagnóstico de duplicados e localização

- `findExistingSchoolFiles` procura por nome em toda a escola, filtrando **antes de devolver** metadados de ficheiros sem permissão.
- `find-existing.ts` compara nome/tamanho e informa: mesmo destino / outra pasta / nome igual tamanho diferente.
- O formulário de upload mostra área/pasta autorizada e um botão **Ver no Arquivo**, sem substituição ou deslocação automática.
- Limite de 200 candidatos por chamada e aviso de resultado incompleto. Pesquisa do servidor não é um inventário global irrestrito.
- **Não declarar igualdade binária:** para deduplicação real é necessário hash de conteúdo por escola com indexação, quotas, confirmação humana e política de privacidade.

## Auditoria: pontos ainda não implementados

1. **Draft/upload temporário:** Moodle separa uploads provisórios da área definitiva. O SIGA ainda faz primeiro upload ao Storage e depois regista metadados, podendo deixar objectos órfãos; a auditoria #193 encontrou um. Conceber reserva de upload com idempotency key, expiração e compensação segura, sem eliminar automaticamente conteúdos legados.
2. **Contexto granular/ACL:** hoje as áreas e papéis não substituem políticas de documento por pessoa/turma. Adicionar regras unificadas para aluno/encarregado quando forem consumidores directos, com testes RLS negativos.
3. **Deduplicação por checksum:** evitar copiar o mesmo blob sem criar vínculos independentes; avaliar `SHA-256` e referências de uso por módulo, sem adoptar cegamente o desenho SHA-1 histórico do Moodle.
4. **Paginação real:** o FileBrowser mostra 48 resultados; no futuro fornecer navegação por cursor, mantendo a filtragem **antes** do limite para não ocultar ficheiros autorizados.
5. **Downloads activos (SVG/HTML) e antivírus:** validar MIME real, extensão, content-disposition, tamanho/quota e destinos de upload em ambientes isolados.
6. **Isolamento do cache:** listas, detalhes, miniaturas e pesquisas devem usar utilizador, papel e escola activa na chave. A PR #194 passou a incluir conta/papel nas chaves do browser.
7. **Aderência por módulo:** testar separadamente chat, matrícula, documentos do aluno, biblioteca, aulas, financeiro, RH e mobile Flutter; partilhar o contrato, não uma URL de serviço-role.

## Critérios de aceitação

- Sem permissões cruzadas escola A/B, inclusive IDs conhecidos e URLs directas.
- Professor sem acesso a documento privado de outro professor/aluno; Secretaria não atravessa o contexto de pessoa indicado; nenhum blob local como anexo remoto.
- Se um arquivo já existe noutra pasta, mostrar localização permitida e permitir abrir, **sem mover ou substituir**.
- Com falha na verificação mostrar estado inconclusivo, não «nenhum arquivo existente».
- Nomes/tamanhos iguais nunca significam igualdade de conteúdo confirmada.
- CI (lint, TS, Vitest, PGlite e build) e Playwright autenticado em staging com duas escolas antes de qualquer merge.

**Importante:** proposta para revisão técnica pelo Claude Code, issue #192; auditoria Storage #193. Não executar operações de produção durante esta revisão.
