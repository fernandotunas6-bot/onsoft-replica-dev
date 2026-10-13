# Sistema visual — SIGA Plus Flutter

Fonte: ecrãs aprovados (12 ecrãs do fluxo, grelha de serviços, página de turma,
conceito de transporte e wordmark). Tudo o que está aqui vive em `lib/design.dart`;
nenhum ecrã inventa medidas próprias.

## Medidas

| Token | Valor | Onde |
|---|---|---|
| `Sg.gutter` | 20 | margem lateral de todas as páginas |
| `Sg.gapXs/S/…/Xl` | 4 · 8 · 12 · 16 · 24 · 32 | grelha de 4 pt |
| `Sg.rField` | 14 | campos, botões, chips de estado |
| `Sg.rCard` | 18 | cartões e tiles de serviço |
| `Sg.rSheet` | 28 | bottom sheets |
| `Sg.tile` | 44 | quadrado do ícone (ícone a 50 %) |
| `Sg.control` | 52 | altura de campo e botão principal |
| `Sg.navHeight` | 64 | barra inferior, rótulos sempre visíveis |
| `Sg.maxContent` | 440 | largura máxima do login; 560 no shell |

Tipografia: `display` 30/700, `title` 26/700, `section` 17/700, `itemTitle`
15.5/600, `body` 15, `caption` 13, `tiny` 11.5/600 — com o mesmo
`letterSpacing` negativo dos títulos do desenho aprovado.

Cor: primária `#2f62f5` (personalizável em Aparência), gradiente da marca
`#7b5bff → #e23fa6 → #ff8a3d`, superfícies claro `#ffffff/#f5f6f8/#e9ecf1` e
escuro `#0f131a/#171b24/#252b37` em `SigaPalette` (ThemeExtension), por isso
claro e escuro são explícitos e não derivados por aproximação.

Os acentos dos ícones de disciplina, serviço e aviso saem de um hash estável do
nome: a mesma disciplina mantém a mesma cor entre sessões e dispositivos.

## Componentes partilhados

`IconTile`, `SigaCard`, `SigaRow`, `SectionHeader`, `FilterChips`,
`SearchField`, `InitialsAvatar`, `StateBadge`, `StateMessage`, `Footnote`,
mais `BrandMark`, `Brand`, `BrandWash` e `StepBar` na identidade.

## Fidelidade e limites

Os ecrãs seguem o desenho aprovado na estrutura, nas medidas e nos estados.
Onde o desenho mostra dados ou acções que este cliente ainda não pode garantir,
a página mantém a forma mas diz a verdade, em vez de mostrar exemplo como real:

- **Fotografias de perfil**: substituídas por iniciais; não há contrato de fotos.
- **Barras de progresso por disciplina**: removidas; não existe progresso no
  catálogo autorizado, e uma percentagem inventada seria lida como avaliação.
- **Botão «Entrar» na aula**: removido do cartão de próxima aula; o link de
  sala exige integração verificada (Zoom/Meet/BBB) e emissão no servidor.
- **Selector de escola no login**: visível, mas abre a explicação — a lista
  pública de escolas precisa de contrato com protecção contra enumeração.
- **ID da escola / B.I.**: o campo aceita e-mail institucional; o resolvedor
  por ID/B.I. aguarda contrato móvel com escola inequívoca.
- **Google, Microsoft e Apple**: visíveis, mas explicam o que falta (PKCE,
  callback autorizado, migração de sessão) em vez de simular entrada.
- **Faltas, Propinas, Recibos, Biblioteca, Documentos, Aulas online, WhatsApp,
  Google**: abrem a página «Em preparação» com o que o serviço exige. O desenho
  pede que cada serviço abra uma página funcional, nunca um atalho sem destino.
- **Transporte**: reproduz o conceito aprovado com os rótulos «Conceito» e
  «Simulação», trajecto ilustrativo e estado «A aguardar GPS». Não lê, não
  guarda e não anima nenhuma coordenada real.
- **«Favoritas» nas mensagens**: não existe no contrato; os filtros são
  «Todas» e «Não lidas», com o contador real de não lidas.
- **Participantes da turma**: continuam fora, por falta de avaliação de
  privacidade por perfil.

Aparência (tema, plano de fundo, cor principal, movimento reduzido e ícones
modernos) fica no dispositivo, em `SharedPreferences`, e não toca no perfil nem
nas definições da escola.
