import { useQuery } from "@tanstack/react-query";
import { Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";
import { formatDownloadSize } from "@/lib/desktop-app-downloads";
import {
  ANDROID_ASSETS,
  ANDROID_CHECKSUMS_FILE,
  ANDROID_SIGNING_SHA256,
  androidDownloadUrl,
  fetchAndroidRelease,
} from "@/lib/android-app-downloads";

const STEPS = [
  "Transfira o ficheiro no telemóvel e abra-o (na notificação ou na pasta Transferências).",
  "Se o Android pedir, autorize «Instalar apps desconhecidas» para o navegador.",
  "Se o Play Protect avisar, toque em «Mais detalhes» e depois em «Instalar mesmo assim».",
  "Abra o SIGA Plus e entre com a conta da escola. Com o n.º de aluno, escreva também o endereço da escola.",
];

/**
 * A app SIGA Plus para Android (APK), para alunos e encarregados. Fora do telemóvel o
 * botão fica discreto: o destaque é a app do computador.
 */
export function AndroidDownloadCard({ prominent = true }: { prominent?: boolean }) {
  const release = useQuery({
    queryKey: ["android-release"],
    queryFn: () => fetchAndroidRelease(),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  const sizes = release.data?.sizes ?? {};
  const version = release.data?.version;
  const [main, ...others] = ANDROID_ASSETS;
  if (!main) return null;
  const meta = ["APK, Android 7 ou mais recente", formatDownloadSize(sizes[main.file])]
    .concat(version ? [`versão ${version}`] : [])
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <IconChip icon={Smartphone} tone="success" size="md" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold">SIGA Plus para Android</h2>
          <p className="text-sm text-muted-foreground">
            Boletim, faltas, horário e comunicados da escola no telemóvel.
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <Button
          asChild
          size="lg"
          variant={prominent ? "default" : "outline"}
          className="w-full gap-2 sm:w-auto"
        >
          <a href={androidDownloadUrl(main.file)} rel="noopener">
            <Download className="size-4" />
            {main.label}
          </a>
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">{meta}</p>
        {others.map((asset) => (
          <p key={asset.file} className="mt-1 text-xs">
            <a
              className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              href={androidDownloadUrl(asset.file)}
              rel="noopener"
            >
              {asset.label}
            </a>
          </p>
        ))}

        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium">Como instalar no Android</summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted-foreground">
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            Certificado da app (SHA-256):{" "}
            <code className="break-all font-mono text-foreground">{ANDROID_SIGNING_SHA256}</code>
            {" · "}
            <a
              className="underline-offset-2 hover:underline"
              href={androidDownloadUrl(ANDROID_CHECKSUMS_FILE)}
              rel="noopener"
            >
              somas dos ficheiros
            </a>
          </p>
        </details>
      </div>
    </div>
  );
}
