# Contratos transversais

Actualizado a 08/10/2026. Fonte: arquitectura canónica, `DATABASE_RULES.md`, skills por módulo e banco existente. Estes requisitos não inventam regras de avaliação, preços ou aprovação.

## Responsabilidades e identidade

**Implementado:** WEB vende, ADMIN controla, SIGA trabalha, PAYFLOW cobra, DOC explica. Identidade Auth única, memberships e papéis por escola. `platform_admins` é independente do cargo Administrador escolar. Financeiro escolar e subscrição SaaS têm fontes de verdade distintas.

Escola escolhida é contexto validado, nunca autorização fornecida pelo cliente. Nenhum pedido pode confiar num `school_id`, aluno, turma, ficheiro ou pagamento apenas porque veio de uma opção do formulário. Servidor valida vínculo activo, grant, âmbito da entidade e relações da escola. Cache/realtime/localStorage devem acompanhar a troca de escola e logout.

## Banco actual e permissões

O snapshot tem 189 tabelas públicas, 359 políticas e seis buckets. São valores datados; não os usar como prova de segurança de uma operação. Tabelas/colunas novas exigem confirmação e revisão; esta evolução crítica usa apenas tabelas/colunas existentes.

`is_school_member` inclui aluno e encarregado. Dados sensíveis têm acesso de servidor ou âmbito/papel efectivo; `FORCE ROW LEVEL SECURITY` e REVOKE são conservados onde definidos. Escrita sensível exige AAL2 e permissão da acção. Políticas permissivas somam por OR; a restrição de MFA tem de sobreviver às permissivas restantes. `USING` protege a origem e `WITH CHECK` o destino de UPDATE. Grants não substituem o âmbito.

**Preparado:** política restritiva por INSERT/UPDATE/DELETE em `staff_module_grants`; leitura AAL1 conserva o comportamento anterior. Não aplicada ao banco de produção. A aplicação já exige AAL2 para atribuir/repor grants.

## Operações, repetição e conflitos

Pedidos com várias escritas interdependentes devem concluir numa transacção ou devolver estado parcial identificável com retoma segura. A perda da resposta não permite criar o mesmo aluno, recibo ou transição uma segunda vez. Chave de pedido é estável durante a tentativa, validada no servidor e limitada por escola/actor; repetir a chave com outros dados produz conflito explícito.

**Preparado:** pessoa/aluno/encarregados/matrícula/histórico/auditoria numa transacção, usando os RPCs e sequências existentes. Activação/criação de ano partilha transacção e bloqueio da escola; falha preserva o anterior. Não se usa compensação DELETE como substituto de rollback. Os restantes fluxos ainda exigem aceitação individual, conforme matriz.

Alteração de dados que tenha `expectedVersion` deve rejeitar conflito e preservar o formulário. Não aumentar timeouts nem remover restrições para esconder uma falha. Estado `active` não implica ausência de dívida; estado financeiro e académico são independentes.

## Datas, montantes e regras escolares

Datas civis seguem `schoolTodayIso`/Africa-Luanda, não o relógio UTC do browser. Validar datas reais, relações início/fim, período e ano. Valores monetários são exactos ao cêntimo e distinguem preço, desconto, multa e saldo. `invoiceNetTotal` e a regra versionada de multa são as fontes locais. Nenhum limiar, trimestre, desconto, carga horária ou excepção de lotação é criado por esta SPEC.

Médias e transição usam modelo/regime/configuração efectivos e o motor canónico; falta de nota não vira zero. Bases legais, excepcionais e homologações sem documento confirmado ficam **por decidir**.

## Interface e confirmação

Cada acção apresenta o estado do pedido real: carregamento, vazio com próximo passo, sucesso confirmado, falha recuperável e acesso negado. Botão fica bloqueado durante execução, formulário conserva os dados no erro, destruição exige confirmação e saída com alterações pede decisão. Um fornecedor aberto por deep-link não é mensagem entregue; metadado de ficheiro não é upload confirmado.

Design actual conservado; Inter e ícones canónicos; labels/foco/teclado, tabelas estreitas e modais com altura/scroll apropriados. Movimentos respeitam `prefers-reduced-motion`. Dados técnicos de migração pertencem à documentação, não ao fluxo do aluno/encarregado.

## Auditoria, integrações e segredos

Registar actor, escola, entidade, acção, motivo e versão quando pertinentes; notificações são efeitos confirmados com audiência autorizada. Segredos só no servidor; não guardar senhas/tokens/OTP nos logs, docs, exportações ou URLs.

**Implementado:** guard de E2E recusa produção, variáveis de projectos mistos e aplicações remotas antes de qualquer escrita. Requer `SIGA_E2E_ALLOW_WRITES=1`, `SIGA_E2E_PROJECT_REF` explícito, URLs Supabase coerentes e apps locais. O CI de escrita usa secrets `STAGING_*`. Um localhost ligado à produção não é staging.

## Aceitação e limitações

Para cada operação: UI→pedido→persistência; refresh/login; perfil permitido/negado; A/B; inválido/duplicado; falha intermédia; reenvio; conflitos; efeitos dependentes e artefactos. PGlite valida SQL/rollback/ACL parcial, não concorrência PostgreSQL real. Chrome viewport não comprova dispositivo real. A jornada de 17 etapas só fica concluída com evidências no ambiente isolado. Migrações e publicação permanecem preparadas para revisão.

[Índice](README.md) · [Jornada](JORNADA_INTEGRADA.md)
