# Resolução de Problemas no Vite

Problemas comuns e soluções ao trabalhar com a versão Vite do Template SIGA Plus.

## Problemas de Desenvolvimento

### Porta Já em Uso

**Problema:** A porta 5173 já está ocupada

**Soluções:**

```bash
# Use a different port
pnpm dev --port 3001

# Find and kill the process using the port
lsof -ti:5173 | xargs kill -9

# Or use a specific port range
pnpm dev --port 5174
```

### Servidor de Desenvolvimento Lento

**Problema:** O servidor de desenvolvimento demora a iniciar ou a recarregar

**Soluções:**

1. **Limpar a cache do Vite:**
   ```bash
   rm -rf node_modules/.vite
   pnpm dev
   ```

2. **Otimizar dependências:**
   ```bash
   pnpm dev --force
   ```

3. **Verificar dependências grandes:**
   ```typescript
   // vite.config.ts - Pre-bundle heavy dependencies
   export default defineConfig({
     optimizeDeps: {
       include: [
         'react',
         'react-dom',
         'react-router-dom',
         '@tanstack/react-table',
         'recharts',
         'zustand',
       ],
     },
   })
   ```

### Erros de Resolução de Módulos

**Problema:** Não é possível resolver importações de módulos

**Soluções:**

1. **Verificar alias de caminhos:**
   ```typescript
   // vite.config.ts
   import path from 'path'
   
   export default defineConfig({
     resolve: {
       alias: {
         '@': path.resolve(__dirname, './src'),
       },
     },
   })
   ```

2. **Verificar extensões de ficheiro:**
   ```typescript
   // Correct imports
   import { Button } from '@/components/ui/button'
   import type { User } from '@/types/user'
   
   // Avoid these
   import { Button } from '@/components/ui/button.tsx' // 
   import { User } from '@/types/user.ts' // 
   ```

3. **Verificar caminhos no tsconfig:**
   ```json
   // tsconfig.json
   {
     "compilerOptions": {
       "baseUrl": ".",
       "paths": {
         "@/*": ["./src/*"]
       }
     }
   }
   ```

### Problemas de CSS/Tailwind

**Problema:** As classes do Tailwind não estão a ser aplicadas ou os estilos estão em falta

**Soluções:**

1. **Verificar a configuração do Tailwind:**
   ```typescript
   // tailwind.config.ts
   import type { Config } from 'tailwindcss'
   
   const config: Config = {
     content: [
       './index.html',
       './src/**/*.{js,ts,jsx,tsx}', // Make sure this matches your file structure
     ],
     // ... rest of config
   }
   ```

2. **Verificar importações de CSS:**
   ```css
   /* src/index.css */
   @import 'tailwindcss'; /* Make sure this is present */
   
   @layer base {
     /* Your custom styles */
   }
   ```

3. **Verificar conflitos de CSS:**
   ```typescript
   // Use cn utility for conditional classes
   import { cn } from '@/lib/utils'
   
   function Component({ className }: { className?: string }) {
     return (
       <div className={cn('default-classes', className)}>
         Content
       </div>
     )
   }
   ```

## Problemas no Build

### Erros de Compilação de TypeScript

**Problema:** O build falha devido a erros de TypeScript

**Soluções:**

1. **Executar verificação de tipos separadamente:**
   ```bash
   pnpm type-check
   ```

2. **Problemas comuns de tipos:**
   ```typescript
   // Fix missing types
   npm install @types/react @types/react-dom
   
   // Fix import type issues
   import type { ComponentProps } from 'react' // 
   import { ComponentProps } from 'react' //  for types only
   ```

3. **Problemas com o modo estrito (strict mode):**
   ```typescript
   // Handle potential undefined values
   const user = data?.user // 
   const name = user?.name ?? 'Unknown' // 
   
   // Or disable strict mode temporarily
   // tsconfig.json
   {
     "compilerOptions": {
       "strict": false // Not recommended for production
     }
   }
   ```

### Problemas com o Tamanho do Bundle

**Problema:** O tamanho do bundle é demasiado grande

**Soluções:**

1. **Analise o bundle:**
   ```bash
   pnpm add -D rollup-plugin-visualizer
   
   # Add to vite.config.ts
   import { visualizer } from 'rollup-plugin-visualizer'
   
   export default defineConfig({
     plugins: [
       visualizer({ filename: 'dist/stats.html', open: true })
     ]
   })
   
   pnpm build
   ```

2. **Implementar divisão de código (code splitting):**
   ```typescript
   // Lazy load heavy components
   const HeavyChart = lazy(() => import('@/components/heavy-chart'))
   const Dashboard = lazy(() => import('@/app/(dashboard)/page'))
   
   function App() {
     return (
       <Suspense fallback={<div>Loading...</div>}>
         <Routes>
           <Route path="/dashboard" element={<Dashboard />} />
         </Routes>
       </Suspense>
     )
   }
   ```

3. **Otimizar dependências:**
   ```typescript
   // vite.config.ts
   export default defineConfig({
     build: {
       rollupOptions: {
         output: {
           manualChunks: {
             vendor: ['react', 'react-dom'],
             router: ['react-router-dom'],
             ui: ['@radix-ui/react-dialog'],
           },
         },
       },
     },
   })
   ```

### Problemas de Memória Durante o Build

**Problema:** O build falha com erros de falta de memória (out-of-memory)

**Soluções:**

```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" pnpm build

# Or set in package.json
{
  "scripts": {
    "build": "NODE_OPTIONS='--max-old-space-size=4096' vite build"
  }
}
```

## Problemas em Tempo de Execução (Runtime)

### Problemas de Roteamento

**Problema:** As rotas não funcionam corretamente

**Soluções:**

1. **Verificar definições de rotas:**
   ```typescript
   // App.tsx - Ensure routes are properly defined
   function App() {
     return (
       <BrowserRouter>
         <Routes>
           <Route path="/" element={<Navigate to="/dashboard" replace />} />
           <Route path="/dashboard" element={<Dashboard />} />
           <Route path="/analytics" element={<Analytics />} />
           <Route path="*" element={<NotFound />} />
         </Routes>
       </BrowserRouter>
     )
   }
   ```

2. **Corrigir links de navegação:**
   ```typescript
   import { Link } from 'react-router-dom'
   
   // Use Link for internal navigation
   <Link to="/dashboard">Dashboard</Link> // 
   <a href="/dashboard">Dashboard</a> //  (causes full page reload)
   ```

3. **Tratar rotas aninhadas:**
   ```typescript
   // For nested routes with layouts
   <Route path="/" element={<BaseLayout />}>
     <Route index element={<Navigate to="/dashboard" replace />} />
     <Route path="dashboard" element={<Dashboard />} />
     <Route path="settings" element={<Settings />} />
   </Route>
   ```

### Problemas de Gestão de Estado

**Problema:** A store do Zustand não persiste ou não atualiza

**Soluções:**

1. **Verificar a configuração da store:**
   ```typescript
   import { create } from 'zustand'
   import { persist } from 'zustand/middleware'
   
   const useStore = create<State>()(
     persist(
       (set, get) => ({
         // State and actions
       }),
       {
         name: 'app-storage', // Storage key
         partialize: (state) => ({ 
           // Only persist specific fields
           theme: state.theme 
         }),
       }
     )
   )
   ```

2. **Depurar atualizações da store:**
   ```typescript
   // Add logging to actions
   const useStore = create<State>((set, get) => ({
     updateUser: (user) => {
       console.log('Updating user:', user)
       set({ user })
     },
   }))
   ```

3. **Tratar problemas de hidratação (hydration):**
   ```typescript
   import { useEffect, useState } from 'react'
   
   function Component() {
     const [hydrated, setHydrated] = useState(false)
     const store = useStore()
   
     useEffect(() => {
       setHydrated(true)
     }, [])
   
     if (!hydrated) {
       return <div>Loading...</div>
     }
   
     return <div>{store.data}</div>
   }
   ```

### Problemas de Tema e Estilização

**Problema:** O personalizador de tema não funciona ou os estilos não são aplicados

**Soluções:**

1. **Verificar definições de variáveis CSS:**
   ```css
   /* src/index.css */
   :root {
     --background: 0 0% 100%;
     --foreground: 222.2 84% 4.9%;
     /* Ensure all required variables are defined */
   }
   
   .dark {
     --background: 222.2 84% 4.9%;
     --foreground: 210 40% 98%;
     /* Dark mode variables */
   }
   ```

2. **Verificar configuração do provedor de tema (Theme Provider):**
   ```typescript
   // main.tsx
   import { ThemeProvider } from '@/components/theme-provider'
   
   ReactDOM.createRoot(document.getElementById('root')!).render(
     <React.StrictMode>
       <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
         <App />
       </ThemeProvider>
     </React.StrictMode>
   )
   ```

3. **Depurar alternância de tema:**
   ```typescript
   import { useTheme } from '@/components/theme-provider'
   
   function Component() {
     const { theme, setTheme } = useTheme()
     
     console.log('Current theme:', theme)
     
     return (
       <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
         Toggle theme
       </button>
     )
   }
   ```

## Problemas de Desempenho

### Carregamento Lento de Páginas

**Problema:** As páginas carregam lentamente em desenvolvimento ou produção

**Soluções:**

1. **Implementar carregamento preguiçoso (lazy loading):**
   ```typescript
   // Split large components
   const Dashboard = lazy(() => import('@/app/(dashboard)/page'))
   const HeavyChart = lazy(() => import('@/components/heavy-chart'))
   
   // Use Suspense with meaningful fallbacks
   <Suspense fallback={<DashboardSkeleton />}>
     <Dashboard />
   </Suspense>
   ```

2. **Otimizar imagens:**
   ```typescript
   // Use appropriate image formats and sizes
   <img 
     src="/images/hero.webp" 
     alt="Hero"
     loading="lazy"
     width={800}
     height={400}
   />
   ```

3. **Pré-carregar recursos críticos:**
   ```html
   <!-- In index.html -->
   <link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
   <link rel="preconnect" href="https://fonts.googleapis.com">
   ```

### Fugas de Memória (Memory Leaks)

**Problema:** O uso de memória aumenta com o tempo

**Soluções:**

1. **Limpar escutadores de eventos (event listeners):**
   ```typescript
   useEffect(() => {
     const handleResize = () => {
       // Handle resize
     }
     
     window.addEventListener('resize', handleResize)
     
     return () => {
       window.removeEventListener('resize', handleResize)
     }
   }, [])
   ```

2. **Cancelar operações assíncronas:**
   ```typescript
   useEffect(() => {
     const controller = new AbortController()
     
     fetch('/api/data', { signal: controller.signal })
       .then(response => response.json())
       .then(data => setData(data))
       .catch(error => {
         if (error.name !== 'AbortError') {
           console.error('Fetch error:', error)
         }
       })
     
     return () => {
       controller.abort()
     }
   }, [])
   ```

3. **Evitar fugas de memória em temporizadores:**
   ```typescript
   useEffect(() => {
     const interval = setInterval(() => {
       // Update something
     }, 1000)
     
     return () => clearInterval(interval)
   }, [])
   ```

## Problemas Específicos do Ambiente

### Variáveis de Ambiente Não Funcionam

**Problema:** As variáveis de ambiente estão indefinidas (undefined)

**Soluções:**

1. **Verificar a nomenclatura das variáveis:**
   ```bash
   # Variables must start with VITE_
   VITE_API_URL=http://localhost:3001 
   API_URL=http://localhost:3001 
   ```

2. **Verificar os nomes dos ficheiros:**
   ```bash
   .env                # Loaded in all environments
   .env.local          # Loaded in all environments (ignored by git)
   .env.development    # Loaded in development
   .env.production     # Loaded in production
   ```

3. **Verificar a utilização das variáveis:**
   ```typescript
   // Access environment variables
   const apiUrl = import.meta.env.VITE_API_URL
   
   // Type-safe access
   interface ImportMetaEnv {
     readonly VITE_API_URL: string
     readonly VITE_APP_NAME: string
   }
   ```

### Diferenças entre Produção e Desenvolvimento

**Problema:** A aplicação funciona em desenvolvimento mas não em produção

**Soluções:**

1. **Testar o build de produção localmente:**
   ```bash
   pnpm build
   pnpm preview
   ```

2. **Verificar código exclusivo de desenvolvimento:**
   ```typescript
   // Remove or conditionally include development tools
   if (import.meta.env.DEV) {
     console.log('Development mode')
   }
   
   // Don't ship with React DevTools
   const isDevelopment = import.meta.env.DEV
   ```

3. **Verificar os caminhos dos recursos (assets):**
   ```typescript
   // Use absolute paths for assets
   <img src="/images/logo.png" alt="Logo" /> // 
   <img src="./images/logo.png" alt="Logo" /> //  in some deployment scenarios
   ```

## Ferramentas de Depuração

### DevTools do Navegador

1. **React DevTools:**
   - Instale a extensão de navegador React Developer Tools
   - Inspecione props e estado dos componentes
   - Analise o desempenho dos componentes

2. **Vite DevTools:**
   ```bash
   # Enable verbose logging
   DEBUG=vite:* pnpm dev
   
   # Enable HMR debugging
   DEBUG=vite:hmr pnpm dev
   ```

3. **Separador de Rede (Network tab):**
   - Verificar falhas no carregamento de recursos
   - Monitorizar tamanhos dos bundles
   - Verificar chamadas de API

### Depuração via Consola

```typescript
// Add strategic console logs
console.log('Component mounted:', { props, state })
console.log('API response:', data)
console.log('Route changed:', location.pathname)

// Use performance markers
performance.mark('component-start')
// Component logic
performance.mark('component-end')
performance.measure('component-time', 'component-start', 'component-end')
```

## Obter Ajuda

### Recursos da Comunidade

- **Vite Discord** - Suporte ativo da comunidade
- **Comunidade React** - Questões gerais sobre React
- **Issues do GitHub** - Reportar erros específicos do template

### Documentação

- **[Documentação do Vite](https://vitejs.dev/)** - Documentação oficial do Vite
- **[React Router](https://reactrouter.com/)** - Documentação de roteamento
- **[Tailwind CSS](https://tailwindcss.com/)** - Documentação de estilização
- **[shadcn/ui](https://ui.shadcn.com/)** - Documentação de componentes

### Informação de Depuração

Ao reportar problemas, inclua:

```bash
# System information
node --version
pnpm --version
vite --version

# Project information
pnpm list --depth=0

# Build/error logs
pnpm build 2>&1 | tee build.log
```

## Próximos Passos

- **[Guia de Desenvolvimento](/vite/development)** - Fluxo de trabalho de desenvolvimento
- **[Build & Implantação](/vite/build-deploy)** - Implantação em produção
- **[Componentes](/components/)** - Uso da biblioteca de componentes
- **[Personalizador de Tema](/theme-customizer/)** - Personalização de tema
