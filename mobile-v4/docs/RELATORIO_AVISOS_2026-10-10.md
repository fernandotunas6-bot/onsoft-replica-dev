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
- Tipos Mobile e raiz, três builds Mobile, build raiz, lint e formatação verificados. A rota gerada foi actualizada pelo build antes da verificação final de tipos.
- Testes com dados controlados são ensaios; não equivalem a validação positiva com uma conta real Sga nem à verificação remota de RLS/PostgREST.
- Sem alterações Supabase ou migrações de produção; sem publicação do portal principal.

Esta implementação está na branch de desenvolvimento da PR #116. O domínio `m.portal-siga.com` continua fixado no deployment `c734a903` / aplicação `ab7f6262`; **os novos Avisos ainda não foram publicados**. Uma promoção deve registar o novo deployment/SHA, validar o preview e actualizar exclusivamente o destino do Worker Mobile conforme `CLOUDFLARE_PAGES.md`. Não declarar o novo endpoint disponível no domínio enquanto isso não ocorrer.
