"use client"

import { useMemo, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { Menu, LayoutDashboard, ChevronDown, X, Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { getDocsUrl, getSigaLoginUrl } from "@/lib/ecosystem-urls"
import { MARKETING_NAV_ITEMS } from "@/lib/marketing-nav"
import { Logo } from "@/components/logo"
import { MegaMenu } from "@/components/landing/mega-menu"
import { ModeToggle } from "@/components/mode-toggle"
import { LanguageToggle } from "@/components/language-toggle"
import { useTheme } from "@/hooks/use-theme"
import { useLanguage } from "@/contexts/language-context"
import { cn } from "@/lib/utils"

const smoothScrollTo = (targetId: string) => {
  if (!targetId.startsWith("#")) return
  document.querySelector(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" })
}

function useIsLandingPage() {
  const location = useLocation()
  return location.pathname === "/" || location.pathname === "/landing"
}

function MarketingNavAnchor({
  href,
  className,
  onNavigate,
  children,
}: {
  href: string
  className?: string
  onNavigate?: () => void
  children: React.ReactNode
}) {
  if (href.startsWith("#")) {
    return (
      <a
        href={href}
        className={className}
        onClick={(e) => {
          e.preventDefault()
          smoothScrollTo(href)
          onNavigate?.()
        }}
      >
        {children}
      </a>
    )
  }

  if (href.startsWith("/#")) {
    return (
      <Link to={href} className={className} onClick={onNavigate}>
        {children}
      </Link>
    )
  }

  if (href.startsWith("http")) {
    return (
      <a href={href} className={className} onClick={onNavigate} rel="noopener noreferrer">
        {children}
      </a>
    )
  }

  return (
    <Link to={href} className={className} onClick={onNavigate}>
      {children}
    </Link>
  )
}

export function LandingNavbar() {
  const [isOpen, setIsOpen] = useState(false)
  const [solutionsOpen, setSolutionsOpen] = useState(false)
  const { setTheme, theme } = useTheme()
  const { t } = useLanguage()
  const isLanding = useIsLandingPage()

  const navigationItems = useMemo(
    () =>
      MARKETING_NAV_ITEMS.map((item) => ({
        ...item,
        name: t(item.nameKey),
        href: isLanding ? item.landingHref : item.pageHref,
      })),
    [isLanding, t],
  )

  const desktopLinkClass =
    "group inline-flex h-10 w-max items-center justify-center px-4 py-2 text-sm font-medium transition-colors hover:text-primary focus:text-primary focus:outline-none cursor-pointer"
  const mobileLinkClass =
    "flex items-center px-4 py-3 text-base font-medium rounded-lg transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer"

  const featuresHref = isLanding ? "#features" : "/#features"
  // Soluções em lista inline: resposta imediata ao toque e acesso com teclado.
  const mobileSolutions = [
    { name: t("landing.school_management"), href: featuresHref },
    { name: t("landing.public_education"), href: "/ensino-publico" },
    { name: t("landing.secretariat"), href: getDocsUrl("/siga/alunos-e-matriculas.html") },
    { name: t("landing.pedagogical"), href: getDocsUrl("/siga/area-pedagogica.html") },
  ]

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-2">
          <Link to="/" className="flex cursor-pointer items-center space-x-2">
            <Logo size={32} />
            <span className="font-bold">SIGA Plus</span>
          </Link>
        </div>

        <NavigationMenu className="hidden xl:flex">
          <NavigationMenuList>
            {navigationItems.map((item) => (
              <NavigationMenuItem key={item.nameKey}>
                {item.megaMenu ? (
                  <>
                    <NavigationMenuTrigger className="cursor-pointer bg-transparent px-4 py-2 text-sm font-medium transition-colors hover:bg-transparent hover:text-primary focus:bg-transparent focus:text-primary data-[active]:bg-transparent data-[state=open]:bg-transparent">
                      {item.name}
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <MegaMenu />
                    </NavigationMenuContent>
                  </>
                ) : (
                  <NavigationMenuLink asChild>
                    <MarketingNavAnchor href={item.href} className={desktopLinkClass}>
                      {item.name}
                    </MarketingNavAnchor>
                  </NavigationMenuLink>
                )}
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

        <div className="hidden items-center space-x-2 xl:flex">
          <LanguageToggle />
          <ModeToggle variant="ghost" />
          <Button variant="outline" asChild className="cursor-pointer">
            <a href={getSigaLoginUrl()}>
              <LayoutDashboard className="mr-2 h-4 w-4" />
              {t("landing.login")}
            </a>
          </Button>
          <Button asChild className="cursor-pointer">
            <Link to="/start">{t("nav.create_school")}</Link>
          </Button>
        </div>

        <Sheet
          open={isOpen}
          onOpenChange={(open) => {
            setIsOpen(open)
            if (!open) setSolutionsOpen(false)
          }}
        >
          <SheetTrigger asChild className="xl:hidden">
            <Button variant="ghost" size="icon" className="cursor-pointer">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Abrir menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:w-[400px] [&>button]:hidden"
          >
            <div className="flex h-full flex-col">
              <SheetHeader className="space-y-0 border-b p-4 pb-2">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Logo size={16} />
                  </div>
                  <SheetTitle className="text-lg font-semibold">SIGA Plus</SheetTitle>
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                      className="h-8 w-8 cursor-pointer"
                    >
                      <Moon className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                      <Sun className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    </Button>
                    <LanguageToggle />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsOpen(false)}
                      className="h-8 w-8 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto">
                <nav className="space-y-1 p-6">
                  {navigationItems.map((item) => (
                    <div key={item.nameKey}>
                      {item.megaMenu ? (
                        <div>
                          <button
                            type="button"
                            aria-expanded={solutionsOpen}
                            aria-controls="mobile-solutions-panel"
                            onClick={() => setSolutionsOpen((open) => !open)}
                            className="focus-visible:ring-ring flex min-h-11 w-full cursor-pointer items-center justify-between rounded-lg px-4 py-3 text-left text-base font-medium transition-colors hover:bg-accent active:bg-accent focus-visible:ring-2 focus-visible:outline-none"
                          >
                            {item.name}
                            <ChevronDown
                              aria-hidden="true"
                              className={cn(
                                "size-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
                                solutionsOpen && "rotate-180",
                              )}
                            />
                          </button>
                          {solutionsOpen ? (
                            <div
                              id="mobile-solutions-panel"
                              role="group"
                              aria-label={item.name}
                              className="ml-4 border-l border-border/70 py-1 pl-3"
                            >
                              {mobileSolutions.map((solution) => (
                                <MarketingNavAnchor
                                  key={solution.href}
                                  href={solution.href}
                                  className="hover:bg-accent focus-visible:ring-ring flex min-h-11 items-center rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/90 transition-colors active:bg-accent focus-visible:ring-2 focus-visible:outline-none"
                                  onNavigate={() => setIsOpen(false)}
                                >
                                  {solution.name}
                                </MarketingNavAnchor>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <MarketingNavAnchor
                          href={item.href}
                          className={mobileLinkClass}
                          onNavigate={() => setIsOpen(false)}
                        >
                          {item.name}
                        </MarketingNavAnchor>
                      )}
                    </div>
                  ))}
                </nav>
              </div>

              <div className="space-y-4 border-t p-6">
                <div className="space-y-3">
                  <Button variant="outline" size="lg" asChild className="w-full cursor-pointer">
                    <a href={getSigaLoginUrl()}>
                      <LayoutDashboard className="size-4" />
                      {t("nav.siga_login")}
                    </a>
                  </Button>
                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="outline" size="lg" asChild className="cursor-pointer">
                      <a href={getSigaLoginUrl()}>{t("landing.login")}</a>
                    </Button>
                    <Button asChild size="lg" className="cursor-pointer">
                      <Link to="/start" onClick={() => setIsOpen(false)}>{t("nav.create_school")}</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
