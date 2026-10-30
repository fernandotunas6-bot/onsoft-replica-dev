import { useEffect, useState } from "react"
import { Check, Download, ShieldCheck, Smartphone } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatSize } from "@/lib/desktop-downloads"
import {
  ANDROID_ASSETS,
  ANDROID_CHECKSUMS_FILE,
  ANDROID_SIGNING_SHA256,
  androidDownloadUrl,
  fetchAndroidRelease,
  type AndroidRelease,
} from "@/lib/android-downloads"

const REQUIREMENTS = [
  "Android 7 ou mais recente",
  "Entra com a conta da escola: e-mail, B.I. ou n.º de aluno",
  "Boletim, faltas, horário e comunicados da escola",
]

const STEPS = [
  "Transfira o ficheiro no telemóvel e abra-o (na notificação ou na pasta Transferências).",
  "Se o Android pedir, autorize «Instalar apps desconhecidas» para o navegador ou o gestor de ficheiros.",
  "Se o Play Protect avisar que a app não é reconhecida, toque em «Mais detalhes» e depois em «Instalar mesmo assim».",
  "Abra o SIGA Plus e entre com a conta da escola. Com o n.º de aluno, escreva também o endereço da escola (ex.: ispab).",
]

const UPDATED_DATE = new Intl.DateTimeFormat("pt-PT", { dateStyle: "long" })

// Um só pedido por visita.
let androidRelease: Promise<AndroidRelease | null> | null = null

/** A app SIGA Plus para Android: transferência directa do APK, com os passos de instalação. */
export function AndroidDownloadCard({ highlight = false }: { highlight?: boolean }) {
  const [release, setRelease] = useState<AndroidRelease | null>(null)
  useEffect(() => {
    let active = true
    androidRelease ??= fetchAndroidRelease()
    void androidRelease.then((value) => {
      if (active) setRelease(value)
    })
    return () => {
      active = false
    }
  }, [])

  const [main, ...others] = ANDROID_ASSETS
  const updated = release?.updatedAt ? new Date(release.updatedAt) : null

  return (
    <div
      className={cn(
        "bg-card relative grid gap-8 rounded-2xl border p-6 shadow-sm md:grid-cols-2",
        highlight && "border-primary ring-primary/20 ring-4",
      )}
    >
      {highlight && <Badge className="absolute -top-3 start-6">O seu telemóvel</Badge>}
      <div className="flex flex-col">
        <div className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary grid size-12 shrink-0 place-items-center rounded-xl">
            <Smartphone className="size-6" aria-hidden="true" />
          </span>
          <h3 className="text-lg font-semibold">Android</h3>
        </div>

        {main && (
          <>
            <Button asChild size="lg" className="mt-6 w-full cursor-pointer">
              <a href={androidDownloadUrl(main.file)} download>
                <Download className="me-2 size-4" aria-hidden="true" />
                {main.label}
              </a>
            </Button>
            <p className="text-muted-foreground mt-2 text-center text-xs">
              {[
                "APK · Android 64 bits",
                formatSize(release?.sizes[main.file]),
                release?.version ? `versão ${release.version}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </>
        )}

        <ul className="mt-5 space-y-1.5 border-t pt-4">
          {REQUIREMENTS.map((requirement) => (
            <li key={requirement} className="text-muted-foreground flex gap-2 text-sm">
              <Check className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {requirement}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {others.map((asset) => (
            <a
              key={asset.file}
              href={androidDownloadUrl(asset.file)}
              download
              className="text-primary inline-flex items-center gap-1.5 hover:underline"
            >
              <Download className="size-3.5" aria-hidden="true" />
              {asset.label}
              {formatSize(release?.sizes[asset.file]) && (
                <span className="text-muted-foreground whitespace-nowrap">
                  · {formatSize(release?.sizes[asset.file])}
                </span>
              )}
            </a>
          ))}
          <a
            href={androidDownloadUrl(ANDROID_CHECKSUMS_FILE)}
            className="text-primary inline-flex items-center gap-1.5 hover:underline"
          >
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Verificar integridade (SHA-256)
          </a>
        </div>
        {updated && !Number.isNaN(updated.getTime()) && (
          <p className="text-muted-foreground mt-3 text-xs">
            Actualizada a {UPDATED_DATE.format(updated)}
          </p>
        )}
      </div>

      <div>
        <p className="text-sm font-medium">Como instalar</p>
        <ol className="mt-3 space-y-3">
          {STEPS.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="bg-primary text-primary-foreground grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold">
                {index + 1}
              </span>
              <span className="text-sm leading-6">{step}</span>
            </li>
          ))}
        </ol>
        <div className="text-muted-foreground mt-4 flex gap-2 rounded-lg bg-muted/50 p-3 text-xs">
          <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
          <div className="space-y-1.5">
            <p>
              O APK vem directamente das releases oficiais do SIGA Plus e é assinado sempre com a
              mesma chave: as versões seguintes instalam por cima.
            </p>
            <p>
              Certificado de assinatura (SHA-256):{" "}
              <code className="text-foreground break-all font-mono">{ANDROID_SIGNING_SHA256}</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
