# Remoção do Personalizador de Tema (Theme Customizer)

Se pretender um modelo mais simples ou não precisar da edição de temas em tempo real, pode remover com segurança o personalizador de temas. Siga estes passos para ambas as versões Vite e Next.js:

## 1. Remover a UI do Personalizador

- Elimine ou comente o componente `<ThemeCustomizer />` nos seus ficheiros de layout/cabeçalho/barra lateral.
- Vite: `vite-version/src/components/layouts/base-layout.tsx`, `vite-version/src/components/site-header.tsx`
- Next.js: `nextjs-version/src/components/layouts/base-layout.tsx`, `nextjs-version/src/components/site-header.tsx`

## 2. Remover Ficheiros do Personalizador

- Elimine a pasta `theme-customizer/` em `src/components/`.
- Opcionalmente, remova `use-theme-manager.ts` de `src/hooks/` caso não seja utilizado noutros locais.

## 3. Limpar Configurações

- Remova quaisquer referências a `theme-customizer` nos seus ficheiros de configuração e na navegação/barra lateral.
- Atualize a documentação e a navegação conforme necessário.

**Nota:** O modelo continuará a suportar o modo escuro/claro e a tematização básica via Tailwind CSS e shadcn/ui, mesmo sem o personalizador.

## Processo de Remoção Passo a Passo

### Passo 1: Remover Referências a Componentes

Remova o componente ThemeCustomizer dos seus ficheiros de layout:

```typescript
// Antes - src/components/layouts/base-layout.tsx
import { ThemeCustomizer } from '@/components/theme-customizer'

export function BaseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex-1 flex flex-col">
        <SiteHeader />
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
      <ThemeCustomizer /> {/* Remover esta linha */}
    </div>
  )
}

// Depois - Layout limpo sem personalizador
export function BaseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex-1 flex flex-col">
        <SiteHeader />
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
```

### Passo 2: Remover Ficheiros do Personalizador de Tema

Elimine os seguintes ficheiros e diretórios:

```bash
# Remover diretório do personalizador de temas
rm -rf src/components/theme-customizer/

# Remover hook do gestor de temas (se não utilizado noutros locais)
rm src/hooks/use-theme-manager.ts

# Remover configuração de dados do tema (se apenas utilizado pelo personalizador)
rm src/config/theme-data.ts
```

### Passo 3: Remover Dependências

Remova dependências relacionadas com o personalizador de temas:

```bash
# Remover tweakcn e pacotes relacionados
pnpm remove tweakcn
pnpm remove @tweakcn/core
pnpm remove colord

# Remover outras dependências específicas do personalizador
pnpm remove react-colorful
pnpm remove color2k
```

### Passo 4: Limpar Importações

Remova quaisquer importações restantes nos seus ficheiros:

```typescript
// Remova estas importações dos ficheiros que utilizavam o personalizador
import { ThemeCustomizer } from '@/components/theme-customizer'
import { useThemeManager } from '@/hooks/use-theme-manager'
import { themeColors } from '@/config/theme-data'
```

### Passo 5: Atualizar Navegação

Remova o personalizador de temas da navegação:

```typescript
// Remover do app-sidebar.tsx ou da configuração de navegação
const navItems = [
  // ... outros itens
  // Remover: { title: "Theme", url: "/theme", icon: Palette },
]
```

## Alternativa: Suporte Mínimo a Temas

Se pretender manter a alternância básica de temas sem o personalizador completo:

### Manter o Botão de Alternância Claro/Escuro

```typescript
// Manter o componente de alternância de modo
import { ModeToggle } from '@/components/mode-toggle'

function Header() {
  return (
    <header>
      {/* Outro conteúdo do cabeçalho */}
      <ModeToggle />
    </header>
  )
}
```

### Variáveis de Tema Simples

Mantenha variáveis CSS básicas para tematização:

```css
/* globals.css - Manter estas variáveis para tematização básica */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96%;
  --secondary-foreground: 222.2 84% 4.9%;
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --secondary: 217.2 32.6% 17.5%;
  --secondary-foreground: 210 40% 98%;
}
```

## Passos de Verificação

Após remover o personalizador de temas, verifique se tudo funciona:

### 1. Teste de Build

```bash
# Testar build em ambas as versões
cd vite-version && pnpm build
cd nextjs-version && pnpm build
```

### 2. Teste de Execução (Runtime)

```bash
# Iniciar servidor de desenvolvimento
cd vite-version && pnpm dev
# ou
cd nextjs-version && pnpm dev
```

### 3. Verificar Erros

- Sem erros de consola relacionados com a ausência do personalizador de temas
- Alternância de modo escuro/claro continua a funcionar
- Todos os componentes são renderizados corretamente
- Sem importações quebradas ou dependências ausentes

## Resolução de Problemas (Troubleshooting)

### Erros de Build

Se encontrar erros de build após a remoção:

1. **Importações Ausentes**: Procure por importações restantes do personalizador de temas
2. **Erros de Tipo**: Remova referências TypeScript a tipos do personalizador de temas
3. **Variáveis CSS**: Certifique-se de que as variáveis CSS básicas ainda estão definidas

### Problemas em Tempo de Execução

**Modo escuro não funciona**: Certifique-se de que manteve o provedor de tema básico (theme provider) e o botão de alternância de modo

**Estilização quebrada**: Verifique se as variáveis CSS essenciais ainda estão definidas no seu `globals.css`

**Erros de componentes**: Procure por componentes que ainda façam referência a funções removidas do personalizador de temas

## Benefícios Após a Remoção

- **Tamanho de Bundle Reduzido**: Pacote JavaScript menor sem as dependências do personalizador de temas
- **Base de Código Mais Simples**: Menos ficheiros e dependências para manter
- **Tempos de Build Mais Rápidos**: Menos código para compilar e empacotar
- **Pronto para Produção**: Build de produção mais limpo sem funcionalidades focadas em desenvolvimento

O modelo continuará a funcionar perfeitamente com o sistema de temas incorporado do shadcn/ui e as variáveis CSS do Tailwind.

Remova quaisquer scripts relacionados com a personalização de temas:

```json
{
  "scripts": {
    // Remova estes se existirem
    // "theme:export": "tweakcn export",
    // "theme:import": "tweakcn import"
  }
}
```

### Passo 5: Remover Hooks de Tema

Elimine os hooks personalizados relacionados com o tema:

```bash
# Remover hooks de gestão do tema
rm src/hooks/use-theme-manager.ts
rm src/hooks/use-theme-customizer.ts

# Manter hook de tema básico para modo escuro/claro
# Mantenha src/hooks/use-theme.ts se ainda desejar modo escuro/claro
```

### Passo 6: Simplificar o Theme Provider

Mantenha apenas as funcionalidades básicas de tema:

```typescript
// src/components/theme-provider.tsx
'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light' | 'system'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'ui-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  )

  useEffect(() => {
    const root = window.document.documentElement

    root.classList.remove('light', 'dark')

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light'

      root.classList.add(systemTheme)
      return
    }

    root.classList.add(theme)
  }, [theme])

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme)
      setTheme(theme)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
```

### Passo 7: Atualizar a Alternância de Modo (Mode Toggle)

Simplifique a alternância de modo para lidar apenas com a mudança entre claro/escuro:

```typescript
// src/components/mode-toggle.tsx
'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ModeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

### Passo 8: Remover Páginas de Definições

Se tiver páginas de definições do personalizador de temas, remova-as:

```bash
# Remover definições do personalizador de temas
rm -rf src/app/settings/theme/
rm -rf src/app/settings/appearance/

# Ou remover os ficheiros de página específicos
rm src/app/settings/theme/page.tsx
rm src/app/settings/appearance/page.tsx
```

### Passo 9: Atualizar Navegação

Remova as hiperligações do personalizador de temas da navegação:

```typescript
// src/components/app-sidebar.tsx
export const sidebarNavItems = [
  // ... outros itens de navegação
  {
    title: 'Settings',
    items: [
      {
        title: 'General',
        url: '/settings',
        icon: Settings,
      },
      {
        title: 'Profile',
        url: '/settings/profile',
        icon: User,
      },
      // Remover link do personalizador de temas
      // {
      //   title: 'Theme',
      //   url: '/settings/theme',
      //   icon: Palette,
      // },
    ],
  },
]
```

### Passo 10: Limpar Variáveis CSS

Mantenha apenas variáveis CSS essenciais e remova as específicas do personalizador:

```css
/* src/index.css ou globals.css */
@import 'tailwindcss';

@layer base {
  :root {
    /* Variáveis base do tema */
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96%;
    --secondary-foreground: 222.2 84% 4.9%;
    --muted: 210 40% 96%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96%;
    --accent-foreground: 222.2 84% 4.9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
    
    /* Remover variáveis específicas do personalizador */
    /* --sidebar-width: 280px; */
    /* --header-height: 64px; */
    /* --customizer-panel-width: 320px; */
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 84% 4.9%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 94.0%;
  }
}

/* Remover estilos específicos do personalizador */
```

## Alternativa: Inclusão Condicional

Se quiser manter o personalizador de temas para desenvolvimento, mas removê-lo em produção:

### Remoção Baseada no Ambiente

```typescript
// src/components/layouts/base-layout.tsx
import { ThemeCustomizer } from '@/components/theme-customizer'

export function BaseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex-1 flex flex-col">
        <SiteHeader />
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
      {/* Mostrar apenas em desenvolvimento */}
      {process.env.NODE_ENV === 'development' && <ThemeCustomizer />}
    </div>
  )
}
```

### Abordagem com Feature Flag

```typescript
// src/lib/config.ts
export const FEATURES = {
  THEME_CUSTOMIZER: process.env.NEXT_PUBLIC_ENABLE_THEME_CUSTOMIZER === 'true',
}

// src/components/layouts/base-layout.tsx
import { FEATURES } from '@/lib/config'
import { ThemeCustomizer } from '@/components/theme-customizer'

export function BaseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex-1 flex flex-col">
        <SiteHeader />
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
      {FEATURES.THEME_CUSTOMIZER && <ThemeCustomizer />}
    </div>
  )
}
```

## Impacto no Tamanho do Bundle

A remoção do personalizador de temas pode reduzir o tamanho do seu pacote em:

- **~50-100KB** de JavaScript (minificado + gzipped)
- **~10-20KB** de CSS
- **Carregamento inicial de página mais rápido** devido a um menor número de componentes
- **Uso reduzido de memória em tempo de execução**

## Testes Após a Remoção

Após remover o personalizador de temas:

1. **Construa a aplicação (build)** para garantir que não existem erros de compilação
2. **Teste todas as páginas** para verificar se nada está partido
3. **Verifique se existem erros na consola** relacionados com dependências ausentes
4. **Verifique se a alternância de temas** continua a funcionar (se mantiver a alternância de modo básica)
5. **Teste o comportamento responsivo** para garantir que o layout se mantém intacto

## Manter Temas Personalizados

Se quiser manter temas personalizados sem o personalizador:

1. **Exporte o seu tema** antes de remover o personalizador
2. **Defina os valores do tema diretamente** nas suas variáveis CSS
3. **Crie variantes do tema** como classes CSS separadas
4. **Utilize um menu suspenso de seleção de temas** em vez do personalizador completo

```css
/* Exemplo: Tema personalizado definido diretamente */
.theme-ocean {
  --primary: 210 100% 50%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 50% 90%;
  /* ... outras cores */
}

.theme-forest {
  --primary: 120 100% 40%;
  --primary-foreground: 120 40% 98%;
  --secondary: 120 50% 90%;
  /* ... outras cores */
}
```

## Plano de Reversão (Rollback)

Se precisar de restaurar o personalizador de temas:

1. **Restaure a partir do git** utilizando `git checkout HEAD~1 -- src/components/theme-customizer/`
2. **Reinstale as dependências** com `pnpm install tweakcn @tweakcn/core`
3. **Readicione as importações de componentes** nos seus layouts
4. **Restaure as hiperligações de navegação** e as páginas de definições

## Próximos Passos

- **[Guia de Instalação](/guide/installation)** - Configurar uma nova instalação sem personalizador
- **[Personalizador de Tema](/theme-customizer/)** - Saiba mais sobre o personalizador antes de remover
- **[Guia de Personalização](/customization/)** - Abordagens alternativas de personalização
