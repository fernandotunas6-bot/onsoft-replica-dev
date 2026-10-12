"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Command as CommandPrimitive } from "cmdk"
import {
  Search,
  Building2,
  CreditCard,
  Shield,
  Globe,
  GraduationCap,
  BookOpen,
  ScrollText,
  Receipt,
  Activity,
  MessageCircle,
  HelpCircle,
  LayoutDashboard,
  ListTodo,
  CalendarDays,
  Mail,
  Library,
  type LucideIcon,
} from "lucide-react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { getCreateSchoolUrl, getDocsUrl, getPayflowUrl, getSigaUrl, getWebUrl } from "@/lib/ecosystem-urls"
import { useLanguage } from "@/contexts/language-context"

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "flex h-full w-full flex-col overflow-hidden rounded-xl bg-white dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50",
      className
    )}
    {...props}
  />
))
Command.displayName = CommandPrimitive.displayName

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Input
    ref={ref}
    className={cn(
      "flex h-12 w-full border-none bg-transparent px-4 py-3 text-[17px] outline-none placeholder:text-zinc-500 dark:placeholder:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 mb-4",
      className
    )}
    {...props}
  />
))
CommandInput.displayName = CommandPrimitive.Input.displayName

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn("max-h-[400px] overflow-y-auto overflow-x-hidden pb-2", className)}
    {...props}
  />
))
CommandList.displayName = CommandPrimitive.List.displayName

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="flex h-12 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400"
    {...props}
  />
))
CommandEmpty.displayName = CommandPrimitive.Empty.displayName

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      "overflow-hidden px-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-zinc-500 dark:[&_[cmdk-group-heading]]:text-zinc-400 [&:not(:first-child)]:mt-2",
      className
    )}
    {...props}
  />
))
CommandGroup.displayName = CommandPrimitive.Group.displayName

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex h-12 cursor-pointer select-none items-center gap-2 rounded-lg px-4 text-sm text-zinc-700 dark:text-zinc-300 outline-none transition-colors duration-75 data-[disabled=true]:pointer-events-none data-[selected=true]:bg-zinc-100 dark:data-[selected=true]:bg-zinc-800 data-[selected=true]:text-zinc-900 dark:data-[selected=true]:text-zinc-100 data-[disabled=true]:opacity-50 [&+[cmdk-item]]:mt-1",
      className
    )}
    {...props}
  />
))
CommandItem.displayName = CommandPrimitive.Item.displayName

interface SearchItem {
  title: string
  url: string
  group: string
  icon?: LucideIcon
  external?: boolean
}

interface CommandSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandSearch({ open, onOpenChange }: CommandSearchProps) {
  const router = useRouter()
  const { t } = useLanguage()
  const commandRef = React.useRef<HTMLDivElement>(null)

  const searchItems: SearchItem[] = [
    { title: "Painel SaaS", url: "/dashboard", group: t("nav.dashboards"), icon: LayoutDashboard },
    { title: "Operações gateway", url: "/dashboard-2", group: t("nav.dashboards"), icon: Activity },
    { title: "Fila operacional", url: "/tasks", group: t("nav.dashboards"), icon: ListTodo },
    { title: "Agenda SaaS", url: "/calendar", group: t("nav.dashboards"), icon: CalendarDays },
    { title: "Avisos", url: "/mail", group: t("nav.dashboards"), icon: Mail },
    { title: "Suporte operador", url: "/chat", group: t("nav.dashboards"), icon: MessageCircle },
    { title: t("nav.tenants"), url: "/tenants", group: t("nav.saas"), icon: Building2 },
    { title: t("nav.saas_catalog"), url: "/pricing", group: t("nav.saas"), icon: CreditCard },
    { title: t("nav.subscriptions"), url: "/subscriptions", group: t("nav.saas"), icon: Receipt },
    { title: t("nav.platform_admins"), url: "/platform-admins", group: t("nav.saas"), icon: Shield },
    { title: t("nav.audit"), url: "/audit", group: t("nav.saas"), icon: ScrollText },
    { title: t("nav.gateway_webhooks"), url: "/gateway-webhooks", group: t("nav.saas"), icon: Activity },
    { title: t("nav.education_catalog"), url: "/education-catalog", group: t("nav.saas"), icon: Library },
    { title: t("nav.domains"), url: "/domains", group: t("nav.saas"), icon: Globe },
    { title: t("nav.faqs"), url: "/faqs", group: t("nav.saas"), icon: HelpCircle },
    { title: t("nav.create_school"), url: getCreateSchoolUrl(), group: t("nav.saas"), icon: GraduationCap, external: true },
    { title: t("nav.site_blog"), url: "/site/blog", group: t("nav.site"), icon: BookOpen },
    { title: t("nav.site_faqs"), url: "/site/faqs", group: t("nav.site"), icon: HelpCircle },
    { title: t("nav.site_messages"), url: "/site/messages", group: t("nav.site"), icon: MessageCircle },
    { title: t("nav.site_schools"), url: "/site/schools", group: t("nav.site"), icon: GraduationCap },
    { title: t("nav.settings_billing"), url: "/settings/billing", group: t("nav.settings"), icon: CreditCard },
    { title: "Entrar", url: "/sign-in", group: t("nav.auth"), icon: Shield },
    { title: "Comunicações (SIGA)", url: getSigaUrl("/comunicacoes"), group: "Atalhos vivos", icon: MessageCircle, external: true },
    { title: "Calendário (SIGA)", url: getSigaUrl("/calendario"), group: "Atalhos vivos", icon: GraduationCap, external: true },
    { title: t("nav.web_portal"), url: getWebUrl("/"), group: t("nav.ecosystem"), icon: Globe, external: true },
    { title: t("nav.web_pricing"), url: getWebUrl("/pricing"), group: t("nav.ecosystem"), icon: CreditCard, external: true },
    { title: t("nav.payflow"), url: getPayflowUrl("/"), group: t("nav.ecosystem"), icon: Receipt, external: true },
    { title: t("nav.docs"), url: getDocsUrl(), group: t("nav.ecosystem"), icon: BookOpen, external: true },
    { title: "Manual ADMIN", url: getDocsUrl("/admin/control-center.html"), group: t("nav.ecosystem"), icon: BookOpen, external: true },
    { title: "Suporte", url: getDocsUrl("/guide/support.html"), group: t("nav.ecosystem"), icon: HelpCircle, external: true },
  ]

  const groupedItems = searchItems.reduce((acc, item) => {
    if (!acc[item.group]) {
      acc[item.group] = []
    }
    acc[item.group].push(item)
    return acc
  }, {} as Record<string, SearchItem[]>)

  const handleSelect = (item: SearchItem) => {
    onOpenChange(false)
    if (item.external) {
      window.open(item.url, "_blank", "noopener,noreferrer")
      return
    }
    router.push(item.url)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-2xl border border-zinc-200 dark:border-zinc-800 max-w-[640px]">
        <DialogTitle className="sr-only">Pesquisa rápida</DialogTitle>
        <Command
          ref={commandRef}
          className="transition-transform duration-75 ease-out"
        >
          <CommandInput placeholder={t("header.command_placeholder")} autoFocus />
          <CommandList>
            <CommandEmpty>{t("header.no_results")}</CommandEmpty>
            {Object.entries(groupedItems).map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items.map((item) => {
                  const Icon = item.icon
                  return (
                    <CommandItem
                      key={item.url}
                      value={item.title}
                      onSelect={() => handleSelect(item)}
                    >
                      {Icon && <Icon className="mr-2 h-4 w-4" />}
                      {item.title}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

export function SearchTrigger({ onClick }: { onClick: () => void }) {
  const { t } = useLanguage()
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3 py-1 relative w-full justify-start text-muted-foreground sm:pr-12 md:w-36 lg:w-56"
    >
      <Search className="mr-2 h-3.5 w-3.5" />
      <span>{t("header.search_placeholder")}</span>
      <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-4 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
        <span className="text-xs">⌘</span>K
      </kbd>
    </button>
  )
}
