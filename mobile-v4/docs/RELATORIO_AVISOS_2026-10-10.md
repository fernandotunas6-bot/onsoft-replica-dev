# Avisos pessoais — Mobile V4

A página existente `avisos` passa a consultar a tabela canónica `notifications` do Sga. Nenhuma migração, escrita em dados ou mudança visual/CSS foi necessária.

## Consulta autenticada

`GET /api/mobile-v4/schools/:schoolId/notifications?role=aluno|professor` usa identidade verificada, vínculo activo, papel seleccionado e as permissões existentes do servidor. Ambas as consultas privilegiadas filtram `school_id`, `user_id` e `channel=in_app`. A consulta devolve os 50 avisos mais recentes, ordenados por data e ID, e conta todas as não lidas da escola (`read_at IS NULL` e estado diferente de `read`). O contador pode exceder a lista recente; não representa notificações não lidas de outras escolas.

O servidor recusa erros de base de dados e respostas inconsistentes; não transforma uma integração ausente em uma lista vazia. O contrato HTTP valida o âmbito, campos, IDs, datas, limites e duplicados. Payloads e links da aplicação principal não são expostos nem executados no Mobile.

## Interface

Preserva a página e os componentes visuais existentes. Mostra título, texto, data/hora de Luanda e estado lido/não lido. Inclui pesquisa, filtro não lidas, actualização explícita e mensagens de erro/carregamento/lista vazia. O refresh preserva filtros; mudar de conta, escola ou papel cancela a consulta e impede mostrar a resposta anterior. Os textos usam o escape do React, sem HTML injectado.

Consultar **não** marca automaticamente avisos como lidos. Não foram implementadas escritas, push, serviço de entrega, paginação além dos 50 recentes ou navegação pelos links de payload.

## Testes e estado de publicação

- 196 testes Mobile aprovados, incluindo nove novos testes de contrato/interface e resposta tardia.
- 3.363 testes do repositório aprovados, com 19 ignorados; lint raiz sem erros (47 avisos existentes).
- 33 testes nos dois ficheiros de HTTP/notificações do servidor, incluindo filtro por utilizador/escola, respostas externas, falhas da base e encaminhamento para ambos os perfis.
- 107 verificações da projecção Mobile em PostgreSQL local, incluindo sete novas para avisos: 50 recentes/60 não lidas, ordenação estável, dois marcadores de leitura, escola/utilizador e falha da base. Usa o leitor real e um adaptador SQL parametrizado; não valida PostgREST/Auth/RLS remoto.
- Chromium com dados controlados: 390/768/1280 px, textos longos sem overflow, pesquisa e refresh que preserva filtros; classes existentes academic/checkline, sem alterar CSS. Não é um percurso com conta real.
- Tipos Mobile e raiz, três builds Mobile, build raiz, lint e formatação verificados. A rota gerada foi actualizada pelo build antes da verificação final de tipos.
- Testes com dados controlados são ensaios; não equivalem a validação positiva com uma conta real Sga nem à verificação remota de RLS/PostgREST.
- Sem alterações Supabase ou migrações de produção; sem publicação do portal principal.

A implementação foi publicada como preview conectado `361b8072-e50d-4d6b-ad7a-eefd58168b40`, aplicação `586d9a268d7b799c61c100d73c2e5fbc57768d41`, conclusão 10/10/2026 12:04:52 UTC. O domínio `m.portal-siga.com` foi actualizado exclusivamente pelo destino `PAGES_ORIGIN` do Worker Mobile.

O preview e o domínio final passaram nas comparações byte a byte dos quatro assets e nos testes HTTP de notificações: sessão ausente/token inválido 401, origem externa 403, método incorrecto 405 e no-store. Login/reload do preview e domínio final a 390/768/1280 px, com respostas HTTP reais via Node, sem erros JS/overflow; não é autenticação positiva com credenciais reais.

Os workflows da aplicação passaram: Mobile `38050586875` e CI geral `38050586914`. A configuração publicada, os limites e a reversão para `c734a903` estão em `CLOUDFLARE_PAGES.md`. A estrutura actual de `public.notifications` foi confirmada por SELECT de metadados no Sga; não foram lidos conteúdos de notificações pessoais nesse procedimento, nem feitas escritas ou migrações.

Faltam testes positivos com contas reais, leitura para além dos 50 recentes, marcação como lida, push/entrega e navegação por destinos autorizados. Não declarar estes recursos concluídos.

No domínio final, os dez endpoints de consulta recusaram sessão ausente/token inválido (401/no-store). O portal principal manteve o mesmo HTML após normalizar apenas timestamps SSR; rotas existentes e deployment canónico Pages preservados.
