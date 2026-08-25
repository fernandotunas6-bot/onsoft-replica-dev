---
name: siga-importar
description: Motor Central de Importação de Dados Escolares Excel/CSV do SIGA.
---

# SIGA — Motor Central de Importação de Dados Escolares

Este módulo disponibiliza a ingestão e migração em massa de dados escolares a partir de ficheiros Excel (`.xlsx`, `.xls`) e `.csv`.

## Arquitetura & Fluxo de Segurança
1. **Sem Gravação Direta**: Nenhum ficheiro Excel é gravado diretamente nas tabelas de produção do SIGA.
2. **Etapas**: `Upload → Leitura → Análise → Mapeamento → Validação → Staging → Pré-visualização → Confirmação → Importação → Auditoria`.
3. **Multi-escola & Ano Lectivo**: Isolamento por `school_id` e `academic_year_id` com políticas RLS no Supabase.
4. **Reversibilidade (Rollback)**: Histórico `before_data` e `after_data` gravado em `import_audits`.
