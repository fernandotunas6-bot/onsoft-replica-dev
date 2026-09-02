# Arquitetura & Segurança de Rotas (RBAC)

> **SIGA (app escolar):** mapa actual de rotas, sidebar e papéis em
> [Navegação SIGA](/siga/navegacao). Este artigo descreve o modelo genérico;
> as rotas `/admin/*` abaixo são **legado de template** — o SIGA real usa
> `/alunos`, `/pedagogica`, `/financeiro`, etc.

Documentação técnica sobre a proteção de rotas, middlewares de autenticação, validação de licenças e o modelo de Controlo de Acessos Baseado em Papéis (**RBAC**) no **SIGA Plus**.

---

## Níveis de Classificação de Rotas

As rotas da plataforma estão organizadas em três categorias de segurança estritas:

### 1. Rotas Públicas (Acesso Livre)
Rotas acessíveis por qualquer visitante sem necessidade de autenticação:
- `/` - Página Inicial / Portal Institucional Público
- `/login` - Autenticação de Utilizadores
- `/recuperar-senha` - Recuperação de Acesso
- `/docs/*` - Documentação e Guias da Plataforma

### 2. Rotas do Painel Admin Central (SGA Core)
Rotas restritas aos administradores globais da plataforma SIGA Plus, responsáveis pelo controlo de instâncias e clientes:
- `/central-admin/clientes` - Lista de clientes e submissões
- `/central-admin/aprovacoes` - Fila de aprovação de instâncias de clientes
- `/central-admin/licencas` - Emissão e revogação de tokens digitais
- `/central-admin/auditoria` - Logs globais de segurança e acessos

### 3. Rotas do Painel Admin do Cliente (Acessos Limitados)
Consola de gestão da instituição cliente com acessos condicionados pela função (Role) do utilizador:
- `/dashboard` - Visão geral operacional (restrita ao perfil do utilizador)
- `/admin/configuracoes` - Definições locais da instituição
- `/admin/academico/*` - Gestão de turmas, matrículas e alunos
- `/admin/pautas/*` - Lançamento e emissão de pautas académicas
- `/admin/financeiro/*` - Propinas, cobranças e relatórios financeiros
- `/admin/docente/*` - Área de professores (sumários, presenças, notas)
- `/admin/catracas/*` - Controlo físico e monitorização de entradas/saídas em tempo real

---

## Matriz de Permissões por Papel (RBAC)

A tabela seguinte define os direitos de acesso no **Painel Admin do Cliente**:

| Rota / Módulo | Admin Institucional | Secretaria | Financeiro | Docente | Operador Catracas |
|---|:---:|:---:|:---:|:---:|:---:|
| `/dashboard` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/admin/configuracoes` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/admin/utilizadores` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/admin/academico/*` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `/admin/pautas/*` | ✅ | ✅ | ❌ | Read-Only | ❌ |
| `/admin/financeiro/*` | ✅ | ❌ | ✅ | ❌ | ❌ |
| `/admin/docente/*` | ✅ | ❌ | ❌ | ✅ | ❌ |
| `/admin/catracas/*` | ✅ | ❌ | ❌ | ❌ | ✅ |

---

## Pipeline de Proteção (Middleware Guards)

Sempre que um utilizador tenta aceder a uma rota protegida, a plataforma executa a seguinte sequência de validações:

```
Requisição de Rota Protegida
       │
       ▼
[1] Sessão Válida (JWT Supabase)? ── No ──► Redirecionar para /login
       │
      Yes
       ▼
[2] Licença Aprovada no Central Admin? ── No ──► Redirecionar para /aguardando-aprovacao
       │
      Yes
       ▼
[3] Papel (Role) tem Permissão para a Rota? ── No ──► Redirecionar para /unauthorized (403)
       │
      Yes
       ▼
Conceder Acesso à Rota Solicitada
```

---

## Exemplos de Implementação

### Middleware no Next.js (`src/middleware.ts`)

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Rotas públicas isentas de verificação
  if (pathname.startsWith('/login') || pathname.startsWith('/docs')) {
    return NextResponse.next()
  }

  // 2. Criar cliente Supabase e verificar sessão
  const supabase = createServerClient(...)
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 3. Verificar estado de aprovação da licença no Painel Central
  const licenseStatus = request.cookies.get('siga_license_status')?.value
  if (licenseStatus !== 'APPROVED' && !pathname.startsWith('/aguardando-aprovacao')) {
    return NextResponse.redirect(new URL('/aguardando-aprovacao', request.url))
  }

  // 4. Verificação de papel (RBAC) para rotas restritas
  const userRole = session.user.user_metadata?.role

  if (pathname.startsWith('/admin/configuracoes') && userRole !== 'ADMIN_INSTITUCIONAL') {
    return NextResponse.redirect(new URL('/unauthorized', request.url))
  }

  return NextResponse.next()
}
```

### Guard de Rota no React / Vite (`src/components/ProtectedRoute.tsx`)

```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

interface ProtectedRouteProps {
  allowedRoles?: string[]
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { session, role, isLicenseApproved, loading } = useAuth()

  if (loading) return <div>A carregar verificações de segurança...</div>

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (!isLicenseApproved) {
    return <Navigate to="/aguardando-aprovacao" replace />
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <Outlet />
}
```

---

## Boas Práticas de Segurança

1. **Nunca Confiar no Lado do Cliente** - Todas as Server Actions e APIs verificam novamente as permissões no servidor.
2. **Encriptação de Cookies de Sessão** - Utilização de cookies HttpOnly com flag `Secure` e `SameSite=Lax`.
3. **Log de Tentativas de Acesso Negado** - Todas as tentativas de violação de rota geram registos no Painel Admin Central para auditoria.
