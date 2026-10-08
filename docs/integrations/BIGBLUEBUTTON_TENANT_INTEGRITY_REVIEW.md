# BigBlueButton — revisão de integridade referencial multi-tenant

A inspeção do esquema actual confirmou as seguintes restrições únicas:
- `class_groups(school_id, id)`
- `teachers(school_id, id)`

## Correcção obrigatória antes de aplicar a migração

Na proposta de migração `20261008170000_bbb_classroom_metadata.sql`, as referências simples `class_group_id -> class_groups(id)` e `teacher_id -> teachers(id)` não impedem que um registo com `school_id=A` aponte para uma turma ou professor de `school_id=B`.

Substituir essas referências por chaves estrangeiras compostas, ligando `(school_id, class_group_id)` a `class_groups(school_id, id)` e `(school_id, teacher_id)` a `teachers(school_id, id)`. O esquema já suporta essas chaves compostas.

Também se recomenda validar o modelo de permissões e adicionar testes de inserção que tentem combinar escola A com turma/professor da escola B. A migração continua **não aplicada** e não deve ser integrada antes da correcção.

## Outros requisitos
- O servidor deve obter escola, utilizador, matrícula e atribuição docente a partir de consultas autenticadas, nunca aceitar esse contexto directamente do browser.
- Os links BBB devem ser criados apenas após autorização e não guardados em logs.
- O serviço de reuniões deve funcionar com segredos de servidor, sem `VITE_`.
- Rever comportamento com Cloudflare Workers, porque `process.env` pode não estar disponível em todos os runtimes.
- Executar testes unitários, compilação e testes de segurança antes do merge.
