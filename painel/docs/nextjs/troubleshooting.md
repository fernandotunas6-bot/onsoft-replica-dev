# Resolução de Problemas no Next.js

Problemas comuns e soluções ao trabalhar com a versão Next.js do SIGA Plus.

## Problemas em Desenvolvimento

### Porta Já em Uso

**Problema:** A porta 3000 já está ocupada

**Soluções:**

```bash
# Use a different port
pnpm dev -p 3001

# Find and kill the process using the port
lsof -ti:3000 | xargs kill -9

# Or use the PORT environment variable
PORT=3001 pnpm dev
```

### Servidor de Desenvolvimento Lento

**Problema:** O servidor de desenvolvimento demora a iniciar ou a recarregar

**Soluções:**

1. **Ativar o Turbopack (experimental):**

   ```bash
   pnpm dev --turbo
   ```

2. **Limpar a cache do Next.js:**

   ```bash
   rm -rf .next
   pnpm dev
   ```

3. **Otimizar importações de pacotes:**

   ```typescript
   // next.config.ts
   const nextConfig = {
     experimental: {
       optimizePackageImports: [
         'lucide-react',
         '@radix-ui/react-icons',
         'recharts',
         '@tanstack/react-table',
       ],
     },
   }
   ```

### Erros de Resolução de Módulos

**Problema:** Não é possível resolver importações de módulos

**Soluções:**

1. **Verificar aliases de caminho:**

   ```typescript
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

2. **Verificar extensões de ficheiros:**

   ```typescript
   // Correct imports
   import { Button } from '@/components/ui/button'
   import type { User } from '@/types/user'
   
   // Avoid these
   import { Button } from '@/components/ui/button.tsx' // 
   import { User } from '@/types/user.ts' // 
   ```

3. **Verificar configuração do Next.js:**

   ```typescript
   // next.config.ts
   const nextConfig = {
     experimental: {
       typedRoutes: true, // Enable typed routes
     },
   }
   ```

### Problemas com Server e Client Components

**Problema:** Erros no limite (boundary) entre Server e Client Components

**Soluções:**

1. **Adicionar a diretiva "use client":**

   ```typescript
   // For components using hooks or event handlers
   "use client"
   
   import { useState } from 'react'
   
   export function InteractiveComponent() {
     const [state, setState] = useState()
     // Component logic
   }
   ```

2. **Separar a lógica de servidor e de cliente:**

   ```typescript
   // server-component.tsx (Server Component)
   import { ClientComponent } from './client-component'
   
   export async function ServerComponent() {
     const data = await fetchData() // Server-side data fetching
     
     return <ClientComponent data={data} />
   }
   
   // client-component.tsx (Client Component)
   "use client"
   
   export function ClientComponent({ data }) {
     const [state, setState] = useState()
     // Client-side logic
   }
   ```

3. **Tratar divergências de hidratação (hydration mismatches):**

   ```typescript
   "use client"
   
   import { useEffect, useState } from 'react'
   
   export function HydratedComponent() {
     const [mounted, setMounted] = useState(false)
   
     useEffect(() => {
       setMounted(true)
     }, [])
   
     if (!mounted) {
       return <div>Loading...</div> // Prevent hydration mismatch
     }
   
     return <div>{/* Client-only content */}</div>
   }
   ```

## Problemas de Compilação

### Erros de Compilação de TypeScript

**Problema:** A compilação falha devido a erros de TypeScript

**Soluções:**

1. **Executar verificação de tipos separadamente:**

   ```bash
   pnpm type-check
   ```

2. **Problemas de tipos comuns:**

   ```typescript
   // Fix Server Component props
   export default function Page({ 
     params 
   }: { 
     params: { id: string } 
   }) {
     return <div>Page {params.id}</div>
   }
   
   // Fix async component types
   export default async function AsyncPage() {
     const data = await fetchData()
     return <div>{data}</div>
   }
   
   // Fix metadata types
   import type { Metadata } from 'next'
   
   export const metadata: Metadata = {
     title: 'Page Title',
   }
   ```

3. **Configurar o rigor do TypeScript:**

   ```json
   // tsconfig.json
   {
     "compilerOptions": {
       "strict": true,
       "noUncheckedIndexedAccess": true,
       "exactOptionalPropertyTypes": true
     }
   }
   ```

### Problemas de Memória na Compilação

**Problema:** A compilação falha com erros de memória esgotada (out-of-memory)

**Soluções:**

```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" pnpm build

# Or set in package.json
{
  "scripts": {
    "build": "NODE_OPTIONS='--max-old-space-size=4096' next build"
  }
}
```

### Problemas de Exportação Estática

**Problema:** A exportação estática falha ou faltam páginas

**Soluções:**

1. **Configurar a exportação estática adequadamente:**

   ```typescript
   // next.config.ts
   const nextConfig = {
     output: 'export',
     trailingSlash: true,
     images: {
       unoptimized: true, // Required for static export
     },
     experimental: {
       missingSuspenseWithCSRBailout: false,
     }
   }
   ```

2. **Tratar rotas dinâmicas:**

   ```typescript
   // app/users/[id]/page.tsx
   export async function generateStaticParams() {
     const users = await getUsers()
     
     return users.map((user) => ({
       id: user.id.toString(),
     }))
   }
   ```

3. **Verificar recursos exclusivos de servidor:**

   ```typescript
   // Remove or conditionally render server-only code
   export default function Page() {
     return (
       <div>
         {/* Remove Image optimization for static export */}
         <img src="/image.jpg" alt="Image" />
         
         {/* Remove API routes references */}
         {/* <APIComponent /> */}
       </div>
     )
   }
   ```

## Problemas em Tempo de Execução

### Problemas de Roteamento

**Problema:** Rotas não funcionam corretamente

**Soluções:**

1. **Verificar convenções de nomes de ficheiros:**

   ```bash
   # Estrutura correta do App Router
   app/
   ├── page.tsx          # Rota /
   ├── about/
   │   └── page.tsx      # Rota /about
   ├── users/
   │   ├── page.tsx      # Rota /users
   │   └── [id]/
   │       └── page.tsx  # Rota /users/[id]
   └── (dashboard)/      # Grupo de rotas (não afeta URL)
       ├── layout.tsx    # Layout para rotas agrupadas
       └── analytics/
           └── page.tsx  # Rota /analytics
   ```

2. **Corrigir links de navegação:**

   ```typescript
   import Link from 'next/link'
   
   // Use Next.js Link for internal navigation
   <Link href="/dashboard">Dashboard</Link> // 
   <a href="/dashboard">Dashboard</a> //  (causes full page reload)
   
   // For external links
   <Link href="https://example.com" target="_blank" rel="noopener noreferrer">
     External
   </Link>
   ```

3. **Tratar rotas dinâmicas:**

   ```typescript
   import Link from 'next/link'
   
   // Dynamic route navigation
   <Link href={`/users/${user.id}`}>User Profile</Link>
   
   // Programmatic navigation
   import { useRouter } from 'next/navigation'
   
   function Component() {
     const router = useRouter()
     
     const handleClick = () => {
       router.push(`/users/${userId}`)
     }
   }
   ```

### Problemas no Carregamento de Fontes

**Problema:** Fontes não carregam ou ocorre FOUT (Flash of Unstyled Text)

**Soluções:**

1. **Configurar as fontes do Next.js adequadamente:**

   ```typescript
   // lib/fonts.ts
   import { Inter } from 'next/font/google'
   
   export const inter = Inter({
     subsets: ['latin'],
     variable: '--font-inter',
     display: 'swap', // Prevents FOIT
     preload: true,   // Preload for better performance
   })
   
   // app/layout.tsx
   import { inter } from '@/lib/fonts'
   
   export default function RootLayout({
     children,
   }: {
     children: React.ReactNode
   }) {
     return (
       <html lang="en" className={inter.variable}>
         <body className="font-sans antialiased">
           {children}
         </body>
       </html>
     )
   }
   ```

2. **Adicionar alternativas de fontes (fallbacks):**

   ```css
   /* app/globals.css */
   :root {
     --font-inter: 'Inter', system-ui, sans-serif;
   }
   
   .font-sans {
     font-family: var(--font-inter);
   }
   ```

3. **Tratar fontes personalizadas:**

   ```typescript
   // For local fonts
   import localFont from 'next/font/local'
   
   const customFont = localFont({
     src: './path/to/font.woff2',
     variable: '--font-custom',
     display: 'swap',
   })
   ```

### Problemas de Gestão de Estado

**Problema:** Store do Zustand não funciona com SSR

**Soluções:**

1. **Tratar a hidratação adequadamente:**

   ```typescript
   import { create } from 'zustand'
   import { persist } from 'zustand/middleware'
   
   const useStore = create<State>()(
     persist(
       (set, get) => ({
         // State and actions
       }),
       {
         name: 'app-storage',
         // Skip hydration on server
         skipHydration: true,
       }
     )
   )
   
   // In component
   export function Component() {
     const store = useStore()
     const [hydrated, setHydrated] = useState(false)
   
     useEffect(() => {
       useStore.persist.rehydrate()
       setHydrated(true)
     }, [])
   
     if (!hydrated) {
       return <div>Loading...</div>
     }
   
     return <div>{store.data}</div>
   }
   ```

2. **Usar wrapper exclusivo de cliente:**

   ```typescript
   // components/client-only.tsx
   "use client"
   
   import { useEffect, useState } from 'react'
   
   export function ClientOnly({ children }: { children: React.ReactNode }) {
     const [mounted, setMounted] = useState(false)
   
     useEffect(() => {
       setMounted(true)
     }, [])
   
     if (!mounted) return null
   
     return <>{children}</>
   }
   
   // Usage
   <ClientOnly>
     <StoreComponent />
   </ClientOnly>
   ```

### Problemas de Otimização de Imagens

**Problema:** Imagens não carregam ou não otimizam adequadamente

**Soluções:**

1. **Configurar o componente Image adequadamente:**

   ```typescript
   import Image from 'next/image'
   
   // For local images
   import heroImage from '@/public/hero.jpg'
   
   export function Hero() {
     return (
       <Image
         src={heroImage}
         alt="Hero image"
         priority // For above-the-fold images
         placeholder="blur" // Automatic blur placeholder
       />
     )
   }
   
   // For external images
   export function UserAvatar({ src, alt }: { src: string; alt: string }) {
     return (
       <Image
         src={src}
         alt={alt}
         width={40}
         height={40}
         className="rounded-full"
       />
     )
   }
   ```

2. **Configurar domínios remotos de imagens:**

   ```typescript
   // next.config.ts
   const nextConfig = {
     images: {
       remotePatterns: [
         {
           protocol: 'https',
           hostname: 'images.unsplash.com',
         },
         {
           protocol: 'https',
           hostname: 'example.com',
           pathname: '/images/**',
         },
       ],
     },
   }
   ```

3. **Tratar erros de carregamento de imagens:**

   ```typescript
   "use client"
   
   import Image from 'next/image'
   import { useState } from 'react'
   
   export function SafeImage({ src, alt, ...props }) {
     const [error, setError] = useState(false)
   
     if (error) {
       return <div className="bg-muted">Image failed to load</div>
     }
   
     return (
       <Image
         src={src}
         alt={alt}
         onError={() => setError(true)}
         {...props}
       />
     )
   }
   ```

## Problemas de Ambiente

### Variáveis de Ambiente Não Funcionam

**Problema:** As variáveis de ambiente estão como undefined

**Soluções:**

1. **Verificar a nomenclatura das variáveis:**

   ```bash
   # Client-side variables must start with NEXT_PUBLIC_
   NEXT_PUBLIC_API_URL=http://localhost:3001 
   API_URL=http://localhost:3001  (server-side only)
   ```

2. **Verificar nomes de ficheiros e ordem de carregamento:**

   ```bash
   .env                 # Carregado em todos os ambientes
   .env.local           # Carregado em todos os ambientes (ignorado pelo git)
   .env.development     # Carregado em desenvolvimento
   .env.production      # Carregado em produção
   .env.test            # Carregado em testes
   ```

3. **Aceder às variáveis corretamente:**

   ```typescript
   // Client-side access
   const apiUrl = process.env.NEXT_PUBLIC_API_URL
   
   // Server-side access
   const dbUrl = process.env.DATABASE_URL
   
   // Runtime validation
   if (!process.env.NEXT_PUBLIC_API_URL) {
     throw new Error('NEXT_PUBLIC_API_URL is required')
   }
   ```

### Diferenças de Ambiente de Implantação

**Problema:** A aplicação funciona localmente mas não em produção

**Soluções:**

1. **Testar a compilação de produção localmente:**

   ```bash
   pnpm build
   pnpm start
   ```

2. **Verificar problemas específicos de ambiente:**

   ```typescript
   // Handle development vs production differences
   const isDevelopment = process.env.NODE_ENV === 'development'
   const isProduction = process.env.NODE_ENV === 'production'
   
   if (isDevelopment) {
     // Development-only code
   }
   
   if (isProduction) {
     // Production-only code
   }
   ```

3. **Verificar caminhos de recursos:**

   ```typescript
   // Use absolute paths for static assets
   <Image src="/images/logo.png" alt="Logo" width={200} height={50} />
   
   // For dynamic imports
   const Component = dynamic(() => import('@/components/heavy-component'), {
     ssr: false, // Disable SSR if needed
   })
   ```

## Problemas de Desempenho

### Carregamento Lento de Páginas

**Problema:** Páginas carregam lentamente

**Soluções:**

1. **Implementar estados de carregamento adequados:**

   ```typescript
   // app/dashboard/loading.tsx
   export default function Loading() {
     return (
       <div className="space-y-4">
         <div className="h-8 bg-muted animate-pulse rounded" />
         <div className="h-32 bg-muted animate-pulse rounded" />
       </div>
     )
   }
   ```

2. **Usar importações dinâmicas para componentes pesados:**

   ```typescript
   import dynamic from 'next/dynamic'
   
   const HeavyChart = dynamic(() => import('@/components/heavy-chart'), {
     loading: () => <div>Loading chart...</div>,
     ssr: false, // Skip SSR if component is client-only
   })
   ```

3. **Otimizar a obtenção de dados:**

   ```typescript
   // Use streaming for slow data
   import { Suspense } from 'react'
   
   export default function Page() {
     return (
       <div>
         <h1>Dashboard</h1>
         <Suspense fallback={<div>Loading stats...</div>}>
           <DashboardStats />
         </Suspense>
         <Suspense fallback={<div>Loading charts...</div>}>
           <DashboardCharts />
         </Suspense>
       </div>
     )
   }
   ```

### Problemas de Tamanho de Bundle

**Problema:** Tamanho grande do bundle a afetar o desempenho

**Soluções:**

1. **Analisar o tamanho do bundle:**

   ```bash
   ANALYZE=true pnpm build
   ```

2. **Otimizar importações:**

   ```typescript
   // Tree-shake properly
   import { Button } from '@/components/ui/button' // 
   import * as UI from '@/components/ui' // 
   
   // Use dynamic imports for large libraries
   const { format } = await import('date-fns')
   ```

3. **Configurar otimização de bundle:**

   ```typescript
   // next.config.ts
   const nextConfig = {
     experimental: {
       optimizePackageImports: ['lucide-react', 'recharts'],
     },
     webpack: (config) => {
       config.optimization.splitChunks = {
         chunks: 'all',
         cacheGroups: {
           vendor: {
             test: /[\\/]node_modules[\\/]/,
             name: 'vendors',
             chunks: 'all',
           },
         },
       }
       return config
     },
   }
   ```

## Depuração (Debugging)

### Depuração em Desenvolvimento

**Problema:** Necessidade de depurar o comportamento da aplicação

**Soluções:**

1. **Usar recursos de depuração do Next.js:**

   ```bash
   # Enable debug mode
   DEBUG=* pnpm dev
   
   # Debug specific modules
   DEBUG=next:* pnpm dev
   ```

2. **Adicionar registos estratégicos (logging):**

   ```typescript
   // Server Component debugging
   export default async function Page() {
     console.log('Page rendered at:', new Date().toISOString())
     
     const data = await fetchData()
     console.log('Data fetched:', data)
     
     return <div>Page content</div>
   }
   
   // Client Component debugging
   "use client"
   
   export function ClientComponent() {
     useEffect(() => {
       console.log('Component mounted')
     }, [])
   }
   ```

3. **Usar React DevTools:**

   ```typescript
   // Add display names for better debugging
   function MyComponent() {
     return <div>Content</div>
   }
   
   MyComponent.displayName = 'MyComponent'
   ```

### Depuração em Produção

**Problema:** Problemas ocorrem apenas em produção

**Soluções:**

1. **Ativar source maps:**

   ```typescript
   // next.config.ts
   const nextConfig = {
     productionBrowserSourceMaps: true, // Enable for debugging
   }
   ```

2. **Adicionar boundaries de erro:**

   ```typescript
   "use client"
   
   import { Component, ErrorInfo, ReactNode } from 'react'
   
   interface Props {
     children: ReactNode
   }
   
   interface State {
     hasError: boolean
   }
   
   export class ErrorBoundary extends Component<Props, State> {
     public state: State = {
       hasError: false
     }
   
     public static getDerivedStateFromError(_: Error): State {
       return { hasError: true }
     }
   
     public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
       console.error('Uncaught error:', error, errorInfo)
       // Send to error reporting service
     }
   
     public render() {
       if (this.state.hasError) {
         return <div>Something went wrong.</div>
       }
   
       return this.props.children
     }
   }
   ```

## Obter Ajuda

### Recursos do Next.js

- **[Documentação do Next.js](https://nextjs.org/docs)** - Documentação oficial do Next.js
- **[Discord do Next.js](https://discord.gg/nextjs)** - Suporte da comunidade
- **[Discussões no GitHub](https://github.com/vercel/next.js/discussions)** - Perguntas e respostas e discussões

### Informação de Depuração

Ao reportar problemas, inclua:

```bash
# System information
node --version
pnpm --version
next --version

# Project information
pnpm list --depth=0

# Build information
pnpm build 2>&1 | tee build.log
```

### Lista de Verificação de Depuração

Antes de reportar problemas:

- [ ] Limpar cache do `.next` e recompilar
- [ ] Verificar erros de TypeScript com `pnpm type-check`
- [ ] Verificar se as variáveis de ambiente estão definidas corretamente
- [ ] Testar com uma nova instalação `pnpm install`
- [ ] Verificar o console do navegador por erros
- [ ] Testar a compilação de produção localmente

## Próximos Passos

- **[Guia de Desenvolvimento](/nextjs/development)** - Fluxo de trabalho de desenvolvimento
- **[Compilação e Implantação](/nextjs/build-deploy)** - Implantação em produção
- **[Componentes](/components/)** - Utilização da biblioteca de componentes
- **[Personalizador de Tema](/theme-customizer/)** - Personalização do tema
