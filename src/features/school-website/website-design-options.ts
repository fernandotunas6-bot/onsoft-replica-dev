import type { Appearance } from "../../../painel/escolas/src/design.mjs";
export type DesignControl = {
  key: keyof Appearance;
  label: string;
  values: Record<string, string>;
};
export const designOptionGroups: {
  title: string;
  description: string;
  controls: DesignControl[];
}[] = [
  {
    title: "Cabeçalho e identidade",
    description: "Superfície, navegação, marca e apresentação dos submenus.",
    controls: [
      {
        key: "headerSurface",
        label: "Superfície do cabeçalho",
        values: {
          original: "Actual",
          solid: "Sólida",
          glass: "Translúcida com desfoque",
          tinted: "Cor suave",
        },
      },
      {
        key: "headerPosition",
        label: "Posição do cabeçalho",
        values: {
          original: "Actual",
          sticky: "Fixo ao navegar",
          static: "Acompanhar a página",
        },
      },
      {
        key: "headerDensity",
        label: "Altura do cabeçalho",
        values: {
          original: "Actual",
          compact: "Compacta",
          comfortable: "Confortável",
        },
      },
      {
        key: "utilityBar",
        label: "Barra de atalhos superior",
        values: {
          original: "Actual",
          visible: "Visível",
          hidden: "Oculta",
        },
      },
      {
        key: "header",
        label: "Comportamento do logótipo",
        values: {
          contextual: "Compacto nas páginas internas",
          full: "Marca completa em todas as páginas",
        },
      },
      {
        key: "brandMode",
        label: "Formato da marca",
        values: {
          original: "Logótipo institucional",
          text: "Logótipo em texto",
        },
      },
      {
        key: "brandStyle",
        label: "Estilo da marca textual",
        values: {
          original: "Actual",
          clean: "Limpo",
          serif: "Editorial",
          boxed: "Em moldura",
          gradient: "Sublinhado de duas cores",
        },
      },
      {
        key: "menuStyle",
        label: "Estilo dos submenus",
        values: {
          original: "Actual",
          plain: "Simples",
          soft: "Fundos suaves",
          outlined: "Contornos discretos",
        },
      },
    ],
  },
  {
    title: "Tipografia e texto",
    description:
      "Famílias de leitura e composição; usa fontes do dispositivo sem novos serviços externos.",
    controls: [
      {
        key: "fontBody",
        label: "Tipo de letra do corpo",
        values: {
          original: "Actual",
          system: "Sistema — sem serifa",
          humanist: "Humanista",
          editorial: "Editorial — com serifa",
        },
      },
      {
        key: "fontHeading",
        label: "Tipo de letra dos títulos",
        values: {
          original: "Actual",
          system: "Sistema — sem serifa",
          editorial: "Editorial — com serifa",
        },
      },
      {
        key: "textScale",
        label: "Tamanho do texto",
        values: {
          original: "Actual",
          comfortable: "Confortável",
          large: "Ampliado",
        },
      },
      {
        key: "lineHeight",
        label: "Espaçamento entre linhas",
        values: {
          original: "Actual",
          compact: "Compacto",
          relaxed: "Generoso",
        },
      },
      {
        key: "textAlign",
        label: "Alinhamento textual",
        values: {
          original: "Actual",
          left: "À esquerda",
          center: "Centrado",
          justify: "Justificado nos artigos",
        },
      },
      {
        key: "textMeasure",
        label: "Largura de leitura",
        values: {
          original: "Actual",
          narrow: "Curta — 55 caracteres",
          wide: "Ampla — 78 caracteres",
        },
      },
      {
        key: "headingStyle",
        label: "Tratamento dos títulos",
        values: {
          original: "Actual",
          plain: "Simples",
          underline: "Sublinhado discreto",
        },
      },
      {
        key: "letterSpacing",
        label: "Espaçamento dos títulos",
        values: {
          original: "Actual",
          tight: "Próximo",
          open: "Aberto",
        },
      },
    ],
  },
  {
    title: "Estrutura e superfícies",
    description: "Enquadramento do conteúdo, cartões, transparência e respiro entre secções.",
    controls: [
      {
        key: "contentWidth",
        label: "Largura do conteúdo",
        values: {
          original: "Actual",
          narrow: "Contida",
          wide: "Ampla",
        },
      },
      {
        key: "sectionSpacing",
        label: "Espaço entre secções",
        values: {
          original: "Actual",
          compact: "Compacto",
          airy: "Generoso",
        },
      },
      {
        key: "radius",
        label: "Cantos e botões",
        values: {
          original: "Actuais",
          rounded: "Arredondados",
          square: "Rectos",
        },
      },
      {
        key: "cardStyle",
        label: "Estilo dos cartões",
        values: {
          original: "Actual",
          flat: "Plano",
          elevated: "Elevado com sombra",
          bordered: "Contorno fino",
        },
      },
      {
        key: "panelSurface",
        label: "Superfície dos painéis",
        values: {
          original: "Actual",
          solid: "Sólida",
          glass: "Translúcida com desfoque",
        },
      },
    ],
  },
  {
    title: "Imagens e faixas",
    description:
      "Molduras, proporções e camadas decorativas que preservam os conteúdos e ligações.",
    controls: [
      {
        key: "photos",
        label: "Apresentação das imagens",
        values: {
          original: "Actual",
          clean: "Limpa",
          framed: "Moldura de cor",
        },
      },
      {
        key: "imageShape",
        label: "Forma das imagens",
        values: {
          original: "Actual",
          square: "Recta",
          rounded: "Arredondada",
          arch: "Arco",
        },
      },
      {
        key: "imageRatio",
        label: "Proporção das imagens",
        values: {
          original: "Actual",
          landscape: "Horizontal — 4:3",
          portrait: "Vertical — 4:5",
        },
      },
      {
        key: "bandStyle",
        label: "Estilo das faixas",
        values: {
          original: "Actual",
          solid: "Cor sólida",
          gradient: "Duas cores em gradiente",
          diagonal: "Composição diagonal",
          layered: "Faixas sobrepostas",
        },
      },
      {
        key: "decoration",
        label: "Ornamentos das páginas",
        values: {
          original: "Actuais",
          subtle: "Discretos",
          none: "Ocultos",
        },
      },
    ],
  },
  {
    title: "Botões e ligações",
    description:
      "Apresentação das acções existentes; os destinos continuam no editor de conteúdos.",
    controls: [
      {
        key: "buttonStyle",
        label: "Estilo dos botões",
        values: {
          original: "Actual",
          solid: "Preenchido",
          outline: "Contorno",
          soft: "Fundo suave",
        },
      },
      {
        key: "buttonSize",
        label: "Tamanho dos botões",
        values: {
          original: "Actual",
          compact: "Compacto",
          large: "Ampliado",
        },
      },
      {
        key: "buttonHover",
        label: "Efeito ao apontar para botões",
        values: {
          original: "Actual",
          none: "Sem efeito",
          lift: "Elevação discreta",
          glow: "Halo de cor",
        },
      },
      {
        key: "buttonIcon",
        label: "Indicadores dos botões",
        values: {
          original: "Actuais",
          visible: "Visíveis",
          hidden: "Ocultos",
        },
      },
      {
        key: "linkStyle",
        label: "Estilo das ligações",
        values: {
          original: "Actual",
          underline: "Sublinhado",
          animated: "Sublinhado ao interagir",
        },
      },
    ],
  },
  {
    title: "Rodapé",
    description: "Distribuição e fundo; as cores e os conteúdos mantêm controlos próprios.",
    controls: [
      {
        key: "footerLayout",
        label: "Composição do rodapé",
        values: {
          original: "Actual",
          compact: "Compacta",
          center: "Centrada",
        },
      },
      {
        key: "footerSurface",
        label: "Fundo do rodapé",
        values: {
          original: "Actual",
          solid: "Sólido",
          gradient: "Gradiente discreto",
        },
      },
    ],
  },
  {
    title: "Movimento e animações",
    description:
      "Entradas discretas, sem ocultar a informação. A preferência de movimento reduzido tem prioridade.",
    controls: [
      {
        key: "motion",
        label: "Efeitos de entrada",
        values: {
          original: "Actual",
          fade: "Aparecimento suave",
          rise: "Deslizar discretamente",
          zoom: "Aproximação suave",
          none: "Sem animações",
        },
      },
      {
        key: "motionSpeed",
        label: "Ritmo das animações",
        values: {
          original: "Actual",
          quick: "Rápido — 240 ms",
          calm: "Calmo — 650 ms",
        },
      },
    ],
  },
];

designOptionGroups[1].controls.push({
  key: "headingWeight",
  label: "Peso dos títulos",
  values: { original: "Actual", regular: "Regular", medium: "Médio", strong: "Forte" },
});
designOptionGroups[3].controls.push({
  key: "bandMotion",
  label: "Movimento de fundo das faixas",
  values: { original: "Actual", none: "Parado", drift: "Deslocamento suave" },
});
designOptionGroups[4].controls.push({
  key: "buttonShape",
  label: "Forma dos botões",
  values: {
    original: "Herdar os cantos",
    square: "Recta",
    rounded: "Arredondada",
    pill: "Cápsula",
  },
});
