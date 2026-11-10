# Contribuir (equipa)

Regras para quem altera o código do SIGA Plus. O repositório é privado; as regras completas
estão em `AGENTS.md` e em `docs/agents/` na raiz.

## Antes de começar

1. Ler `AGENTS.md`, a [arquitectura do ecossistema](/arquitetura/) e, para SQL,
   `docs/agents/DATABASE_RULES.md`. A base ligada é a de **produção** das escolas.
2. Trabalhar num ramo próprio, com alterações pequenas e reversíveis. Não reescrever
   histórico já publicado.
3. Respeitar as fronteiras: WEB vende, ADMIN controla, SIGA trabalha, PayFlow cobra, DOC
   explica. Não partilhar componentes de interface entre apps.

## Verificar antes de pedir revisão

Na raiz (Node 24):

```sh
npm run siga:check   # inventário de módulos e navegação
npm run lint
npm run typecheck
npm test
npm run build
```

Nas outras apps, os mesmos passos com `npm --prefix painel/<app>`: `run lint` e
`run build` (WEB, ADMIN, DOC) e `test` (PayFlow).

## Regras que não se negociam

- Nada aparece como pago sem confirmação do fornecedor; o navegador nunca confirma pagamentos.
- Uma escola nunca vê dados de outra: isolamento no servidor e no RLS, não só na interface.
- Esconder um botão não é segurança; a autorização vive no servidor.
- Não aplicar migrações do Lovable na base SGA. SQL correcto: `npm run siga:sql`.
- Não remover funcionalidades sem destino; não afirmar que algo foi testado sem prova.
