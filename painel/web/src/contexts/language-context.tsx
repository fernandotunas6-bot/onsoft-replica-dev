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
    "nav.portal": "Portal",
    "nav.home": "Início",
    "nav.pricing": "Preços",
    "nav.create_school": "Criar escola",
    "nav.faqs": "Perguntas frequentes",
    "nav.apps": "Aplicações",
    "nav.dashboard1": "Painel 1",
    "nav.dashboard2": "Painel 2",
    "nav.mail": "E-mail",
    "nav.tasks": "Tarefas",
    "nav.chat": "Chat",
    "nav.calendar": "Agenda",
    "nav.users": "Utilizadores",
    "nav.pages": "Páginas",
    "nav.auth": "Autenticação",
    "nav.errors": "Erros",
    "nav.settings": "Configurações",
    "nav.settings_user": "Perfil",
    "nav.settings_account": "Conta",
    "nav.settings_billing": "Facturação",
    "nav.settings_appearance": "Aparência",
    "nav.settings_notifications": "Notificações",
    "nav.settings_connections": "Ligações",
    "nav.ecosystem": "Ecossistema",
    "nav.admin": "Centro de controlo",
    "nav.docs": "Documentação",
    "nav.siga_login": "Entrar no SIGA",
    "nav.web_subtitle": "Portal comercial",

    "landing.home": "Início",
    "landing.features": "Funcionalidades",
    "landing.solutions": "Soluções",
    "landing.team": "Equipa",
    "landing.pricing": "Preços",
    "landing.faq": "FAQ",
    "landing.contact": "Contacto",
    "landing.login": "Entrar",
    "landing.get_started": "Começar",

    "header.landing": "Portal",
    "header.search_placeholder": "Pesquisar...",
    "header.command_placeholder": "O que procura?",
    "header.no_results": "Nenhum resultado encontrado.",

    "user.account": "A minha conta",
    "user.billing": "Faturação",
    "user.notifications": "Notificações",
    "user.logout": "Sair",

    "lang.select_language": "Idioma",
    "lang.portuguese": "Português (PT)",
    "lang.english": "English (EN)",
  },
  en: {
    "nav.portal": "Portal",
    "nav.home": "Home",
    "nav.pricing": "Pricing",
    "nav.create_school": "Create school",
    "nav.faqs": "FAQs",
    "nav.apps": "Apps",
    "nav.dashboard1": "Dashboard 1",
    "nav.dashboard2": "Dashboard 2",
    "nav.mail": "Mail",
    "nav.tasks": "Tasks",
    "nav.chat": "Chat",
    "nav.calendar": "Calendar",
    "nav.users": "Users",
    "nav.pages": "Pages",
    "nav.auth": "Authentication",
    "nav.errors": "Errors",
    "nav.settings": "Settings",
    "nav.settings_user": "Profile",
    "nav.settings_account": "Account",
    "nav.settings_billing": "Billing",
    "nav.settings_appearance": "Appearance",
    "nav.settings_notifications": "Notifications",
    "nav.settings_connections": "Connections",
    "nav.ecosystem": "Ecosystem",
    "nav.admin": "Control Center",
    "nav.docs": "Documentation",
    "nav.siga_login": "Sign in to SIGA",
    "nav.web_subtitle": "Commercial portal",

    "landing.home": "Home",
    "landing.features": "Features",
    "landing.solutions": "Solutions",
    "landing.team": "Team",
    "landing.pricing": "Pricing",
    "landing.faq": "FAQ",
    "landing.contact": "Contact",
    "landing.login": "Sign in",
    "landing.get_started": "Get started",

    "header.landing": "Portal",
    "header.search_placeholder": "Search...",
    "header.command_placeholder": "What do you need?",
    "header.no_results": "No results found.",

    "user.account": "My Account",
    "user.billing": "Billing",
    "user.notifications": "Notifications",
    "user.logout": "Log out",

    "lang.select_language": "Language",
    "lang.portuguese": "Português (PT)",
    "lang.english": "English (EN)",
  },
};

const LanguageContext = React.createContext<LanguageContextType | undefined>(undefined);

const DEFAULT_LANGUAGE: Language = "pt";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = React.useState<Language>(DEFAULT_LANGUAGE);

  React.useEffect(() => {
    document.documentElement.lang = "pt";
    const saved = localStorage.getItem("app-language") as Language;
    if (saved === "pt" || saved === "en") {
      setLanguageState(saved);
    } else {
      localStorage.setItem("app-language", DEFAULT_LANGUAGE);
    }
  }, []);

  React.useEffect(() => {
    document.documentElement.lang = language === "pt" ? "pt" : "en";
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("app-language", lang);
  };

  const t = (key: string): string => {
    return translations[language]?.[key] || translations.pt?.[key] || key;
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
