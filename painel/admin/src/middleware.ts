import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { resolveAdminAliveBridge } from '@/lib/alive-bridges'
import { getSaasApiUrl } from '@/lib/ecosystem-urls'
import {
  SHOW_TEMPLATE_SURFACES,
  isPlatformRoute,
} from '@/lib/feature-flags'

/** Conta escolar com sessão Supabase não entra no Control Center (Fase 10). */
async function assertPlatformAdmin(
  accessToken: string | undefined,
): Promise<'ok' | 'denied' | 'unknown'> {
  if (!accessToken) return 'denied'
  try {
    const res = await fetch(getSaasApiUrl('/api/saas/me'), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(4_000),
    })
    if (res.status === 401 || res.status === 403) return 'denied'
    if (!res.ok) return 'unknown'
    const body = (await res.json()) as { platformAdmin?: boolean }
    return body.platformAdmin ? 'ok' : 'denied'
  } catch {
    // SIGA offline: PlatformAdminGate no cliente confirma.
    return 'unknown'
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/login') {
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  if (pathname === '/register') {
    const bridge = resolveAdminAliveBridge('/register')
    if (bridge?.external) {
      return NextResponse.redirect(bridge.to)
    }
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  if (!SHOW_TEMPLATE_SURFACES) {
    const bridge = resolveAdminAliveBridge(pathname)
    if (bridge) {
      if (bridge.external) {
        return NextResponse.redirect(bridge.to)
      }
      return NextResponse.redirect(new URL(bridge.to, request.url))
    }
  }

  let response = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return response
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user && (pathname === "/sign-in" || pathname.startsWith("/sign-in/"))) {
    return NextResponse.redirect(new URL("/tenants", request.url))
  }

  if (isPlatformRoute(pathname) && !user) {
    const signIn = new URL('/sign-in', request.url)
    signIn.searchParams.set('next', pathname)
    return NextResponse.redirect(signIn)
  }

  if (isPlatformRoute(pathname) && user) {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const gate = await assertPlatformAdmin(session?.access_token)
    if (gate === 'denied') {
      await supabase.auth.signOut()
      const denied = new URL('/sign-in', request.url)
      denied.searchParams.set('error', 'platform')
      return NextResponse.redirect(denied)
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
