# SIGA Plus Mobile V4

Aplicação React + TypeScript isolada em `mobile-v4/` dentro do repositório SIGA Plus. Não modifica a aplicação raiz, SQL, rotas, autenticação existente, configurações de deploy ou produção.

## Executar

Node 24. Dentro de `mobile-v4/`:

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

Porta exclusiva 5180; não colide com as cinco aplicações do ecossistema.

## Fonte e preservação

Os anexos efectivamente recebidos foram `index.html` e `REFINAMENTO.md`, não um ZIP. `reference/original.html` e `reference/REFINAMENTO.md` são cópias intactas desses anexos. O CSS e os SVGs foram extraídos directamente do primeiro modelo: navegação de quatro ícones, gradientes atmosféricos, selector escolar, painéis inferiores e aspecto da página inicial. As alterações CSS estão num bloco aditivo no final de `src/styles.css`.

O selector foi mantido por instrução expressa do utilizador. Esta aplicação isolada não altera o comportamento single-school da aplicação principal.

## Percursos disponíveis

1. Início → Meu dia → Testar como professor → Seleccionar escola → Escola de teste A.
2. Aulas → Fazer chamada → confirmar presentes/ausentes/justificados → Lançar notas → aluno → nota 0–20 → guardar ou publicar.
3. Plano de aula → objectivos/materiais → guardar → editar.
4. Tarefas → publicar com prazo → alternar para Aluno → seleccionar a mesma escola → Trabalhos → entregar/actualizar → alternar para Professor → rever entregas.
5. Aluno → horário, disciplinas, notas publicadas, presenças, avisos, mensagens e pedido de documento.
6. Professor/aluno → mensagens para contactos académicos → trocar de perfil → consultar recebidas.
7. Conta → Aparência → tema e três fundos; preferências locais são as únicas informações persistidas no browser.
8. Início → criar projecto local; lista, pesquisa, favorito, cópia, edição e exclusão. Não é um gerador IA e não cria entidades no SIGA.

Os registos académicos de teste vivem em memória; um recarregamento elimina-os. Trocar de escola limpa imediatamente a vista, os projectos e os formulários. Os registos da demonstração permanecem separados por escola no serviço de teste, para verificar os percursos entre professor/aluno. As escolas de teste só aparecem após escolha explícita da demonstração.

## Arquitectura

- `src/components`: SVGs originais, painel com foco/teclado, interfaces académicas.
- `src/domain`: contratos e regras de autorização/validação.
- `src/services/demo.ts`: serviço de teste com dados fictícios e mutações.
- `src/services/api.ts`: adaptador HTTP para o contrato proposto, desactivado no entrypoint.
- `src/App.tsx`: shell e navegação, sessão/contexto, carregamento, estados e cancelamento.
- `tests`: regras académicas, acesso por escola, integração React e adaptador HTTP.
- `scripts/pwa.mjs`: gera service worker versionado após o build.
- `docs/PLANO.md`: análise e sequência de implementação.
- `docs/INTEGRACAO.md`: contrato e critérios para ligação real.

## PWA

Manifesto, PNGs 192/512 e service worker de âmbito relativo. Servir `dist/` em HTTPS ou localhost. O service worker guarda apenas ficheiros do shell compilado; não guarda sessão, chamadas API, notas ou presenças. A instalação depende do suporte do browser. Em Android, usar a opção Instalar do browser ou da conta quando disponibilizada; em iOS, Partilhar → Adicionar ao ecrã principal. Um pacote ZIP ou `file://` não activa a PWA.

Sem ligação, o shell abre após uma primeira visita bem-sucedida; dados institucionais ficam indisponíveis e não há fila de escritas offline. Dados reais nunca devem ser convertidos em sucesso local fictício.

## Limites desta versão

Sem autenticação real, endpoints implementados no SIGA, RLS novo, SQL executado, upload de ficheiros, emissões oficiais, notificações push ou deploy. Conectores, suporte, comunidade, pedidos de vínculo e acções de desenvolvimento IA conservam painéis de informação e indicam a integração pendente. Não afirmar segurança de produção a partir das guardas do browser: a autorização efectiva é do servidor existente.

Revisão visual em dispositivos reais, TalkBack/VoiceOver, teclado virtual, zoom 200%, contraste e desempenho dos gradientes ainda pendente. Os testes React usam jsdom; não equivalem a validação visual Android/iOS.
