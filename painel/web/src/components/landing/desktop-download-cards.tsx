import type { ComponentType, SVGProps } from "react"
import { Check, Download } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { desktopAssetsFor, desktopDownloadUrl, formatSize, type DesktopOs } from "@/lib/desktop-downloads"
import { useDesktopRelease, useVisitorOs } from "@/hooks/use-desktop-download"
import { AppleLogo, LinuxLogo, WindowsLogo } from "@/components/landing/os-logos"

type Platform = {
  os: DesktopOs
  name: string
  logo: ComponentType<SVGProps<SVGSVGElement>>
  requirements: string[]
}

const PLATFORMS: Platform[] = [
  {
    os: "windows",
    name: "Windows",
    logo: WindowsLogo,
    requirements: [
      "Windows 10 ou 11, 64 bits",
      "Instala sem Internet e sem privilégios de administrador",
    ],
  },
  {
    os: "macos",
    name: "macOS",
    logo: AppleLogo,
    requirements: [
      "macOS 11 Big Sur ou mais recente",
      "Safari 16.4 ou mais recente (a app usa o motor do Safari)",
      "Mac Intel e Apple Silicon",
    ],
  },
  {
    os: "linux",
    name: "Linux",
    logo: LinuxLogo,
    requirements: ["64 bits · Ubuntu 22.04+, Debian 12+, Fedora"],
  },
]

export function DesktopDownloadCards({ compact = false }: { compact?: boolean }) {
  const visitorOs = useVisitorOs()
  const release = useDesktopRelease()

  return (
    <div className="grid gap-4 md:grid-cols-3 md:gap-6">
      {PLATFORMS.map(({ os, name, logo: Logo, requirements }) => {
        const [main, ...others] = desktopAssetsFor(os)
        const isVisitor = visitorOs === os
        const size = formatSize(main ? release?.sizes[main.file] : undefined)
        return (
          <div
            key={os}
            className={cn(
              "bg-card relative flex flex-col rounded-2xl border p-6 shadow-sm transition-shadow hover:shadow-md",
              isVisitor && "border-primary ring-primary/20 ring-4",
            )}
          >
            {isVisitor && <Badge className="absolute -top-3 start-6">O seu computador</Badge>}
            <div className="flex items-center gap-3">
              <span className="bg-primary/10 text-primary grid size-12 shrink-0 place-items-center rounded-xl">
                <Logo className="size-6" />
              </span>
              <h3 className="text-lg font-semibold">{name}</h3>
            </div>

            {main && (
              <Button
                asChild
                size="lg"
                variant={isVisitor || visitorOs === null ? "default" : "outline"}
                className="mt-6 w-full cursor-pointer"
              >
                <a href={desktopDownloadUrl(main.file)} download>
                  <Download className="me-2 size-4" aria-hidden="true" />
                  Transferir para {name}
                </a>
              </Button>
            )}
            <p className="text-muted-foreground mt-2 text-center text-xs">
              {[main?.format, size].filter(Boolean).join(" · ")}
            </p>

            {!compact && (
              <div className="space-y-4 pt-5">
                <ul className="space-y-1.5 border-t pt-4">
                  {requirements.map((requirement) => (
                    <li key={requirement} className="text-muted-foreground flex gap-2 text-sm">
                      <Check className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      {requirement}
                    </li>
                  ))}
                </ul>
                {others.length > 0 && (
                  <div>
                    <p className="text-muted-foreground mb-2 text-xs font-medium">Outros formatos</p>
                    <ul className="space-y-1.5">
                      {others.map((asset) => (
                        <li key={asset.file}>
                          <a
                            href={desktopDownloadUrl(asset.file)}
                            download
                            className="text-primary inline-flex flex-wrap items-center gap-x-1.5 text-sm hover:underline"
                          >
                            <Download className="size-3.5" aria-hidden="true" />
                            {asset.format}
                            {formatSize(release?.sizes[asset.file]) && (
                              <span className="text-muted-foreground whitespace-nowrap">
                                · {formatSize(release?.sizes[asset.file])}
                              </span>
                            )}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
