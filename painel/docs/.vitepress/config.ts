import { defineConfig } from 'vitepress'

const isProd = process.env.NODE_ENV === 'production' || process.env.CF_PAGES === '1'
const PLATFORM_DOMAIN = String(process.env.VITE_PLATFORM_DOMAIN || process.env.PLATFORM_DOMAIN || 'portal-siga.com')
  .trim()
  .toLowerCase()
  .replace(/^\.+|\.+$/g, '')
const WEB_URL = process.env.VITE_WEB_URL || (isProd ? `https://www.${PLATFORM_DOMAIN}` : 'http://localhost:5174')
const SIGA_URL = process.env.VITE_SIGA_URL || (isProd ? `https://${PLATFORM_DOMAIN}` : 'http://localhost:3006')
const ADMIN_URL = process.env.VITE_ADMIN_URL || (isProd ? `https://admin.${PLATFORM_DOMAIN}` : 'http://localhost:3005')
const PAYFLOW_URL = process.env.VITE_PAYFLOW_URL || (isProd ? `https://payflow.${PLATFORM_DOMAIN}` : 'http://localhost:3007')

export default defineConfig({
  lang: 'pt-PT',
  title: 'SIGA Plus',
  description: 'Documentação Oficial da Plataforma SIGA Plus - Sistema Proprietário de Gestão Académica e Administrativa.',
  ignoreDeadLinks: true,

  vite: {
    optimizeDeps: {
      include: ['vue'],
    },
    server: {
      warmup: {
        clientFiles: ['./index.md', './guide/index.md'],
      },
    },
  },

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guia', link: '/guide/' },
      { text: 'SIGA', link: '/siga/navegacao' },
      { text: 'WEB', link: '/web/criar-escola' },
      { text: 'ADMIN', link: '/admin/control-center' },
      { text: 'Arquitetura', link: '/arquitetura/' },
      { text: 'Integrações', link: '/integracoes/' },
      { text: 'Financeiro', link: '/financeiro/saft-agt-exportacao' },
      {
        text: 'Apps',
        items: [
          { text: 'Portal WEB', link: WEB_URL },
          { text: 'Control Center', link: `${ADMIN_URL}/tenants` },
          { text: 'SIGA escolar', link: SIGA_URL },
          { text: 'PayFlow', link: PAYFLOW_URL },
        ],
      },
    ],

    sidebar: {
      '/arquitetura/': [
        {
          text: 'Arquitetura do ecossistema',
          items: [
            { text: 'Visão geral', link: '/arquitetura/' },
            { text: 'Responsabilidades', link: '/arquitetura/responsabilidades' },
            { text: 'Fluxos e provisionamento', link: '/arquitetura/fluxos' },
          ],
        },
      ],

      '/admin/': [
        {
          text: 'SaaS Control Center',
          items: [
            { text: 'Visão geral', link: '/admin/' },
            { text: 'Control Center', link: '/admin/control-center' },
            { text: 'Domínios', link: '/admin/domains' },
          ],
        },
      ],

      '/web/': [
        {
          text: 'Portal WEB',
          items: [
            { text: 'Visão geral', link: '/web/' },
            { text: 'Criar escola', link: '/web/criar-escola' },
            { text: 'Onboarding pós-criação', link: '/web/onboarding-pos-criacao' },
          ],
        },
      ],

      '/siga/': [
        {
          text: 'SIGA escolar',
          items: [
            { text: 'Visão geral', link: '/siga/' },
            { text: 'Navegação e permissões', link: '/siga/navegacao' },
          ],
        },
      ],

      '/integracoes/': [
        {
          text: 'Integrações',
          items: [
            { text: 'Visão geral', link: '/integracoes/' },
            { text: 'EMIS / Multicaixa e Unitel', link: '/integracoes/emis-multicaixa-unitel' },
            { text: 'Pedido ao banco', link: '/integracoes/gateway-portal-banco' },
            { text: 'Checklist produção', link: '/integracoes/gateway-producao' },
            { text: 'Runbook suporte', link: '/integracoes/gateway-runbook-suporte' },
          ],
        },
      ],

      '/financeiro/': [
        {
          text: 'Financeiro escolar',
          items: [
            { text: 'Exportação SAFT-AO / AGT', link: '/financeiro/saft-agt-exportacao' },
            { text: 'PayFlow (cobrança)', link: '/financeiro/payflow' },
          ],
        },
      ],

      '/guide/': [
        {
          text: 'Primeiros Passos',
          items: [
            { text: 'Visão Geral', link: '/guide/' },
            { text: 'Instalação & Ativação', link: '/guide/installation' },
            { text: 'SQL SGA (checklist)', link: '/guide/sql-sga' },
            { text: 'Stack por aplicação', link: '/guide/choosing-framework' },
            { text: 'Navegação SIGA', link: '/siga/navegacao' },
          ],
        },
        {
          text: 'Guia da Plataforma',
          items: [
            { text: 'Funcionalidades & Permissões', link: '/guide/features' },
            { text: 'Segurança de Rotas & RBAC', link: '/guide/route-security' },
            { text: 'Pilha Tecnológica', link: '/guide/tech-stack' },
            { text: 'Estrutura do Projecto', link: '/guide/project-structure' },
            { text: 'Sistema de Temas', link: '/guide/theme-system' },
          ],
        },
        {
          text: 'Governação',
          items: [
            { text: 'Endurecimento de Segurança', link: '/guide/security-hardening' },
            { text: 'Contribuindo', link: '/guide/contributing' },
            { text: 'Suporte Institucional', link: '/guide/support' },
            { text: 'Licença Proprietária', link: '/guide/license' },
          ],
        },
      ],

      // Template paths still resolve via rewrites → conteúdo vivo
      '/vite/': [
        {
          text: 'Guia (via Vite → vivo)',
          items: [
            { text: 'Stack por aplicação', link: '/guide/choosing-framework' },
            { text: 'Instalação', link: '/guide/installation' },
            { text: 'Suporte', link: '/guide/support' },
          ],
        },
      ],
      '/nextjs/': [
        {
          text: 'ADMIN (via Next → vivo)',
          items: [
            { text: 'Control Center', link: '/admin/control-center' },
            { text: 'Fluxos', link: '/arquitetura/fluxos' },
          ],
        },
      ],
      '/components/': [
        {
          text: 'Funcionalidades (via Components → vivo)',
          items: [
            { text: 'Features', link: '/guide/features' },
            { text: 'Navegação SIGA', link: '/siga/navegacao' },
          ],
        },
      ],
      '/theme-customizer/': [
        {
          text: 'Temas (via Customizer → vivo)',
          items: [
            { text: 'Sistema de Temas', link: '/guide/theme-system' },
          ],
        },
      ],
    },

    darkModeSwitchLabel: 'Aparência',
    lightModeSwitchTitle: 'Mudar para tema claro',
    darkModeSwitchTitle: 'Mudar para tema escuro',
    sidebarMenuLabel: 'Menu',
    returnToTopLabel: 'Voltar ao topo',
    outlineTitle: 'Nesta página',
    docFooter: {
      prev: 'Anterior',
      next: 'Seguinte',
    },

    footer: {
      message: 'WEB vende · ADMIN controla · SIGA trabalha · PAYFLOW cobra · DOC explica',
      copyright: 'Copyright © 2024-presente SIGA Plus',
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: 'Pesquisar',
            buttonAriaLabel: 'Pesquisar documentação',
          },
          modal: {
            displayDetails: 'Mostrar detalhes',
            resetButtonTitle: 'Limpar pesquisa',
            backButtonTitle: 'Fechar pesquisa',
            noResultsText: 'Nenhum resultado para',
            footer: {
              selectText: 'seleccionar',
              selectKeyAriaLabel: 'Enter',
              navigateText: 'navegar',
              navigateUpKeyAriaLabel: 'Seta para cima',
              navigateDownKeyAriaLabel: 'Seta para baixo',
              closeText: 'fechar',
              closeKeyAriaLabel: 'Escape',
            },
          },
        },
      },
    },
  },

  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
    lineNumbers: false,
  },

  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/favicon.png' }],
    ['link', { rel: 'shortcut icon', href: '/favicon.png' }],
    ['link', { rel: 'apple-touch-icon', href: '/favicon.png' }],
    ['meta', { name: 'theme-color', content: '#5f6368' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:locale', content: 'pt_PT' }],
    ['meta', { property: 'og:title', content: 'SIGA Plus | Documentação Oficial' }],
    ['meta', { property: 'og:site_name', content: 'SIGA Plus' }],
    ['meta', { property: 'og:image', content: '/og-image.png' }],
    ['meta', { property: 'og:url', content: 'https://siga-plus.local' }],
  ],
})
