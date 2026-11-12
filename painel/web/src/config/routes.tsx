import { lazy } from 'react'
import { AliveBridgeRedirect } from '@/components/alive-bridge-redirect'
import Landing from '@/app/landing/page'

type PageModule = { default: React.ComponentType }

/**
 * Página carregada à parte. Se for a página por onde a pessoa entra (por exemplo
 * /start, vindo do «Criar escola» do SIGA), começa a descarregar logo, em paralelo
 * com o arranque do React, em vez de esperar pelo primeiro desenho.
 */
function lazyPage(matches: (path: string) => boolean, load: () => Promise<PageModule>) {
  if (typeof window !== 'undefined') {
    const base = String(import.meta.env.VITE_BASENAME || '').replace(/\/+$/, '')
    const path = window.location.pathname.slice(base.length) || '/'
    if (matches(path)) void load()
  }
  return lazy(load)
}

const at = (route: string) => (path: string) => path === route || path === `${route}/`

// Só a página inicial vai no pacote de entrada; as outras carregam quando se abrem.
// O assistente /start (formulários, zod e selectores) pesava em todas as visitas.
const FAQs = lazyPage(at('/faqs'), () => import('@/app/faqs/page'))
const Pricing = lazyPage(at('/pricing'), () => import('@/app/pricing/page'))
const StartSchool = lazyPage(at('/start'), () => import('@/app/start/page'))
const Terms = lazyPage(at('/termos'), () => import('@/app/termos/page'))
const Privacy = lazyPage(at('/privacidade'), () => import('@/app/privacidade/page'))
const Download = lazyPage(at('/download'), () => import('@/app/download/page'))
const Blog = lazyPage(at('/blog'), () => import('@/app/blog/page'))
const BlogPost = lazyPage((path) => path.startsWith('/blog/'), () => import('@/app/blog/post-page'))
const EnsinoPublico = lazyPage(at('/ensino-publico'), () => import('@/app/ensino-publico/page'))

const Dashboard = lazy(() => import('@/app/dashboard/page'))
const Dashboard2 = lazy(() => import('@/app/dashboard-2/page'))
const Mail = lazy(() => import('@/app/mail/page'))
const Tasks = lazy(() => import('@/app/tasks/page'))
const Chat = lazy(() => import('@/app/chat/page'))
const Calendar = lazy(() => import('@/app/calendar/page'))
const Users = lazy(() => import('@/app/users/page'))

const Unauthorized = lazy(() => import('@/app/errors/unauthorized/page'))
const Forbidden = lazy(() => import('@/app/errors/forbidden/page'))
const NotFound = lazy(() => import('@/app/errors/not-found/page'))
const InternalServerError = lazy(() => import('@/app/errors/internal-server-error/page'))
const UnderMaintenance = lazy(() => import('@/app/errors/under-maintenance/page'))

export interface RouteConfig {
  path: string
  element: React.ReactNode
  children?: RouteConfig[]
}

/**
 * Endereços que vieram do modelo de UI (entrar, registar, recuperar a senha,
 * definições). O WEB não tem contas: cada um leva ao destino vivo de
 * lib/alive-bridges.ts (SIGA, /start, /pricing ou DOC). As páginas de demonstração
 * que existiam por trás, com formulários que não enviavam nada, saíram a 11/11/2026.
 */
const BRIDGED_PATHS = [
  "/auth/sign-in",
  "/auth/sign-in-2",
  "/auth/sign-in-3",
  "/auth/sign-up",
  "/auth/sign-up-2",
  "/auth/sign-up-3",
  "/auth/forgot-password",
  "/auth/forgot-password-2",
  "/auth/forgot-password-3",
  "/settings",
  "/settings/user",
  "/settings/account",
  "/settings/billing",
  "/settings/appearance",
  "/settings/notifications",
  "/settings/connections",
] as const

export const routes: RouteConfig[] = [
  { path: "/", element: <Landing /> },
  { path: "/landing", element: <Landing /> },
  { path: "/start", element: <StartSchool /> },
  { path: "/pricing", element: <Pricing /> },
  { path: "/faqs", element: <FAQs /> },
  { path: "/termos", element: <Terms /> },
  { path: "/privacidade", element: <Privacy /> },
  { path: "/download", element: <Download /> },
  { path: "/ensino-publico", element: <EnsinoPublico /> },
  { path: "/blog", element: <Blog /> },
  { path: "/blog/:slug", element: <BlogPost /> },

  // Produto vivo (funções reais do funil comercial)
  { path: "/dashboard", element: <Dashboard /> },
  { path: "/dashboard-2", element: <Dashboard2 /> },
  { path: "/mail", element: <Mail /> },
  { path: "/tasks", element: <Tasks /> },
  { path: "/chat", element: <Chat /> },
  { path: "/calendar", element: <Calendar /> },
  { path: "/users", element: <Users /> },

  { path: "/errors/unauthorized", element: <Unauthorized /> },
  { path: "/errors/forbidden", element: <Forbidden /> },
  { path: "/errors/not-found", element: <NotFound /> },
  { path: "/errors/internal-server-error", element: <InternalServerError /> },
  { path: "/errors/under-maintenance", element: <UnderMaintenance /> },

  ...BRIDGED_PATHS.map((path) => ({ path, element: <AliveBridgeRedirect path={path} /> })),

  { path: "*", element: <NotFound /> },
]
