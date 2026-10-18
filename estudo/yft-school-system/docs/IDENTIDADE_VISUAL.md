# Identidade visual — conservação

Registo do que a interface usa e porquê, para que uma alteração futura não
desfaça decisões sem saber que existiam. Actualizar quando a paleta ou a
tipografia mudarem.

## Paleta

Toda a cor vem de `lib/core/theme/app_colors.dart`. Nenhum ecrã deve escrever
um `Color(0x…)` à solta: 40 ficheiros referenciam `AppColors.primary`, e é
por isso que trocar a marca é uma linha.

| Papel | Valor | Onde aparece |
|---|---|---|
| `primary` | `#93ACCB` | fundo de botões, realces, cabeçalhos |
| `primaryOnLight` | `#2F4A66` | texto da mesma família sobre branco (recibos, PDF) |
| `secondary` | `#2B3440` | barras escuras, texto sobre o primário |
| `background` | `#F7F8FA` | fundo das páginas |
| `surface` | branco | cartões, folhas, diálogos |
| `error` | `#D96A6A` | validações e estados de falha |
| `textPrimary` | `#2B3440` | corpo |
| `textSecondary` | `#75828F` | legendas e apoio |

### Porque não é o lima do autor

O original era `#C7FF00`, um lima saturado, com gradiente para `#B5E600`.
Ocupava o ecrã inteiro no login e obrigava a texto preto para ser legível.
A paleta actual mantém a mesma função — distinguir o que é accionável — com
muito menos ruído.

### Contraste, verificado

| Combinação | Rácio | Mínimo WCAG AA |
|---|---|---|
| `textPrimary` sobre `primary` | 5,40 | 4,5 |
| `primaryOnLight` sobre branco | 9,16 | 4,5 |

**Branco sobre `primary` dá 2,33 e não passa.** Texto sobre o primário é
sempre escuro. Se o primário for aclarado, reconfirmar a primeira linha;
se for escurecido abaixo de 4,5, o texto sobre ele tem de passar a branco e
a tabela tem de ser refeita.

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

Mudar a marca é mudar `primary` e o segundo tom de `primaryGradient`. Tudo
o resto segue. Antes de fechar uma mudança de cor, voltar a correr a
verificação de contraste e actualizar a tabela acima — uma paleta que não
passa em AA é uma regressão, não uma escolha estética.
