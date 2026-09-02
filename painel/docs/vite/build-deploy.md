# Vite Build & Implantação

Aprenda a gerar o build e implantar a versão Vite do Template SIGA Plus em produção.

## Build de Produção

### Gerar Build para Produção

Crie um build de produção otimizado:

```bash
# Build for production
pnpm build

# Output will be in the dist/ directory
```

### Estrutura do Resultado do Build

```text
dist/
├── assets/
│   ├── index-[hash].js          # Main application bundle
│   ├── vendor-[hash].js         # Third-party libraries
│   ├── index-[hash].css         # Compiled styles
│   └── [asset]-[hash].[ext]     # Static assets with cache busting
├── index.html                   # Main HTML file
└── favicon.svg                  # Favicon and other static files
```

### Configuração do Build

A configuração do Vite inclui otimizações:

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    // Output directory
    outDir: 'dist',
    
    // Generate source maps for debugging
    sourcemap: true,
    
    // Optimize chunk sizes
    chunkSizeWarningLimit: 1000,
    
    // Rollup options for advanced optimization
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching
        manualChunks: {
          // Separate vendor libraries
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
          charts: ['recharts'],
          table: ['@tanstack/react-table'],
        },
      },
    },
    
    // Minification options
    minify: 'esbuild',
    target: 'es2015',
  },
})
```

## Opções de Implantação

### Vercel (Recomendado)

A Vercel oferece implantação sem necessidade de configuração para aplicações Vite:

#### Implantação Automática

1. **Conetar Repositório:**
   - Associe o seu repositório GitHub à Vercel
   - Implantações automáticas a cada push

2. **Configurar Projeto:**
   ```bash
   # Vercel will auto-detect Vite configuration
   # Build Command: pnpm build
   # Output Directory: dist
   # Install Command: pnpm install
   ```

3. **Variáveis de Ambiente:**
   ```bash
   # Add environment variables in Vercel dashboard
   VITE_APP_NAME=SIGA Plus Admin
   VITE_API_URL=https://api.yourdomain.com
   ```

#### Implantação Manual

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from command line
vercel

# Production deployment
vercel --prod
```

### Netlify

Implante no Netlify através de arrastar e largar ou integração com Git:

#### Definições de Build

```bash
# Build command
pnpm build

# Publish directory
dist

# Environment variables
VITE_APP_NAME=SIGA Plus Admin
```

#### Configuração do Netlify

Crie o ficheiro `netlify.toml` para configuração avançada:

```toml
[build]
  command = "pnpm build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[build.environment]
  NODE_VERSION = "18"
```

### GitHub Pages

Implante no GitHub Pages utilizando o GitHub Actions:

#### Fluxo de Trabalho do GitHub Actions

Crie o ficheiro `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout
      uses: actions/checkout@v4
      
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'pnpm'
        
    - name: Install pnpm
      run: npm install -g pnpm
      
    - name: Install dependencies
      run: pnpm install
      working-directory: ./vite-version
      
    - name: Build
      run: pnpm build
      working-directory: ./vite-version
      
    - name: Deploy to GitHub Pages
      uses: peaceiris/actions-gh-pages@v3
      with:
        github_token: ${{ secrets.GITHUB_TOKEN }}
        publish_dir: ./vite-version/dist
```

#### Configuração do Caminho Base

Para implantação em subdiretórios no GitHub Pages:

```typescript
// vite.config.ts
export default defineConfig({
  base: '/your-repo-name/', // Replace with your repository name
  // ... other configuration
})
```

### AWS S3 + CloudFront

Implante na AWS para alojamento escalável:

#### Configuração do Bucket S3

```bash
# Create S3 bucket
aws s3 mb s3://your-bucket-name

# Configure bucket for static website hosting
aws s3 website s3://your-bucket-name --index-document index.html --error-document index.html

# Upload files
aws s3 sync dist/ s3://your-bucket-name --delete
```

#### Distribuição CloudFront

Crie uma distribuição CloudFront para CDN:

```json
{
  "Origins": [{
    "DomainName": "your-bucket-name.s3-website.region.amazonaws.com",
    "Id": "S3-your-bucket-name",
    "CustomOriginConfig": {
      "HTTPPort": 80,
      "OriginProtocolPolicy": "http-only"
    }
  }],
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-your-bucket-name",
    "ViewerProtocolPolicy": "redirect-to-https"
  }
}
```

### Implantação com Docker

Empacote a sua aplicação em contentores (containers) para implantação:

#### Dockerfile

```dockerfile
# Multi-stage build for optimized image
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm && pnpm install

# Copy source code
COPY . .

# Build application
RUN pnpm build

# Production stage
FROM nginx:alpine

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

#### Configuração do Nginx

```nginx
# nginx.conf
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Handle client-side routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
}
```

#### Comandos do Docker

```bash
# Build image
docker build -t shadcn-admin .

# Run container
docker run -p 80:80 shadcn-admin

# Deploy to registry
docker tag shadcn-admin your-registry/shadcn-admin
docker push your-registry/shadcn-admin
```

## Variáveis de Ambiente

### Desenvolvimento vs Produção

Configure variáveis específicas por ambiente:

```bash
# .env.local (development)
VITE_APP_NAME=SIGA Plus Admin (Dev)
VITE_API_URL=http://localhost:3001
VITE_DEBUG=true

# .env.production (production)
VITE_APP_NAME=SIGA Plus Admin
VITE_API_URL=https://api.yourdomain.com
VITE_DEBUG=false
```

### Utilizar Variáveis de Ambiente

```typescript
// Access in your application
const config = {
  appName: import.meta.env.VITE_APP_NAME,
  apiUrl: import.meta.env.VITE_API_URL,
  isDebug: import.meta.env.VITE_DEBUG === 'true',
}
```

## Otimização de Desempenho

### Otimizações do Build

#### Análise do Tamanho do Bundle

```bash
# Install bundle analyzer
pnpm add -D rollup-plugin-visualizer

# Add to vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    // ... other plugins
    visualizer({
      filename: 'dist/stats.html',
      open: true,
      gzipSize: true,
    }),
  ],
})
```

#### Otimização de Recursos (Assets)

```typescript
// vite.config.ts optimizations
export default defineConfig({
  build: {
    // Inline small assets as base64
    assetsInlineLimit: 4096,
    
    // Optimize CSS
    cssMinify: 'esbuild',
    
    // Enable compression
    reportCompressedSize: true,
  },
})
```

### Otimizações em Tempo de Execução

#### Carregamento Preguiçoso (Lazy Loading)

```typescript
// Implement lazy loading for better performance
const Dashboard = lazy(() => import('@/app/(dashboard)/page'))
const Analytics = lazy(() => import('@/app/(dashboard)/analytics/page'))

function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/analytics" element={<Analytics />} />
      </Routes>
    </Suspense>
  )
}
```

#### Service Worker

Adicione um service worker para empenhamento (caching):

```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],
      },
    }),
  ],
})
```

## Considerações de Segurança

### Política de Segurança do Conteúdo (CSP)

Adicione cabeçalhos CSP por motivos de segurança:

```html
<!-- In index.html -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: https:;
  connect-src 'self' https://api.yourdomain.com;
">
```

### Segurança do Build

```typescript
// vite.config.ts security settings
export default defineConfig({
  build: {
    // Remove source maps in production
    sourcemap: process.env.NODE_ENV === 'development',
    
    // Minify code
    minify: 'esbuild',
  },
  
  // Secure server options
  server: {
    https: false, // Enable HTTPS in development if needed
    cors: true,
  },
})
```

## Monitorização e Análise

### Monitorização do Build

Acompanhe o desempenho do build:

```bash
# Build with timing information
pnpm build --reporter verbose

# Analyze bundle size
pnpm build && npx vite-bundle-analyzer
```

### Monitorização de Desempenho

Adicione monitorização de desempenho:

```typescript
// Track page load performance
window.addEventListener('load', () => {
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
  console.log('Page load time:', navigation.loadEventEnd - navigation.fetchStart)
})
```

## Resolução de Problemas

### Problemas Comuns no Build

**Erros de módulo não encontrado:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

**Problemas de memória no build:**
```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" pnpm build
```

**Erros de TypeScript:**
```bash
# Run type checking separately
pnpm type-check
```

### Problemas de Implantação

**Roteamento SPA não funciona:**
- Certifique-se de que o servidor redireciona todas as rotas para index.html
- Verifique a configuração do caminho base para implantações em subdiretórios

**Recursos não carregam:**
- Verifique os caminhos dos recursos no resultado do build
- Verifique as definições de CORS para recursos entre domínios

**Variáveis de ambiente não funcionam:**
- Certifique-se de que as variáveis começam com `VITE_`
- Verifique os nomes e valores das variáveis na plataforma de implantação

## Próximos Passos

- **[Resolução de Problemas](/vite/troubleshooting)** - Problemas comuns e soluções
- **[Guia de Desenvolvimento](/vite/development)** - Fluxo de trabalho de desenvolvimento
- **[Componentes](/components/)** - Uso da biblioteca de componentes
- **[Personalizador de Tema](/theme-customizer/)** - Personalize o seu tema
