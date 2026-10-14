# Análise visual — Flutter contra as maquetas (14/10/2026)

## O que foi reunido

O trabalho Flutter estava espalhado por vários ramos. Este ramo traz a pasta
`mobile-flutter/` completa do mais avançado, `ccr-6a21e4bf-flutter-ui`
(d015a316). Esse ramo já contém `feat/siga-flutter-motion-2026` e
`ccr-6a21e4bf-mw5g15`.

| Ramo | Último commit | Conteúdo |
| --- | --- | --- |
| `ccr-6a21e4bf-flutter-ui` | d015a316, 13/10 | design system, ícones Fluent, demonstração, APK, Inter, contratos e backend |
| `feat/siga-flutter-motion-2026` | 67b5fc91, 13/10 | abertura do S, chat paginado, avisos/propinas/documentos (contido acima) |
| `ccr-6a21e4bf-mw5g15` | 9af15ab0, 13/10 | cliente da `main` com analyze limpo (contido acima) |
| `feat/siga-plus-mobile-v4-isolated` | 0249dab7, 12/10 | Mobile V4 React e Worker do domínio `m.portal-siga.com` |

Só foi trazida a pasta `mobile-flutter/`. Os ficheiros do Mobile V4 em `src/`
(rotas `/api/mobile-v4`, testes) **não** vieram, porque a `main` está ligada ao
Lovable e à produção. Por isso, `scripts/build-worker.mjs` (que importa
`src/features/mobile-v4`) só funciona no ramo `ccr-6a21e4bf-flutter-ui`.

Validado neste ramo, com Flutter 3.35.7: `flutter analyze` sem avisos,
39 testes Dart, `flutter build web` da demonstração; Node: typecheck,
96 testes de contratos e 39 testes do backend.

## Capturas

Demonstração (`lib/main_demo.dart`), Chromium 390×844.

- Entrada (abertura do S, apresentação, escola): `visual/00-entrada.jpg`
- Aluno, claro: `visual/01-aluno-claro.jpg`. Aparecem, por ordem: Início,
  Disciplinas, Calendário, Mensagens, Mais, Turmas, Tarefas, Avisos, Propinas,
  Notas, Documentos, Transporte e Aparência.
- Aluno, escuro: `visual/02-aluno-escuro.jpg`
- Professor, claro: `visual/03-professor-claro.jpg`
- Referência: `visual/maquetas-referencia.jpg` e `visual/wordmark-siga-plus.jpg`

## Comparação com as maquetas

**Já próximo da maqueta:** escolha da escola em painel inferior, Início (aula
agora + Entrar, disciplinas, próximas actividades), Disciplinas com filtros em
pílula, Calendário com Agenda/Horários e faixa semanal, Mensagens com «Não
lidas» e contador, Aparência (tema, plano de fundo, cor principal,
interruptores) e barra inferior com cinco separadores.

**Diferenças a corrigir (por prioridade):**

1. **Abertura (maquetas 1 a 3).**
   - Durante a transição, «Seja bem-vindo» e «SIGA Plus» desenham-se um por
     cima do outro, com o subtítulo também sobreposto (`00-entrada.jpg`).
     Deviam trocar sem se sobrepor.
   - O «S» aparece desfocado no início.
   - Em tema escuro a abertura continua branca.
   - O wordmark ainda não é o fornecido: falta «SIGA» em azul-escuro
     (#1B2236) e «Plus» em gradiente azul → violeta → rosa → laranja.
2. **Login (maqueta 5).** Não se vê na demonstração: a demo salta o login.
   Falta rever `pages/login_page.dart` com o selector de escola, o campo
   «E-mail, ID da escola ou B.I.» e os botões Google/Microsoft/Apple.
3. **Escolha da escola (maqueta 6).**
   - Mostra a inicial em vez do brasão da escola.
   - Falta a localidade («Bié, Angola») e a lista de perfis
     («Aluno, Professor, Encarregado»).
   - O brasão depende de um campo de logótipo no contrato da sessão.
4. **Mensagens (maqueta 10).**
   - A linha secundária diz «2 mensagens por ler» em vez de mostrar a última
     mensagem.
   - Falta a hora/dia à direita.
   - Os avatares são iniciais (decisão: não inventar fotografias).
5. **Disciplinas (maqueta 8).** As barras de progresso não existem, porque
   não há dados de progresso reais. Fica assim até a API os ter.
6. **Calendário (maqueta 9).** O botão «+» e o intervalo «Almoço» não existem.
   O «+» só deve aparecer quando houver criação de eventos.
7. **Menu lateral (maqueta 11).** Existe (`pages/side_menu.dart`), mas o
   separador «Mais» abre a grelha de serviços. Falta confirmar como se chega
   ao menu (avatar no Início) e alinhar a lista com a maqueta: perfil, notas,
   faltas, propinas, recibos, biblioteca, documentos, definições, modo
   escuro e sair.
8. **Pormenores de texto e formato.**
   - «Média publicada: 14.6» devia usar vírgula: 14,6.
   - Em Propinas, as datas aparecem como 2026-10-10 e o título «Propina de
     Outubro» parte em duas linhas por causa da etiqueta.
   - Em Tarefas, a hora do prazo cai sozinha na linha seguinte.
   - No perfil Professor, o Início diz «Bem-vindo, Ana!» e «Aula agora/Entrar»
     com os dados do aluno (dados da demonstração).
   - O sino do Início não mostra o ponto vermelho da maqueta.

## Publicar para ver no browser / telemóvel (Cloudflare)

A demonstração não precisa de servidor nem de chaves: é publicada num
projecto Pages próprio, **`siga-plus-flutter-demo`**. Não altera
`m.portal-siga.com`, o Worker do domínio nem o projecto `siga-plus-mobile-v4`.
As páginas levam `noindex` (`web/_headers`).

**Da máquina local** (Flutter 3.35.7 e Node instalados):

```sh
cd mobile-flutter
export CLOUDFLARE_API_TOKEN=...   # token com «Cloudflare Pages: Edit»
export CLOUDFLARE_ACCOUNT_ID=701800d01d428c5141fa1fdb60ee01ae
npm run publish:demo              # compila e publica; imprime o URL
```

O URL fica `https://<ramo>.siga-plus-flutter-demo.pages.dev`. Na primeira
vez, o script cria o projecto.

**Automaticamente pelo GitHub:** basta acrescentar os segredos
`CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` em Settings → Secrets and
variables → Actions. Depois, cada push para `main`,
`feat/siga-flutter-motion-2026` ou `claude/flutter-**` publica a demonstração
(job `demo-web`). O endereço aparece no resumo da execução. Sem os segredos,
o job não publica e diz porquê.

**Fluxo sugerido:** trabalhar localmente, fazer commit e push para este ramo,
esperar a CI (analyze, testes e build) e abrir o URL no telemóvel.

**A app institucional** (Supabase e dados reais) não vai para este projecto.
A API `/api/mobile-v4` só é servida pelo Worker de `m.portal-siga.com` e
recusa outras origens. Promovê-la segue o processo do Worker do domínio:
`docs/mobile-v4-history/CLOUDFLARE_PAGES.md`, preview fixo e depois
`PAGES_ORIGIN`.
