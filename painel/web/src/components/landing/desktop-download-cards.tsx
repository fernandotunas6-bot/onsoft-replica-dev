import { AppWindow, Command, Download, Terminal, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { desktopAssetsFor, desktopDownloadUrl, formatSize, type DesktopOs } from "@/lib/desktop-downloads"
import { useDesktopRelease, useVisitorOs } from "@/hooks/use-desktop-download"

const PLATFORMS: { os: DesktopOs; name: string; icon: LucideIcon; requirement: string }[] = [
  { os: "windows", name: "Windows", icon: AppWindow, requirement: "Windows 10 ou 11, 64 bits" },
  { os: "macos", name: "macOS", icon: Command, requirement: "macOS 10.15 ou mais recente · Intel e Apple Silicon" },
  { os: "linux", name: "Linux", icon: Terminal, requirement: "64 bits · Ubuntu 22.04+, Debian 12+, Fedora" },
]

export function DesktopDownloadCards({ compact = false }: { compact?: boolean }) {
  const visitorOs = useVisitorOs()
  const release = useDesktopRelease()

  return (
    <div className="grid gap-4 md:grid-cols-3 md:gap-6">
      {PLATFORMS.map(({ os, name, icon: Icon, requirement }) => {
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
            {isVisitor && (
              <Badge className="absolute -top-3 start-6">O seu computador</Badge>
            )}
            <div className="flex items-center gap-3">
              <span className="bg-primary/10 text-primary grid size-12 place-items-center rounded-xl">
                <Icon className="size-6" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-lg font-semibold">{name}</h3>
                {!compact && <p className="text-muted-foreground text-xs">{requirement}</p>}
              </div>
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
              {[main?.format, size, release ? `versão ${release.version}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>

            {!compact && others.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <p className="text-muted-foreground mb-2 text-xs font-medium">Outros formatos</p>
                <ul className="space-y-1.5">
                  {others.map((asset) => (
                    <li key={asset.file}>
                      <a
                        href={desktopDownloadUrl(asset.file)}
                        download
                        className="text-primary inline-flex items-center gap-1.5 text-sm hover:underline"
                      >
                        <Download className="size-3.5" aria-hidden="true" />
                        {asset.format}
                        {formatSize(release?.sizes[asset.file]) && (
                          <span className="text-muted-foreground">
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
        )
      })}
    </div>
  )
}
