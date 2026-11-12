# SIGA Plus — Plano de implementação de aulas virtuais (BigBlueButton)

> Estado: **Planeado** · Data: 08/10/2026 · Documento de especificação; nenhuma funcionalidade está implementada por este ficheiro.

## Objectivo
Integrar o BigBlueButton (BBB) como serviço externo de videoconferência educativa, preservando o backend, as regras académicas, o RBAC e o isolamento multi-tenant do SIGA Plus. O SIGA Plus é a fonte de verdade para escolas, turmas, matrículas, professores e horários.

## Princípios técnicos
- Não expor segredos da API BBB no frontend, logs, repositório ou URLs.
- Criar reuniões e links de entrada apenas no backend autenticado; validar vínculo activo, escola, turma, disciplina e função em **todas** as operações.
- Usar identificadores opacos e escopados por tenant; impedir enumeração de reuniões e acesso entre escolas.
- Verificar versão e documentação oficial da API BBB antes de implementar; não presumir nomes de endpoints, parâmetros ou webhooks.
- Não instalar BBB dentro da aplicação web: usar servidor dedicado e comunicação segura entre serviços.
- Garantir consentimento e política de retenção para gravações e dados pessoais; não considerar simples entrada na reunião como presença académica automática.
- Definir estados de erro, idempotência, retries, auditoria e limites de utilização.

## Fase 1 — Integração técnica
**Objectivo:** instalar o BigBlueButton num servidor dedicado e criar uma integração segura com o backend do SIGA Plus.

### Tarefas
- [ ] Auditar arquitectura actual, autenticação, RLS, tenants, calendário, turmas e infraestrutura.
- [ ] Escolher versão BBB suportada; validar requisitos de CPU, RAM, largura de banda, armazenamento, domínio, TLS e portas.
- [ ] Provisionar servidor dedicado, DNS, HTTPS, TURN/STUN conforme necessidade, backups e monitorização.
- [ ] Configurar segredos apenas no gestor de segredos do servidor; separar ambientes de desenvolvimento, homologação e produção.
- [ ] Criar adaptador backend para criar, consultar, encerrar reuniões e gerir gravações, de acordo com a API suportada.
- [ ] Modelar `virtual_classes`, `virtual_class_participants`, `virtual_class_events` e `virtual_class_recordings` (nomes provisórios, sujeitos a revisão do esquema).
- [ ] Implementar autorização por escola/turma, políticas RLS, auditoria e protecção contra pedidos duplicados.
- [ ] Testar acessos cruzados, falhas de rede, indisponibilidade BBB e expiração de sessões.

**Critério de aceitação:** professor autorizado cria reunião da sua turma; aluno matriculado entra; utilizador de outra escola é bloqueado; segredos não aparecem no cliente.

## Fase 2 — Interface académica
**Objectivo:** adicionar botões de criar aula, iniciar, entrar, terminar e consultar gravações, respeitando as permissões.

### Tarefas
- [ ] No portal do professor: criar/agendar, iniciar, terminar, consultar participantes e gravações.
- [ ] No portal do aluno: ver próximas aulas, entrar em aulas autorizadas e consultar gravações permitidas.
- [ ] Na administração/pedagógica: acompanhar sessões, estados, erros e auditoria.
- [ ] Mostrar estados: agendada, disponível, em curso, concluída, cancelada e indisponível.
- [ ] Criar interface responsiva, acessível, com carregamento, confirmação, feedback e mensagens de erro.
- [ ] Garantir que links e acções são autorizados no servidor, nunca apenas escondidos na interface.

**Critério de aceitação:** fluxos completos em desktop e Android, com autorização verificada em cada acção.

## Fase 3 — Automação pedagógica
**Objectivo:** integrar calendário, turmas, presenças, notificações e relatórios.

### Tarefas
- [ ] Associar cada aula a escola, ano lectivo, período, disciplina, turma, professor e horário.
- [ ] Agendar aulas a partir do calendário, considerando fuso horário e conflitos.
- [ ] Notificar participantes por canais já autorizados no SIGA Plus; evitar notificações duplicadas.
- [ ] Recolher eventos de participação suportados pela instalação BBB; validar origem, ordem e duplicação.
- [ ] Calcular participação/duração; submeter presença à regra pedagógica e eventual validação do professor.
- [ ] Disponibilizar relatórios por turma, disciplina, escola e período, sempre escopados por tenant.
- [ ] Definir políticas de publicação, consentimento, expiração e eliminação de gravações.

**Critério de aceitação:** aula aparece no calendário, alunos autorizados recebem informação, presenças são verificáveis e relatórios não misturam escolas.

## Fase 4 — Testes e produção
**Objectivo:** testar telemóveis Android, computadores, ligações móveis lentas, segurança multi-tenant e várias aulas simultâneas.

### Tarefas
- [ ] Executar testes unitários, integração, E2E, permissões e RLS.
- [ ] Validar Chrome, Firefox, Edge, Safari e dispositivos Android reais.
- [ ] Simular latência elevada, perda de pacotes, interrupção e reconexão em redes móveis.
- [ ] Realizar testes de carga com várias turmas e reuniões simultâneas; medir CPU, RAM, banda e qualidade.
- [ ] Testar gravação, recuperação de falhas, limpeza, backups, monitorização e alertas.
- [ ] Executar rollout piloto numa escola, observar indicadores e disponibilizar rollback.
- [ ] Documentar instalação, operação, suporte, incidentes e custos.

**Critério de aceitação:** testes aprovados, piloto validado, observabilidade activa, política de privacidade revista e aprovação explícita para produção.

## Ordem e dependências
1. Fase 1 é pré-requisito para a Fase 2.
2. Fase 2 estabelece os fluxos para a Fase 3.
3. Fase 4 valida as fases anteriores antes de disponibilização geral.

## Riscos e decisões pendentes
- Capacidade real do servidor e custo de tráfego/gravações.
- Versão BBB, API de integração e compatibilidade com a infraestrutura existente.
- Retenção e autorização de gravações, dados de menores e privacidade.
- Regras de presença académica, fusos horários e perfis de utilizador.
- Estratégia de piloto, métricas de sucesso e orçamento.

## Referências
- https://github.com/bigbluebutton/bigbluebutton
- https://docs.bigbluebutton.org/

## Definição de concluído
Todas as quatro fases têm evidências de testes, revisão de segurança, documentação, aprovação pedagógica e autorização de deploy. **Este plano não autoriza deploy automático nem alterações à base de dados sem revisão.**
