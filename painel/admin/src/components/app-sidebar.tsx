"use client"

import * as React from "react"
import {
  LayoutTemplate,
  HelpCircle,
  CreditCard,
  Building2,
  Shield,
  ScrollText,
  Globe,
  Receipt,
  Activity,
  Settings,
  Megaphone,
  CalendarDays,
  GraduationCap,
  BookOpen,
  MessageCircle,
  LayoutDashboard,
  ListTodo,
  Mail,
  CircleHelp,
} from "lucide-react"
import { getCreateSchoolUrl, getDocsUrl, getSigaUrl, getWebUrl } from "@/lib/ecosystem-urls"
import Link from "next/link"
import { Logo } from "@/components/logo"
import { SidebarNotification } from "@/components/sidebar-notification"
import { useLanguage } from "@/contexts/language-context"

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
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { t } = useLanguage()
  const [user, setUser] = React.useState({
    name: "SIGA Plus",
    email: "plataforma@siga.local",
    avatar: "",
  })

  const navGroups = React.useMemo(
    () => [
      {
        label: t("nav.dashboards"),
        items: [
          {
            title: "Painel SaaS",
            url: "/dashboard",
            icon: LayoutDashboard,
          },
          {
            title: "Operações gateway",
            url: "/dashboard-2",
            icon: Activity,
          },
          {
            title: "Fila operacional",
            url: "/tasks",
            icon: ListTodo,
          },
          {
            title: "Agenda SaaS",
            url: "/calendar",
            icon: CalendarDays,
          },
          {
            title: "Avisos",
            url: "/mail",
            icon: Mail,
          },
          {
            title: "Suporte operador",
            url: "/chat",
            icon: MessageCircle,
          },
        ],
      },
      {
        label: t("nav.saas"),
        items: [
          {
            title: t("nav.tenants"),
            url: "/tenants",
            icon: Building2,
          },
          {
            title: t("nav.create_school"),
            url: getCreateSchoolUrl(),
            target: "_blank",
            icon: LayoutTemplate,
          },
          {
            title: t("nav.saas_catalog"),
            url: "/pricing",
            icon: CreditCard,
          },
          {
            title: t("nav.subscriptions"),
            url: "/subscriptions",
            icon: Receipt,
          },
          {
            title: t("nav.platform_admins"),
            url: "/platform-admins",
            icon: Shield,
          },
          {
            title: t("nav.audit"),
            url: "/audit",
            icon: ScrollText,
          },
          {
            title: t("nav.gateway_webhooks"),
            url: "/gateway-webhooks",
            icon: Activity,
          },
          {
            title: t("nav.domains"),
            url: "/domains",
            icon: Globe,
          },
          {
            title: t("nav.faqs"),
            url: "/faqs",
            icon: CircleHelp,
          },
          {
            title: t("nav.settings"),
            url: "/settings/billing",
            icon: Settings,
          },
        ],
      },
      {
        label: "Atalhos vivos",
        items: [
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
            title: "Entrar na escola (SIGA)",
            url: getSigaUrl("/"),
            target: "_blank",
            icon: GraduationCap,
          },
          {
            title: "Planos (WEB)",
            url: getWebUrl("/pricing"),
            target: "_blank",
            icon: CreditCard,
          },
          {
            title: "Suporte (DOC)",
            url: getDocsUrl("/guide/support.html"),
            target: "_blank",
            icon: MessageCircle,
          },
          {
            title: "Manual ADMIN",
            url: getDocsUrl("/admin/control-center.html"),
            target: "_blank",
            icon: BookOpen,
          },
        ],
      },
      {
        label: t("nav.ecosystem"),
        items: [
          {
            title: t("nav.web_portal"),
            url: getWebUrl("/"),
            target: "_blank",
            icon: LayoutTemplate,
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

  React.useEffect(() => {
    if (!isSupabaseConfigured()) return
    const supabase = createClient()
    void supabase.auth.getUser().then(async ({ data: authData }) => {
      const profile = authData.user
      if (!profile) return

      let userName =
        (typeof profile.user_metadata?.full_name === "string" && profile.user_metadata.full_name) ||
        ""
      let avatarUrl = ""

      try {
        const { data: profileRow } = await supabase
          .from("profiles")
          .select("full_name, avatar_url, phone")
          .eq("id", profile.id)
          .maybeSingle()
        if (profileRow?.full_name) userName = profileRow.full_name
        if (profileRow?.avatar_url) avatarUrl = profileRow.avatar_url
      } catch {
        /* ignore profile query failure */
      }

      setUser({
        name: userName || "Administrador da plataforma",
        email: profile.email || "",
        avatar: avatarUrl,
      })
    })
  }, [])

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/tenants">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Logo size={24} className="text-current" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">SIGA Plus</span>
                  <span className="truncate text-xs">{t("nav.admin_subtitle")}</span>
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
