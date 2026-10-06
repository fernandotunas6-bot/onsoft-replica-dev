import { useState } from "react"
import {
  BellRing,
  ExternalLink,
  KeyRound,
  Printer,
  ScanLine,
  ShieldCheck,
  Wifi,
  type LucideIcon,
} from "lucide-react"
import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DesktopDownloadCards } from "@/components/landing/desktop-download-cards"
import { useVisitorOs } from "@/hooks/use-desktop-download"
import { DESKTOP_RELEASES_PAGE, type DesktopOs } from "@/lib/desktop-downloads"

const BENEFITS: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Printer,
    title: "Impressão directa",
    description: "Recibos na impressora térmica da secretaria e documentos oficiais sem diálogos do navegador.",
  },
  {
    icon: ScanLine,
    title: "Catracas e equipamentos",
    description: "Ligação às catracas e leitores da escola na rede local, sem configurar o navegador.",
  },
  {
    icon: KeyRound,
    title: "Sessão protegida por PIN",
    description: "A sessão fica cifrada neste computador e abre com o PIN do posto.",
  },
  {
    icon: BellRing,
    title: "Avisos no computador",
    description: "Mensagens e comunicados novos aparecem como notificação, mesmo com a janela minimizada.",
  },
]

const STEPS: Record<DesktopOs, { title: string; steps: string[]; note: string }> = {
  windows: {
    title: "Windows",
    steps: [
      "Abra o ficheiro SIGA-Desktop-Windows-x64-setup.exe que transferiu.",
      "Se aparecer «O Windows protegeu o seu PC», clique em «Mais informações» e depois em «Executar mesmo assim».",
      "Siga o instalador. Não são precisos privilégios de administrador.",
      "Abra o SIGA Plus pelo menu Iniciar, na pasta OnSoft.",
    ],
    note: "O aviso do Windows aparece porque o instalador ainda não tem certificado de editor. O ficheiro vem directamente das releases oficiais do SIGA Plus.",
  },
  macos: {
    title: "macOS",
    steps: [
      "Abra o ficheiro SIGA-Desktop-macOS-universal.dmg e arraste o SIGA Desktop para a pasta Aplicações.",
      "Na primeira vez, clique no SIGA Desktop com o botão direito (ou Control + clique) e escolha «Abrir».",
      "Confirme «Abrir» no aviso do macOS. Nas vezes seguintes abre normalmente.",
    ],
    note: "O macOS pede esta confirmação porque a app ainda não está notarizada pela Apple. Funciona em Mac Intel e Apple Silicon.",
  },
  linux: {
    title: "Linux",
    steps: [
      "AppImage: torne o ficheiro executável (botão direito → Propriedades → Permitir executar, ou chmod +x) e abra-o.",
      "Ubuntu/Debian: instale o .deb com dois cliques ou com sudo apt install ./SIGA-Desktop-Linux-amd64.deb.",
      "Fedora/openSUSE: instale o .rpm com sudo dnf install ./SIGA-Desktop-Linux-x86_64.rpm.",
    ],
    note: "A app usa o WebKitGTK do sistema; o .deb e o .rpm instalam as dependências automaticamente.",
  },
}

export default function DownloadPage() {
  const visitorOs = useVisitorOs()
  const [tab, setTab] = useState<DesktopOs>(visitorOs ?? "windows")

  return (
    <MarketingLayout
      title="SIGA Plus para computador"
      description="A app do SIGA Plus para Windows, macOS e Linux: o mesmo portal da escola, com impressão directa, catracas e sessão protegida por PIN."
      eyebrow="Transferir"
    >
      <div className="container mx-auto space-y-20 px-4 py-12 sm:px-6 lg:px-8">
        <section aria-labelledby="download-title" className="mx-auto max-w-5xl">
          <h2 id="download-title" className="sr-only">
            Escolha o seu sistema
          </h2>
          <DesktopDownloadCards />
          <p className="text-muted-foreground mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center text-sm">
            <span className="inline-flex items-center gap-1.5">
              <Wifi className="size-4" aria-hidden="true" />
              Precisa de Internet: os dados da escola ficam no servidor do SIGA Plus.
            </span>
            <a
              href={DESKTOP_RELEASES_PAGE}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex items-center gap-1 hover:underline"
            >
              Notas da versão e todas as transferências
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </p>
        </section>

        <section aria-labelledby="benefits-title" className="mx-auto max-w-5xl">
          <h2 id="benefits-title" className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Porquê a app para computador?
          </h2>
          <p className="text-muted-foreground mx-auto mt-3 max-w-2xl text-center">
            O SIGA Plus continua a funcionar no navegador. A app acrescenta o que o navegador não
            consegue fazer na secretaria e na portaria.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map(({ icon: Icon, title, description }) => (
              <div key={title} className="bg-card rounded-2xl border p-5">
                <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-lg">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="text-muted-foreground mt-1 text-sm">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="install-title" className="mx-auto max-w-3xl">
          <h2 id="install-title" className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Como instalar
          </h2>
          <Tabs value={tab} onValueChange={(value) => setTab(value as DesktopOs)} className="mt-8">
            <TabsList className="grid w-full grid-cols-3">
              {(Object.keys(STEPS) as DesktopOs[]).map((os) => (
                <TabsTrigger key={os} value={os}>
                  {STEPS[os].title}
                </TabsTrigger>
              ))}
            </TabsList>
            {(Object.keys(STEPS) as DesktopOs[]).map((os) => (
              <TabsContent key={os} value={os} className="bg-card mt-4 rounded-2xl border p-6">
                <ol className="space-y-4">
                  {STEPS[os].steps.map((step, index) => (
                    <li key={step} className="flex gap-3">
                      <span className="bg-primary text-primary-foreground grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold">
                        {index + 1}
                      </span>
                      <span className="text-sm leading-6">{step}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-muted-foreground mt-6 flex gap-2 rounded-lg bg-muted/50 p-3 text-xs">
                  <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
                  {STEPS[os].note}
                </p>
              </TabsContent>
            ))}
          </Tabs>
          <p className="text-muted-foreground mt-6 text-center text-sm">
            Depois de instalar, abra a app, escolha «Abrir SIGA», crie o PIN deste computador e
            entre com a sua conta da escola.
          </p>
        </section>
      </div>
    </MarketingLayout>
  )
}
