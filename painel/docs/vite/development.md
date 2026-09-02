# Fluxo de Trabalho de Desenvolvimento Vite

Aprenda a desenvolver eficazmente com a versão Vite do Template SIGA Plus.

## Ambiente de Desenvolvimento

### Servidor de Desenvolvimento

O servidor de desenvolvimento Vite oferece:

- **HMR extremamente rápido** - As alterações aparecem instantaneamente (< 50ms)
- **Source maps** - Depure diretamente nos seus ficheiros TypeScript originais
- **Overlay de erro** - Mensagens de erro claras no navegador
- **Modo de rede** - Teste em dispositivos móveis

```bash
# Start development server
pnpm dev

# Start with custom port
pnpm dev --port 3001

# Start with network access
pnpm dev --host
```

### Monitorização de Ficheiros (File Watching)

O Vite monitoriza e recarrega automaticamente:

- **Alterações de componentes** - Atualizações instantâneas da UI
- **Alterações de estilo** - Hot reloading de CSS sem recarregar a página
- **Alterações de configuração** - Reinício automático do servidor
- **Criação de novos ficheiros** - Inclusão imediata no gráfico de módulos

## Análise Detalhada da Estrutura do Projeto

### Organização do Código Fonte

```text
src/
├── App.tsx                    # Aplicação principal com roteamento
├── main.tsx                   # Ponto de entrada da aplicação React
├── index.css                  # Estilos globais e importações do Tailwind
├── app/                       # Componentes de página organizados por funcionalidade
│   ├── (dashboard)/           # Grupo de rotas do painel
│   │   ├── page.tsx          # Página principal do painel
│   │   ├── analytics/        # Página de análises (Analytics)
│   │   └── users/            # Gestão de utilizadores
│   ├── (auth)/               # Grupo de rotas de autenticação
│   │   ├── login/            # Página de login
│   │   └── register/         # Página de registo
│   ├── landing/              # Página inicial (Landing page)
│   ├── mail/                 # Aplicação de e-mail
│   ├── tasks/                # Gestão de tarefas
│   ├── chat/                 # Interface de chat
│   ├── calendar/             # Aplicação de calendário
│   └── settings/             # Páginas de configurações
├── components/               # Componentes reutilizáveis
│   ├── ui/                   # Componentes base do shadcn/ui
│   ├── layouts/              # Componentes de layout
│   ├── router/               # Utilitários e guardas do router
│   └── theme-customizer/     # Componentes de personalização do tema
├── hooks/                    # Hooks React personalizados e stores Zustand
├── lib/                      # Funções utilitárias e configurações
├── types/                    # Definições de tipos TypeScript
└── utils/                    # Funções auxiliares
```

### Padrão de Componentes de Página

Cada página segue uma estrutura consistente:

```typescript
// src/app/(dashboard)/analytics/page.tsx
import { BaseLayout } from '@/components/layouts/base-layout'
import { AnalyticsCharts } from '@/components/analytics-charts'
import { useAnalytics } from '@/hooks/use-analytics'

export default function AnalyticsPage() {
  const { data, isLoading } = useAnalytics()

  if (isLoading) {
    return <AnalyticsPageSkeleton />
  }

  return (
    <BaseLayout 
      title="Analytics" 
      description="View your analytics data and insights"
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">
            Track your performance and insights
          </p>
        </div>
        
        <AnalyticsCharts data={data} />
      </div>
    </BaseLayout>
  )
}
```

## Sistema de Roteamento

### React Router DOM v6

A aplicação utiliza o React Router DOM para roteamento no lado do cliente:

```typescript
// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { BaseLayout } from '@/components/layouts/base-layout'

// Lazy load pages for better performance
const Dashboard = lazy(() => import('@/app/(dashboard)/page'))
const Analytics = lazy(() => import('@/app/(dashboard)/analytics/page'))
const LandingPage = lazy(() => import('@/app/landing/page'))

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          {/* Public routes */}
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          
          {/* Protected routes with layout */}
          <Route path="/" element={<BaseLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="analytics" element={<Analytics />} />
            {/* More routes */}
          </Route>
          
          {/* Catch-all route */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
```

### Proteção de Rotas

Implementar guardas de autenticação:

```typescript
// src/components/router/protected-route.tsx
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    // Redirect to login with return URL
    return (
      <Navigate 
        to="/login" 
        state={{ from: location.pathname }} 
        replace 
      />
    )
  }

  return <>{children}</>
}
```

## Gestão de Estado

### Stores do Zustand

Utilize o Zustand para gestão de estado global:

```typescript
// src/hooks/use-sidebar-config.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SidebarState {
  isCollapsed: boolean
  isMobile: boolean
  setCollapsed: (collapsed: boolean) => void
  setMobile: (mobile: boolean) => void
  toggle: () => void
}

export const useSidebarConfig = create<SidebarState>()(
  persist(
    (set, get) => ({
      isCollapsed: false,
      isMobile: false,
      setCollapsed: (collapsed) => set({ isCollapsed: collapsed }),
      setMobile: (mobile) => set({ isMobile: mobile }),
      toggle: () => set({ isCollapsed: !get().isCollapsed }),
    }),
    {
      name: 'sidebar-config',
      partialize: (state) => ({ isCollapsed: state.isCollapsed }),
    }
  )
)
```

### Estado Local do Componente

Para estado específico de componentes, utilize hooks do React:

```typescript
// Example: Data table with local state
function UsersTable() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [sorting, setSorting] = useState<SortingState>([])
  
  const { data, isLoading } = useUsers({
    search,
    page,
    sorting,
  })

  return (
    <DataTable
      data={data}
      onSearchChange={setSearch}
      onPageChange={setPage}
      onSortingChange={setSorting}
    />
  )
}
```

## Estilização e Temas

### Tailwind CSS v4

O projeto utiliza o Tailwind CSS v4 com o plugin do Vite:

```typescript
// vite.config.ts
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // Tailwind CSS v4 Vite plugin
  ],
})
```

### Variáveis CSS

As cores do tema são definidas como variáveis CSS:

```css
/* src/index.css */
@import 'tailwindcss';

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    /* ... more variables */
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... dark mode variables */
  }
}
```

### Estilização de Componentes

Utilize o utilitário `cn` para classes condicionais:

```typescript
import { cn } from '@/lib/utils'

interface ButtonProps {
  variant?: 'default' | 'destructive' | 'outline'
  size?: 'default' | 'sm' | 'lg'
  className?: string
}

function Button({ variant = 'default', size = 'default', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        // Base styles
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        // Variant styles
        {
          'bg-primary text-primary-foreground hover:bg-primary/90': variant === 'default',
          'bg-destructive text-destructive-foreground hover:bg-destructive/90': variant === 'destructive',
          'border border-input bg-background hover:bg-accent': variant === 'outline',
        },
        // Size styles
        {
          'h-10 px-4 py-2': size === 'default',
          'h-9 rounded-md px-3': size === 'sm',
          'h-11 rounded-md px-8': size === 'lg',
        },
        className
      )}
      {...props}
    />
  )
}
```

## Ferramentas de Desenvolvimento

### Configuração do TypeScript

O projeto inclui definições rigorosas de TypeScript:

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### Configuração do ESLint

Regras de qualidade de código para React e TypeScript:

```javascript
// eslint.config.js
export default [
  {
    extends: [
      'eslint:recommended',
      '@typescript-eslint/recommended',
      'plugin:react/recommended',
      'plugin:react-hooks/recommended',
    ],
    rules: {
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
      'prefer-const': 'error',
    },
  },
]
```

### Integração com o VS Code

Definições recomendadas para o VS Code:

```json
// .vscode/settings.json
{
  "typescript.preferences.preferTypeOnlyAutoImports": true,
  "editor.codeActionsOnSave": {
    "source.organizeImports": true,
    "source.fixAll.eslint": true
  },
  "tailwindCSS.experimental.classRegex": [
    ["cn\\(([^)]*)\\)", "'([^']*)'"]
  ]
}
```

## Otimização de Desempenho

### Divisão de Código (Code Splitting)

Implementar divisão de código baseada em rotas:

```typescript
// Lazy load pages
const Dashboard = lazy(() => import('@/app/(dashboard)/page'))
const Analytics = lazy(() => import('@/app/(dashboard)/analytics/page'))

// Lazy load heavy components
const HeavyChart = lazy(() => import('@/components/heavy-chart'))

function AnalyticsPage() {
  return (
    <div>
      <h1>Analytics</h1>
      <Suspense fallback={<ChartSkeleton />}>
        <HeavyChart />
      </Suspense>
    </div>
  )
}
```

### Análise do Bundle

Analise o tamanho do seu bundle:

```bash
# Install bundle analyzer
pnpm add -D rollup-plugin-visualizer

# Add to vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: 'dist/stats.html',
      open: true,
    }),
  ],
})

# Build and analyze
pnpm build
```

### Dicas de Otimização

1. **Utilize o React.memo** para componentes pesados
2. **Implemente o useMemo** para cálculos complexos
3. **Utilize o useCallback** para referências de função estáveis
4. **Carregue rotas e componentes pesados sob procura (lazy load)**
5. **Otimize imagens** e utilize o formato WebP

## Testes

### Testes de Componentes

Configurar o Vitest para testes de componentes:

```typescript
// src/components/__tests__/button.test.tsx
import { render, screen } from '@testing-library/react'
import { Button } from '../ui/button'

describe('Button', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button')).toHaveTextContent('Click me')
  })

  it('applies variant classes correctly', () => {
    render(<Button variant="destructive">Delete</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-destructive')
  })
})
```

### Configuração do Ambiente de Testes

```bash
# Install testing dependencies
pnpm add -D vitest @testing-library/react @testing-library/jest-dom

# Add to vite.config.ts
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

## Depuração (Debugging)

### DevTools do Navegador

Utilize o React DevTools para depuração:

1. **Instale a extensão de navegador** React DevTools
2. **Inspecione as props** e o estado dos componentes
3. **Analise o desempenho** com o React Profiler
4. **Depure o roteamento** com o React Router DevTools

### DevTools do Vite

O Vite oferece funcionalidades úteis de depuração:

```bash
# Enable debug mode
DEBUG=vite:* pnpm dev

# Verbose logging
pnpm dev --debug

# Force optimize dependencies
pnmp dev --force
```

### Cenários Comuns de Depuração

**Componente não recarrega (re-render):**
- Verifique se as props estão a ser passadas corretamente
- Verifique se as atualizações de estado são imutáveis
- Utilize o React DevTools para inspecionar a árvore de componentes

**Problemas de roteamento:**
- Verifique as definições de rotas no `App.tsx`
- Verifique se os links de navegação utilizam os caminhos corretos
- Verifique se existem conflitos ou sobreposições de rotas

**Estilo não é aplicado:**
- Verifique se as classes do Tailwind estão corretas
- Verifique as definições de variáveis CSS
- Utilize o DevTools do navegador para inspecionar os estilos computados

## Próximos Passos

- **[Build & Implantação](/vite/build-deploy)** - Implante a sua aplicação
- **[Resolução de Problemas](/vite/troubleshooting)** - Problemas comuns e soluções
- **[Componentes](/components/)** - Aprenda sobre a biblioteca de componentes
- **[Personalizador de Tema](/theme-customizer/)** - Personalize o seu tema
