import { Heart } from "lucide-react"
import { Link } from "react-router-dom"
import { ECOSYSTEM_URLS } from "@/lib/ecosystem-urls"

export function SiteFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="px-4 py-6 lg:px-6">
        <div className="flex flex-col items-center justify-center space-y-2 text-center">
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <span>Feito com</span>
            <Heart className="h-4 w-4 fill-red-500 text-red-500" />
            <span>pela</span>
            <Link
              to={ECOSYSTEM_URLS.web}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground hover:text-primary transition-colors"
            >
              equipa SIGA Plus
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            Gestão escolar para Angola: matrículas, pautas, tesouraria e cobrança.
          </p>
        </div>
      </div>
    </footer>
  )
}
