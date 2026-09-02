# Configuração

Opções detalhadas de configuração para o personalizador de temas, incluindo sistemas de cores, definições de layout e personalização avançada.

## Configuração do Sistema de Cores

O sistema de temas suporta uma personalização abrangente de cores:

```typescript
interface ColorScheme {
  // Cores primárias da marca
  primary: string
  primaryForeground: string
  
  // Cores secundárias
  secondary: string
  secondaryForeground: string
  
  // Cores semânticas
  destructive: string
  constructive: string
  warning: string
  
  // Cores de superfície
  background: string
  foreground: string
  card: string
  cardForeground: string
  
  // Elementos interativos
  muted: string
  mutedForeground: string
  accent: string
  accentForeground: string
  
  // Bordas e separadores
  border: string
  input: string
  ring: string
}
```

### Configuração de Cores

Edite a configuração do tema em `src/config/theme-data.ts`:

```typescript
export const themeColors = {
  // Paleta de cores base
  slate: {
    50: "210 40% 98%",
    100: "210 40% 96%",
    200: "214 32% 91%",
    // ... mais tonalidades
  },
  
  // Cores semânticas
  primary: {
    light: "210 100% 50%",
    dark: "210 100% 60%"
  },
  
  secondary: {
    light: "210 40% 96%",
    dark: "210 40% 16%"
  }
}
```

## Configuração do Layout

```typescript
interface LayoutConfig {
  // Definições da barra lateral
  sidebarWidth: number
  sidebarCollapsedWidth: number
  
  // Definições do cabeçalho
  headerHeight: number
  
  // Espaçamento
  containerPadding: number
  contentSpacing: number
  
  // Raio de curvatura da borda (border radius)
  borderRadius: number
  
  // Layout do menu
  menuLayout: 'vertical' | 'horizontal'
}
```

### Opções de Layout

Configure as definições de layout no seu gestor de temas:

```typescript
const layoutConfig = {
  sidebar: {
    width: 280,
    collapsedWidth: 64,
    breakpoint: 768,
  },
  header: {
    height: 64,
    sticky: true,
  },
  content: {
    maxWidth: 1200,
    padding: 24,
  }
}
```

## Configuração da Tipografia

```typescript
interface TypographyConfig {
  // Famílias de fontes
  fontFamily: {
    sans: string[]
    mono: string[]
  }
  
  // Tamanhos de fonte
  fontSize: {
    xs: string
    sm: string
    base: string
    lg: string
    xl: string
    '2xl': string
    '3xl': string
    '4xl': string
  }
  
  // Alturas de linha
  lineHeight: {
    tight: string
    normal: string
    relaxed: string
  }
  
  // Pesos de fonte
  fontWeight: {
    normal: string
    medium: string
    semibold: string
    bold: string
  }
}
```

### Configuração de Fontes

Configure a tipografia no seu ficheiro de configuração do Tailwind:

```typescript
// tailwind.config.ts
export default {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
      }
    }
  }
}
```

## Configuração Específica de Componentes

### Configuração do Botão (Button)

```typescript
const buttonConfig = {
  variants: {
    default: {
      background: 'hsl(var(--primary))',
      foreground: 'hsl(var(--primary-foreground))',
      hover: 'hsl(var(--primary) / 0.9)',
    },
    outline: {
      border: 'hsl(var(--border))',
      background: 'transparent',
      hover: 'hsl(var(--accent))',
    }
  },
  sizes: {
    sm: {
      height: '36px',
      padding: '0 12px',
      fontSize: '14px',
    },
    default: {
      height: '40px',
      padding: '0 16px',
      fontSize: '16px',
    }
  }
}
```

### Configuração do Cartão (Card)

```typescript
const cardConfig = {
  base: {
    borderRadius: '8px',
    border: '1px solid hsl(var(--border))',
    background: 'hsl(var(--card))',
    color: 'hsl(var(--card-foreground))',
    shadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)',
  },
  variants: {
    elevated: {
      shadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    },
    outlined: {
      border: '2px solid hsl(var(--border))',
      shadow: 'none',
    }
  }
}
```

## Configuração de Animações

Controle animações e transições:

```typescript
interface AnimationConfig {
  duration: {
    fast: string
    normal: string
    slow: string
  }
  
  easing: {
    default: string
    bounce: string
    elastic: string
  }
  
  transitions: {
    colors: boolean
    transform: boolean
    opacity: boolean
  }
}
```

### Configuração da Animação

```typescript
const animationConfig = {
  duration: {
    fast: '150ms',
    normal: '300ms',
    slow: '500ms',
  },
  easing: {
    default: 'cubic-bezier(0.4, 0, 0.2, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    elastic: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  },
  transitions: {
    colors: true,
    transform: true,
    opacity: true,
  }
}
```

## Integração com Variáveis CSS

### Geração Automática de Variáveis

O personalizador de temas gera automaticamente variáveis CSS:

```css
:root {
  /* Cores */
  --primary: 210 100% 50%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96%;
  --secondary-foreground: 222.2 84% 4.9%;
  
  /* Layout */
  --sidebar-width: 280px;
  --header-height: 64px;
  --border-radius: 8px;
  
  /* Animação */
  --transition-duration: 300ms;
  --transition-easing: cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Variáveis do Modo Escuro (Dark Mode)

```css
.dark {
  --primary: 210 100% 60%;
  --primary-foreground: 210 40% 8%;
  --secondary: 210 40% 16%;
  --secondary-foreground: 210 40% 98%;
  
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --card: 222.2 84% 4.9%;
  --card-foreground: 210 40% 98%;
}
```

## Configuração Específica por Ambiente

### Configuração de Desenvolvimento

```typescript
const devConfig = {
  enableDevTools: true,
  showGridLines: true,
  debugMode: true,
  hotReload: true,
}
```

### Configuração de Produção

```typescript
const prodConfig = {
  enableDevTools: false,
  showGridLines: false,
  debugMode: false,
  optimizePerformance: true,
}
```

## Configuração Avançada

### Paletas de Cores Personalizadas

Crie e registe paletas de cores personalizadas:

```typescript
const customPalettes = {
  ocean: {
    name: 'Ocean Blue',
    colors: {
      primary: 'hsl(210, 100%, 50%)',
      secondary: 'hsl(210, 50%, 90%)',
      accent: 'hsl(25, 100%, 60%)',
    }
  },
  forest: {
    name: 'Forest Green',
    colors: {
      primary: 'hsl(120, 60%, 40%)',
      secondary: 'hsl(120, 30%, 90%)',
      accent: 'hsl(45, 100%, 50%)',
    }
  }
}
```

### Validação do Tema

Implemente a validação do tema:

```typescript
const validateTheme = (theme: Theme): boolean => {
  // Verificar propriedades obrigatórias
  const requiredColors = ['primary', 'secondary', 'background', 'foreground']
  
  for (const color of requiredColors) {
    if (!theme.colors[color]) {
      console.error(`Missing required color: ${color}`)
      return false
    }
  }
  
  // Validar formato da cor
  const colorRegex = /^hsl\(\d+,?\s*\d+%?,?\s*\d+%?\)$/
  for (const [key, value] of Object.entries(theme.colors)) {
    if (!colorRegex.test(value as string)) {
      console.error(`Invalid color format for ${key}: ${value}`)
      return false
    }
  }
  
  return true
}
```

## Configuração de Desempenho

### Definições de Otimização

```typescript
const performanceConfig = {
  // Debounce nas atualizações do tema
  updateDebounce: 100,
  
  // Atualizações em lote de variáveis CSS
  batchUpdates: true,
  
  // Utilizar requestAnimationFrame para transições suaves
  useRAF: true,
  
  // Pré-carregar temas comuns
  preloadThemes: ['light', 'dark', 'auto'],
}
```

### Gestão de Memória

```typescript
const memoryConfig = {
  // Número máximo de temas em cache
  maxCachedThemes: 10,
  
  // Limpar temas não utilizados após tempo limite
  cleanupTimeout: 5 * 60 * 1000, // 5 minutos
  
  // Utilizar referências fracas para ouvintes de eventos
  useWeakRefs: true,
}
```
