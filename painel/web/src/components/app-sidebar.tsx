"use client"

import * as React from "react"
import {
  CreditCard,
  LayoutTemplate,
  HelpCircle,
  Building2,
  ExternalLink,
  GraduationCap,
  Megaphone,
  CalendarDays,
  BookOpen,
  Shield,
} from "lucide-react"
import { Link } from "react-router-dom"
import { Logo } from "@/components/logo"
import { SidebarNotification } from "@/components/sidebar-notification"
import { useLanguage } from "@/contexts/language-context"
import {
  getAdminTenantsUrl,
  getDocsUrl,
  getSigaLoginUrl,
  getSigaUrl,
} from "@/lib/ecosystem-urls"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { t } = useLanguage()

  const navGroups = React.useMemo(
    () => [
      {
        label: t("nav.portal"),
        items: [
          { title: t("nav.home"), url: "/", icon: LayoutTemplate },
          { title: "Área do visitante", url: "/dashboard", icon: GraduationCap },
          { title: t("nav.pricing"), url: "/pricing", icon: CreditCard },
          { title: t("nav.create_school"), url: "/start", icon: Building2 },
          { title: "Checklist", url: "/tasks", icon: BookOpen },
          { title: "Contacto", url: "/mail", icon: Megaphone },
          { title: "Ajuda", url: "/chat", icon: HelpCircle },
          { title: t("nav.faqs"), url: "/faqs", icon: HelpCircle },
          { title: "Personas", url: "/users", icon: Shield },
        ],
      },
      {
        label: "Atalhos vivos",
        items: [
          {
            title: t("nav.siga_login"),
            url: getSigaLoginUrl(),
            target: "_blank",
            icon: GraduationCap,
          },
          {
            title: "Comunicações (SIGA)",
            url: getSigaUrl("/comunicacoes"),
            target: "_blank",
            icon: Megaphone,
          },
          {
            title: "Calendário (SIGA)",
            url: getSigaUrl("/calendario"),
            target: "_blank",
            icon: CalendarDays,
          },
          {
            title: "Control Center",
            url: getAdminTenantsUrl(),
            target: "_blank",
            icon: Shield,
          },
          {
            title: "Criar escola (manual)",
            url: getDocsUrl("/web/criar-escola.html"),
            target: "_blank",
            icon: BookOpen,
          },
          {
            title: "Suporte (DOC)",
            url: getDocsUrl("/guide/support.html"),
            target: "_blank",
            icon: HelpCircle,
          },
        ],
      },
      {
        label: t("nav.ecosystem"),
        items: [
          {
            title: t("nav.admin"),
            url: getAdminTenantsUrl(),
            target: "_blank",
            icon: ExternalLink,
          },
          {
            title: t("nav.docs"),
            url: getDocsUrl(),
            target: "_blank",
            icon: HelpCircle,
          },
        ],
      },
    ],
    [t],
  )

  const user = {
    name: "SIGA Plus",
    email: "plataforma@siga.local",
    avatar: "",
  }

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Logo size={24} className="text-current" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">SIGA Plus</span>
                  <span className="truncate text-xs">{t("nav.web_subtitle")}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group) => (
          <NavMain key={group.label} label={group.label} items={group.items} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarNotification />
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
