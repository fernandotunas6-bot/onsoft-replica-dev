# Validação da pasta Mobile V4

- 51 testes aprovados: 27 de domínio/acesso, 7 React/jsdom, 12 de calendário/importação de chat e 5 do adaptador HTTP.
- TypeScript estrito e build Vite aprovados.
- ESLint da pasta validado; formatação Prettier verificada.
- PWA: manifesto/ícones/âmbito, exclusão de API, POST e origens externas verificados por execução do service worker gerado em contexto de teste.
- Ficheiros de referência preservados byte a byte face aos anexos recebidos.
- A publicação de produção do repositório usa pushes para main; esta entrega fica numa branch de funcionalidade e PR em rascunho. Não foi feito merge, deploy, SQL ou acesso a dados de escola.

Não executados: suíte completa do SIGA raiz, build de Windows/macOS, QA visual/browser ou dispositivos Android/iOS, auth/RLS reais, acessibilidade assistiva e teste de instalação da PWA num dispositivo. O CI raiz não inclui a suíte própria desta pasta; executá-la com `npm ci --prefix mobile-v4`, `npm --prefix mobile-v4 run lint`, `npm --prefix mobile-v4 test`, `npm --prefix mobile-v4 run build` e `npm --prefix mobile-v4 run check:pwa`.

## Aceite antes da integração

Confirmar visual a 320/360/390/430/768 px; teclado e zoom; foco e leitor de ecrã; cache sem dados privados; sessão/MFA/grants; turmas atribuídas; notas publicadas/rascunho; períodos encerrados; revisões concorrentes; duas escolas; revogação de sessão; troca de contexto durante leitura/escrita; documentação de API alinhada com os serviços existentes.

Extensão validada: navegação para páginas completas, perfil com mapa anual, menu de ecrã inteiro, footer com links internos, conversa por contacto, separação da presença docente/aluno, dias mistos/pendentes, calendário bissexto e importação rejeitada fora do contexto escolar. A revisão visual em browser/dispositivo continua pendente.
