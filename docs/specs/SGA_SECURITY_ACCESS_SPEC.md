# SGA — Especificação de Segurança e Acesso (v1)

**Data:** 2026-09-24

## Estado actual

- RLS: 156/156 tabelas públicas activado.
- Security Advisor: 21 tabelas com RLS sem policies.
- 1 função SECURITY DEFINER pública para validação de documentos.
- 22 funções SECURITY DEFINER executáveis por utilizadores autenticados.
- O alerta de leaked-password protection pertence à configuração do Supabase Auth, não a uma migration SQL.

## 1. Tabelas RLS sem policy

O conjunto actual inclui tabelas Alumni, `notification_preferences`, `school_integration_secrets` e `slug_reservations`, além de sequências internas no schema `private`.

A ausência de policy não deve ser corrigida em massa. Quando RLS está activo e não existe policy, o acesso directo via cliente é bloqueado; isso é adequado para tabelas que só devem ser acedidas por server functions/admin client.

## 2. Alumni

O código actual usa server functions autenticadas e cliente administrativo do SGA para as operações Alumni. Por isso, não se deve abrir estas tabelas directamente ao cliente apenas para eliminar o aviso do Advisor.

Qualquer futura policy deve provar simultaneamente:
- pertença à escola;
- identidade do utilizador;
- relação com o `alumni_profile`;
- regra de visibilidade/consentimento;
- separação entre dados públicos do directório e dados privados.

## 3. Secrets

`school_integration_secrets` contém `secret_key` e `secret_value`. Deve permanecer sem acesso directo para `anon`/cliente autenticado. A utilização deve ocorrer server-side e os segredos não entram em exportações.

## 4. Funções SECURITY DEFINER

Não revogar EXECUTE em massa. Funções como `current_school_id()`, `is_school_member()`, `has_school_permission()` e funções de portal/RLS podem ser parte deliberada do modelo de autorização.

A função `validate_issued_document(validation_code)` continua pública por desenho funcional de verificação documental.

A regra é: cada função deve ter `search_path` controlado e permissões mínimas necessárias.

## 5. Performance

O Advisor ainda reporta 292 FKs sem índice de cobertura. Isto não implica criar 292 índices cegamente. A prioridade deve ser:
- FKs de tabelas de alto tráfego;
- joins usados pelo SIGA;
- filtros por `school_id`;
- matrículas, horários, presenças, avaliações/notas, finanças e importação.

Cada índice novo deve ser comparado com índices existentes para evitar duplicação.

## 6. Auth

O Advisor reporta leaked password protection desactivado. Essa configuração deve ser tratada no Supabase Auth. A documentação oficial indica que a protecção rejeita palavras-passe conhecidas como comprometidas através do Pwned Passwords API. 
