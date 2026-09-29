"use client"

import { Heart } from "lucide-react"
import Link from "next/link"
import { ECOSYSTEM_URLS } from "@/lib/ecosystem-urls"
import { useLanguage } from "@/contexts/language-context"

export function SiteFooter() {
  const { t } = useLanguage()

  return (
    <footer className="border-t bg-background">
      <div className="px-4 py-6 lg:px-6">
        <div className="flex flex-col items-center justify-center space-y-2 text-center">
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <span>{t("footer.made_with")}</span>
            <Heart className="h-4 w-4 fill-red-500 text-red-500" />
            <span>{t("footer.by")}</span>
            <Link
              href={ECOSYSTEM_URLS.web}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground hover:text-primary transition-colors duration-100"
            >
              {t("footer.team")}
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("footer.tagline")}
          </p>
        </div>
      </div>
    </footer>
  )
}
