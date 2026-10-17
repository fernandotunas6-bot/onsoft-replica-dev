"use client";

import * as React from "react";

export type Language = "pt" | "en";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  pt: {
    // SaaS Control Center
    "nav.saas": "SaaS",
    "nav.tenants": "Escolas clientes",
    "nav.create_school": "Criar escola",
    "nav.saas_catalog": "Catálogo SaaS",
    "nav.subscriptions": "Subscrições",
    "nav.signups": "Registos de escolas",
    "nav.platform_admins": "Admins plataforma",
    "nav.audit": "Auditoria",
    "nav.gateway_webhooks": "Webhooks gateway",
    "nav.domains": "Domínios",
    "nav.ecosystem": "Ecossistema",
    "nav.docs": "Documentação",
    "nav.admin_subtitle": "Centro de controlo SaaS",
    "nav.site": "Site",
    "nav.site_blog": "Blog",
    "nav.site_faqs": "Perguntas do site",
    "nav.site_messages": "Mensagens de contacto",
    "nav.site_schools": "Escolas no site",

    // General & Navigation
    "nav.dashboards": "Painéis",
    "nav.dashboard1": "Painel 1",
    "nav.dashboard2": "Painel 2",
    "nav.apps": "Aplicações",
    "nav.mail": "E-mail",
    "nav.tasks": "Tarefas",
    "nav.chat": "Chat",
    "nav.calendar": "Agenda",
    "nav.users": "Utilizadores",
    "nav.pages": "Páginas",
    "nav.landing": "Landing (template)",
    "nav.web_portal": "Portal comercial",
    "nav.payflow": "PayFlow",
    "nav.web_pricing": "Preços (WEB)",
    "nav.auth": "Autenticação",
    "nav.errors": "Erros",
    "nav.settings": "Configurações",
    "nav.settings_user": "Perfil",
    "nav.settings_account": "Conta",
    "nav.settings_billing": "Facturação",
    "nav.settings_appearance": "Aparência",
    "nav.settings_notifications": "Notificações",
    "nav.settings_connections": "Ligações",
    "nav.faqs": "Perguntas frequentes",
    "nav.pricing": "Preços",

    // User menu
    "user.account": "A minha conta",
    "user.billing": "Facturação",
    "user.notifications": "Notificações",
    "user.logout": "Sair",

    // Header
    "header.blocks": "Blocos",
    "header.landing": "Página inicial",
    "header.search_placeholder": "Pesquisar...",
    "header.command_placeholder": "O que procura?",
    "header.no_results": "Nenhum resultado encontrado.",

    // Footer
    "footer.made_with": "Feito com",
    "footer.by": "pela",
    "footer.team": "equipa SIGA Plus",
    "footer.tagline": "Centro de controlo SaaS da plataforma SIGA Plus — escolas, planos e facturação.",

    // Sidebar a11y
    "sidebar.toggle": "Abrir ou fechar o menu",
    "sidebar.mobile": "Menu de navegação",

    // Tenant status
    "status.active": "Activa",
    "status.suspended": "Suspensa",
    "status.trial": "Trial",
    "status.past_due": "Em atraso",

    // Upgrade Button
    "upgrade.button": "Atualizar para Pro",
    "upgrade.title": "Desbloqueie Blocos Premium",
    "upgrade.available": "Disponível",
    "upgrade.desc": "Tenha acesso a blocos e painéis premium exclusivos para seu próximo projeto.",
    "upgrade.pro_blocks": "Blocos Pro",
    "upgrade.pro_dashboards": "Painéis Pro",
    "upgrade.coming_soon": "Em breve",

    // Language Toggle
    "lang.select_language": "Idioma",
    "lang.portuguese": "Português (PT)",
    "lang.english": "English (EN)",
  },
  en: {
    "nav.saas": "SaaS",
    "nav.tenants": "School clients",
    "nav.create_school": "Create school",
    "nav.saas_catalog": "SaaS catalog",
    "nav.subscriptions": "Subscriptions",
    "nav.signups": "School sign-ups",
    "nav.platform_admins": "Platform admins",
    "nav.audit": "Audit log",
    "nav.gateway_webhooks": "Gateway webhooks",
    "nav.domains": "Domains",
    "nav.ecosystem": "Ecosystem",
    "nav.docs": "Documentation",
    "nav.admin_subtitle": "SaaS Control Center",
    "nav.site": "Website",
    "nav.site_blog": "Blog",
    "nav.site_faqs": "Website FAQ",
    "nav.site_messages": "Contact messages",
    "nav.site_schools": "Schools on website",

    // General & Navigation
    "nav.dashboards": "Dashboards",
    "nav.dashboard1": "Dashboard 1",
    "nav.dashboard2": "Dashboard 2",
    "nav.apps": "Apps",
    "nav.mail": "Mail",
    "nav.tasks": "Tasks",
    "nav.chat": "Chat",
    "nav.calendar": "Calendar",
    "nav.users": "Users",
    "nav.pages": "Pages",
    "nav.landing": "Landing (template)",
    "nav.web_portal": "Commercial portal",
    "nav.payflow": "PayFlow",
    "nav.web_pricing": "Pricing (WEB)",
    "nav.auth": "Authentication",
    "nav.errors": "Errors",
    "nav.settings": "Settings",
    "nav.settings_user": "Profile",
    "nav.settings_account": "Account",
    "nav.settings_billing": "Billing",
    "nav.settings_appearance": "Appearance",
    "nav.settings_notifications": "Notifications",
    "nav.settings_connections": "Connections",
    "nav.faqs": "FAQs",
    "nav.pricing": "Pricing",

    // User menu
    "user.account": "My Account",
    "user.billing": "Billing",
    "user.notifications": "Notifications",
    "user.logout": "Log out",

    // Header
    "header.blocks": "Blocks",
    "header.landing": "Landing Page",
    "header.search_placeholder": "Search...",
    "header.command_placeholder": "What do you need?",
    "header.no_results": "No results found.",

    "footer.made_with": "Made with",
    "footer.by": "by",
    "footer.team": "SIGA Plus team",
    "footer.tagline": "SIGA Plus SaaS control center — schools, plans and billing.",

    "sidebar.toggle": "Toggle sidebar",
    "sidebar.mobile": "Navigation menu",

    "status.active": "Active",
    "status.suspended": "Suspended",
    "status.trial": "Trial",
    "status.past_due": "Past due",

    // Upgrade Button
    "upgrade.button": "Upgrade to Pro",
    "upgrade.title": "Unlock Premium Blocks",
    "upgrade.available": "Live",
    "upgrade.desc": "Get access to exclusive premium blocks and dashboards for your next project.",
    "upgrade.pro_blocks": "Pro Blocks",
    "upgrade.pro_dashboards": "Pro Dashboards",
    "upgrade.coming_soon": "Coming soon",

    // Language Toggle
    "lang.select_language": "Language",
    "lang.portuguese": "Português (PT)",
    "lang.english": "English (EN)",
  },
};

const LanguageContext = React.createContext<LanguageContextType | undefined>(undefined);

const DEFAULT_LANGUAGE: Language = "pt";

function applyDocumentLang(lang: Language) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang === "pt" ? "pt" : "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = React.useState<Language>(DEFAULT_LANGUAGE);

  React.useEffect(() => {
    applyDocumentLang(DEFAULT_LANGUAGE);
    const saved = localStorage.getItem("app-language") as Language | null;
    if (saved === "pt" || saved === "en") {
      setLanguageState(saved);
      applyDocumentLang(saved);
    } else {
      localStorage.setItem("app-language", DEFAULT_LANGUAGE);
    }
  }, []);

  React.useEffect(() => {
    applyDocumentLang(language);
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("app-language", lang);
    applyDocumentLang(lang);
  };

  const t = (key: string): string => {
    return translations[language]?.[key] || translations["pt"]?.[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = React.useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
