import { lazy } from 'react'
import { SHOW_TEMPLATE_SURFACES } from '@/lib/feature-flags'
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

const SignIn = lazy(() => import('@/app/auth/sign-in/page'))
const SignIn2 = lazy(() => import('@/app/auth/sign-in-2/page'))
const SignIn3 = lazy(() => import('@/app/auth/sign-in-3/page'))
const SignUp = lazy(() => import('@/app/auth/sign-up/page'))
const SignUp2 = lazy(() => import('@/app/auth/sign-up-2/page'))
const SignUp3 = lazy(() => import('@/app/auth/sign-up-3/page'))
const ForgotPassword = lazy(() => import('@/app/auth/forgot-password/page'))
const ForgotPassword2 = lazy(() => import('@/app/auth/forgot-password-2/page'))
const ForgotPassword3 = lazy(() => import('@/app/auth/forgot-password-3/page'))

const Unauthorized = lazy(() => import('@/app/errors/unauthorized/page'))
const Forbidden = lazy(() => import('@/app/errors/forbidden/page'))
const NotFound = lazy(() => import('@/app/errors/not-found/page'))
const InternalServerError = lazy(() => import('@/app/errors/internal-server-error/page'))
const UnderMaintenance = lazy(() => import('@/app/errors/under-maintenance/page'))

const UserSettings = lazy(() => import('@/app/settings/user/page'))
const AccountSettings = lazy(() => import('@/app/settings/account/page'))
const BillingSettings = lazy(() => import('@/app/settings/billing/page'))
const AppearanceSettings = lazy(() => import('@/app/settings/appearance/page'))
const NotificationSettings = lazy(() => import('@/app/settings/notifications/page'))
const ConnectionSettings = lazy(() => import('@/app/settings/connections/page'))

export interface RouteConfig {
  path: string
  element: React.ReactNode
  children?: RouteConfig[]
}

/** Só auth/settings legados usam ponte; produto comercial renderiza páginas vivas. */
function maybeAlive(path: string, live: React.ReactNode): React.ReactNode {
  if (SHOW_TEMPLATE_SURFACES) return live
  return <AliveBridgeRedirect path={path} />
}

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

  // Login escolar vive no SIGA — ponte
  { path: "/auth/sign-in", element: maybeAlive("/auth/sign-in", <SignIn />) },
  { path: "/auth/sign-in-2", element: maybeAlive("/auth/sign-in-2", <SignIn2 />) },
  { path: "/auth/sign-in-3", element: maybeAlive("/auth/sign-in-3", <SignIn3 />) },
  { path: "/auth/sign-up", element: maybeAlive("/auth/sign-up", <SignUp />) },
  { path: "/auth/sign-up-2", element: maybeAlive("/auth/sign-up-2", <SignUp2 />) },
  { path: "/auth/sign-up-3", element: maybeAlive("/auth/sign-up-3", <SignUp3 />) },
  { path: "/auth/forgot-password", element: maybeAlive("/auth/forgot-password", <ForgotPassword />) },
  { path: "/auth/forgot-password-2", element: maybeAlive("/auth/forgot-password-2", <ForgotPassword2 />) },
  { path: "/auth/forgot-password-3", element: maybeAlive("/auth/forgot-password-3", <ForgotPassword3 />) },

  { path: "/errors/unauthorized", element: <Unauthorized /> },
  { path: "/errors/forbidden", element: <Forbidden /> },
  { path: "/errors/not-found", element: <NotFound /> },
  { path: "/errors/internal-server-error", element: <InternalServerError /> },
  { path: "/errors/under-maintenance", element: <UnderMaintenance /> },

  { path: "/settings/user", element: maybeAlive("/settings/user", <UserSettings />) },
  { path: "/settings/account", element: maybeAlive("/settings/account", <AccountSettings />) },
  { path: "/settings/billing", element: maybeAlive("/settings/billing", <BillingSettings />) },
  { path: "/settings/appearance", element: maybeAlive("/settings/appearance", <AppearanceSettings />) },
  { path: "/settings/notifications", element: maybeAlive("/settings/notifications", <NotificationSettings />) },
  { path: "/settings/connections", element: maybeAlive("/settings/connections", <ConnectionSettings />) },

  { path: "*", element: <NotFound /> },
]
