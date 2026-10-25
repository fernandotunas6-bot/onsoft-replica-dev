# PROMPT MASTER — SIGA PLUS 2026

## Operação Performance Total | Optimização Global, Fluidez e Refinamento Cirúrgico

**Projecto:** SIGA Plus — Sistema Integrado de Gestão Escolar SaaS Multi-Tenant  
**Repositório:** `fernandotunas6-bot/onsoft-replica-dev`  
**Prioridade:** Performance máxima, estabilidade, organização e resposta imediata.  
**Princípio obrigatório:** Melhorar tudo o que já existe, sem acrescentar nem remover funcionalidades, módulos ou elementos visuais.

---

## 1. MISSÃO PRINCIPAL

Realizar uma auditoria técnica, funcional, estrutural e visual completa ao SIGA Plus, identificando e corrigindo todos os factores que prejudicam a velocidade, a fluidez, a organização e a experiência de utilização.

O sistema deve transmitir a sensação de resposta imediata, desde o primeiro toque até à conclusão da operação.

**REGRA ABSOLUTA:**

- NÃO criar novos módulos.
- NÃO acrescentar funcionalidades.
- NÃO eliminar funcionalidades existentes.
- NÃO acrescentar botões, cartões, menus, painéis ou elementos decorativos.
- NÃO modificar a identidade visual aprovada.
- NÃO substituir a arquitectura sem necessidade comprovada.
- NÃO alterar regras académicas, financeiras ou institucionais.
- NÃO introduzir animações desnecessárias.
- NÃO reorganizar os módulos de forma a desorientar os utilizadores.

É permitido corrigir, simplificar internamente, optimizar, reorganizar código, eliminar duplicações técnicas comprovadas e aperfeiçoar componentes existentes, preservando o seu comportamento.

A intervenção deve ser cirúrgica: **mesma plataforma, mesmas funcionalidades, mesma identidade — muito mais rápida e estável.**

## 2. VELOCIDADE INSTANTÂNEA AO TOQUE

Auditar todos os elementos interactivos existentes:

- Botões e respectivos estados.
- Menus laterais e superiores.
- Separadores e navegação entre páginas.
- Cartões interactivos.
- Formulários.
- Campos de pesquisa.
- Filtros.
- Listas e tabelas.
- Seletores de escolas, turmas, classes e períodos.
- Modais, diálogos e painéis.
- Calendários e horários.
- Uploads.
- Processos de autenticação.

### Comportamento obrigatório

Todo o toque ou clique deve produzir feedback visual imediato, idealmente no próximo frame de renderização, sem depender da conclusão de uma chamada à API.

O utilizador nunca deve ficar sem saber se a sua acção foi recebida.

Aplicar, conforme apropriado:

1. Redução de renderizações desnecessárias.
2. Optimização dos event handlers.
3. Eliminação de bloqueios na thread principal.
4. Navegação sem recarregamentos desnecessários.
5. Pré-carregamento selectivo de recursos essenciais.
6. Actualização optimista apenas em operações reversíveis e seguras.
7. Estados de carregamento discretos usando os componentes existentes.
8. Prevenção de cliques duplicados.
9. Cancelamento de requisições obsoletas.
10. Preservação do estado ao mudar entre páginas.

**Metas de referência, sujeitas à medição:**

- Feedback ao toque: idealmente inferior a 100 ms.
- INP: até 200 ms no percentil 75.
- LCP: até 2,5 segundos no percentil 75.
- CLS: até 0,1.
- Transições internas com dados disponíveis em cache: percepção praticamente instantânea.

Não simular operações concluídas quando ainda dependem do servidor.

## 3. MOTORES AUXILIARES DE PERFORMANCE

Implementar ou optimizar mecanismos auxiliares internos, reutilizando as ferramentas e serviços já presentes no projecto.

Não criar serviços autónomos, dependências ou infra-estrutura adicional sem necessidade técnica demonstrada.

### Motor A — Navegação Inteligente

- Optimizar o router existente.
- Carregar páginas e módulos sob demanda.
- Evitar downloads repetidos de código.
- Preparar selectivamente a próxima navegação provável.
- Manter os estados relevantes entre transições.
- Reduzir trabalho síncrono durante a abertura de páginas.

### Motor B — Gestão Inteligente de Dados

- Centralizar e normalizar as estratégias existentes de cache.
- Evitar requisições duplicadas.
- Partilhar resultados entre componentes autorizados.
- Aplicar paginação adequada.
- Invalidar cache após alterações relevantes.
- Utilizar actualização incremental quando suportada.
- Evitar consultas completas quando apenas um registo mudou.

Toda a cache deve respeitar a escola activa, o utilizador, a sessão e as permissões.

### Motor C — Processamento Auxiliar

- Identificar cálculos e transformações pesadas.
- Retirar da interface operações que bloqueiam a renderização.
- Aproveitar processamento assíncrono.
- Utilizar Web Workers quando tecnicamente justificado.
- Processar ficheiros extensos em blocos.
- Controlar concorrência para evitar sobrecarga.

Não criar filas paralelas desnecessárias nem comprometer a integridade transaccional.

### Motor D — Optimização de Consultas

- Auditar consultas Supabase/PostgreSQL.
- Identificar consultas lentas e repetidas.
- Analisar planos de execução.
- Rever índices existentes.
- Corrigir problemas de consultas N+1.
- Seleccionar apenas os campos necessários.
- Melhorar filtros, ordenações e paginação.
- Reutilizar consultas equivalentes quando seguro.
- Preservar integralmente as políticas RLS.

### Motor E — Gestão de Recursos

- Reduzir consumo excessivo de memória.
- Eliminar listeners e subscrições abandonadas.
- Evitar ciclos de renderização.
- Optimizar imagens, ícones e fontes existentes.
- Reduzir o JavaScript carregado inicialmente.
- Identificar dependências e bundles excessivos.
- Corrigir fugas de memória.
- Optimizar o comportamento em dispositivos modestos.

### Motor F — Sincronização e Actualizações

- Rever subscrições Realtime existentes.
- Evitar múltiplas subscrições equivalentes.
- Implementar reconexão controlada.
- Evitar actualizações repetitivas.
- Preservar a consistência dos dados.
- Impedir que dados antigos substituam dados recentes.
- Garantir actualização correcta após troca de escola.

Nenhum mecanismo auxiliar pode contornar autenticação, autorização ou auditoria.

## 4. OPTIMIZAÇÃO RIGOROSA DE TODOS OS MÓDULOS

Auditar todos os módulos existentes no repositório, incluindo os que se encontrem integrados ou parcialmente implementados.

| Área                          | Foco principal                                    |
| ----------------------------- | ------------------------------------------------- |
| Painel administrativo         | Carregamento de indicadores, cartões e relatórios |
| Escolas e configurações       | Acesso, alternância e persistência de contexto    |
| Alunos e matrículas           | Pesquisa, filtros, listagens e formulários        |
| Professores e funcionários    | Carregamento de perfis e operações de gestão      |
| Turmas, classes e disciplinas | Navegação, associações e consulta                 |
| Horários e calendários        | Renderização, filtros e transições                |
| Notas, avaliações e pautas    | Consultas, cálculos e geração                     |
| Presenças                     | Registo rápido e sincronização segura             |
| Propinas e pagamentos         | Consultas, validação e reconciliação              |
| Documentos escolares          | Preparação, geração e visualização                |
| Biblioteca                    | Pesquisa, empréstimos e listagens                 |
| Mensagens e avisos            | Carregamento, histórico e actualização            |
| Gestão de ficheiros           | Uploads, pré-visualização e progresso             |
| Transporte escolar            | Consultas, listas e actualizações                 |
| Aulas online e integrações    | Inicialização e chamadas externas                 |
| Portais e aplicação mobile    | Navegação, abertura e resposta ao toque           |

Aplicar optimizações apenas aos módulos realmente existentes.

### Organização interna

Verificar se cada módulo apresenta:

- Responsabilidades bem definidas.
- Componentes reutilizáveis.
- Serviços correctamente separados.
- Chamadas à API organizadas.
- Tratamento consistente de erros.
- Permissões centralizadas.
- Estados de carregamento previsíveis.
- Ausência de duplicação desnecessária.

Não alterar nomes, percursos de navegação ou estrutura funcional pública sem necessidade comprovada.

## 5. REFINAMENTO VISUAL — SEM ACRESCENTAR NADA

Realizar um aperfeiçoamento rigoroso da interface actual.

**Não criar um novo design. Não acrescentar elementos.**

Preservar:

- Logotipo SIGA Plus.
- Tipografia institucional.
- Identidade cromática.
- Ícones existentes.
- Componentes.
- Gradientes aprovados.
- Menus e estrutura de navegação.
- Layouts e funcionalidades.
- Animação institucional do logotipo.

### Ajustar exclusivamente

- Desalinhamentos.
- Espaçamentos inconsistentes.
- Alturas e larguras incorrectas.
- Sobreposição de elementos.
- Contrastes inadequados.
- Tabelas demasiado pesadas.
- Formulários com comportamento irregular.
- Modais mal dimensionados.
- Responsividade.
- Transições pouco fluidas.
- Estados visuais inconsistentes.
- Elementos que saltam durante o carregamento.

Melhorar as animações existentes, respeitando duração, suavidade e identidade visual.

Dar prioridade a transformações e propriedades que não provoquem cálculos de layout desnecessários.

Respeitar preferências de movimento reduzido.

**Resultado esperado:** visual praticamente idêntico ao aprovado, porém mais refinado, consistente e responsivo.

## 6. BACKEND, SUPABASE E CLOUDFLARE

Inspeccionar a arquitectura efectiva do projecto antes de qualquer alteração.

### Supabase

- Rever a latência de consultas.
- Avaliar índices existentes.
- Optimizar funções RPC.
- Analisar políticas RLS de elevado custo.
- Verificar gestão de sessões.
- Auditar consultas simultâneas.
- Reduzir tráfego redundante.
- Melhorar acesso ao Storage.
- Avaliar consumo e gestão do Realtime.

### Cloudflare

Quando os serviços estiverem efectivamente integrados:

- Rever configurações de cache.
- Optimizar entrega de ficheiros estáticos.
- Avaliar compressão e tamanho dos recursos.
- Reduzir cold starts, quando aplicável.
- Inspeccionar latência de Workers e funções.
- Rever chamadas entre frontend, API e Supabase.
- Melhorar políticas de entrega sem guardar indevidamente dados privados.

**Nunca colocar dados pessoais, académicos ou financeiros em cache pública.**

Não efectuar mudanças destrutivas no banco de dados ou na configuração de produção sem validação e autorização apropriadas.

## 7. MOBILE, TABLET E DESKTOP

Garantir fluidez e consistência nas interfaces existentes para Android, iOS, Windows e macOS.

Testar especialmente:

- Dispositivos com pouca memória.
- Ligações móveis lentas.
- Navegação por toque.
- Teclado virtual.
- Rolagem de listas extensas.
- Modais e formulários longos.
- Alternância entre páginas.
- Abertura de menus.
- Mudança de escola.
- Rotação do dispositivo.
- Zoom e tamanhos de ecrã distintos.

A experiência mobile deve ser tão cuidada e eficiente como a versão desktop.

Não construir novas versões da aplicação como parte desta operação.

## 8. SEGURANÇA E INTEGRIDADE INEGOCIÁVEIS

A optimização não pode enfraquecer:

- Multi-tenancy.
- Row Level Security.
- RBAC.
- MFA.
- Gestão de sessões.
- Validação de pagamentos.
- Registo de presenças.
- Integridade das notas.
- Fecho de períodos.
- Auditoria de alterações.
- Isolamento de dados entre escolas.

Nunca utilizar actualização optimista para apresentar como concluídos pagamentos, notas finais, operações de auditoria ou alterações críticas sem confirmação autorizada do servidor.

A performance nunca se sobrepõe à segurança ou à integridade institucional.

## 9. AUDITORIA AUTOMÁTICA E TESTES

Executar a auditoria por etapas.

### Fase 1 — Diagnóstico

Inventariar módulos, identificar gargalos e medir o
