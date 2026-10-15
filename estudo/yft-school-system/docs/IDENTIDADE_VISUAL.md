# Identidade visual — conservação

Registo do que a interface usa e porquê, para que uma alteração futura não
desfaça decisões sem saber que existiam. Actualizar quando a paleta ou a
tipografia mudarem.

## Paleta

Toda a cor vem de `lib/core/theme/app_colors.dart`. Nenhum ecrã deve escrever
um `Color(0x…)` à solta.

Os campos de `AppColors` **já não são `const`**: a cor principal e o modo
escuro mudam em tempo de execução (ecrã Aparência, `/aparencia`).
`AppColors.apply(accent:, dark:)` troca a paleta e `AppRoot` marca a árvore
inteira para reconstruir. Por isso um widget que leia `AppColors.x` não pode
ser `const`.

### Marca (fixa)

Gradiente do logótipo SIGA Plus, em `AppColors.brandGradient`:
`#FF8A3D → #FF3D8B → #9B5CFF → #3D7BFF`. Usado no "S" (`BrandMark`) e em
"Plus" (`BrandWordmark`). Não serve de fundo a texto.

### Cor principal (escolha do utilizador)

| id | Nome | Valor | Texto sobre ela |
|---|---|---|---|
| `blue` (por omissão) | Azul | `#2563EB` | branco (5,17) |
| `violet` | Roxo | `#7C3AED` | branco (5,70) |
| `orange` | Laranja | `#F97316` | tinta `#1E2633` |
| `teal` | Verde-água | `#14B8A6` | tinta `#1E2633` |
| `slate` | Cinza | `#64748B` | branco (4,76) |

**Texto e ícones sobre `primary` usam sempre `AppColors.onPrimary`**, que é
calculado: branco se passar 4,5 contra a cor, senão a tinta escura. Nunca
escrever `Colors.white` nem `AppColors.secondary` sobre o primário.

### Neutros

| Papel | Claro | Escuro | Onde aparece |
|---|---|---|---|
| `background` | `#F6F7FB` | `#0E131A` | fundo das páginas |
| `surface` | branco | `#171E28` | cartões, folhas, menu |
| `border` | `#E6E9F0` | `#263040` | contornos finos |
| `secondary` / `textPrimary` | `#1E2633` | `#E8ECF2` | títulos e corpo |
| `textSecondary` | `#6B7585` | `#98A3B3` | legendas |
| `ink` | `#1E2633` | `#243044` | superfícies escuras com texto branco |
| `primaryOnLight` | `#1E40AF` | — | recibos e PDF (papel é sempre branco) |
| `error` | `#E5484D` | — | validações |
| `success` | `#10B981` | — | início de período, confirmações |

`secondary` passou a ser **cor de texto** (claro no escuro). Cartões e
etiquetas escuras com texto branco usam `ink`.

### Fundos do painel

`AppColors.backdrops` (aurora, mist, sunset): gradiente suave por trás do
cabeçalho do Início, a 28 % (22 % no escuro).

### Porque mudou

A paleta anterior (`#93ACCB`, azul acinzentado) substituíra o lima do autor.
Em Outubro de 2026 adoptou-se o estilo do mockup SIGA Plus: azul vivo,
gradiente de marca, modo escuro e cor principal à escolha.

## Tipografia

Sem negrito. O peso máximo é `FontWeight.w600`, e foi aplicado às 178
ocorrências de `bold`, `w700`, `w800` e `w900` que o original tinha. A
hierarquia faz-se por tamanho e por cor — `textPrimary` contra
`textSecondary` —, não por peso.

| Uso | Peso |
|---|---|
| Títulos e números em destaque | `w600` |
| Rótulos e botões | `w500` |
| Corpo | `w400` |

## Regra de alteração

Acrescentar uma cor principal é acrescentar uma `AccentOption` a
`AppColors.accents`; `onPrimary` ajusta-se sozinho. Mudar os neutros é mexer
nos dois ramos de `AppColors.apply`. Antes de fechar uma mudança de cor, voltar a correr a
verificação de contraste e actualizar a tabela acima — uma paleta que não
passa em AA é uma regressão, não uma escolha estética.
