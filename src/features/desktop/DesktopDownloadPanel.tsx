import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";
import { isTauriDesktop } from "@/lib/desktop-utils";
import {
  DESKTOP_ASSETS,
  DESKTOP_CHECKSUMS_FILE,
  DESKTOP_OS_LABEL,
  DESKTOP_RELEASES_PAGE,
  desktopDownloadUrl,
  detectDesktopOs,
  fetchLatestDesktopRelease,
  formatDownloadSize,
  primaryDesktopAsset,
  type DesktopOs,
} from "@/lib/desktop-app-downloads";

const STEPS: Record<DesktopOs, string[]> = {
  windows: [
    "Abra o ficheiro que transferiu e siga o instalador. Não precisa de ser administrador.",
    "Se aparecer «O Windows protegeu o seu PC», clique em «Mais informações» e depois em «Executar mesmo assim».",
    "Abra o SIGA Desktop pelo menu Iniciar e entre com a sua conta.",
  ],
  macos: [
    "Abra o ficheiro .dmg e arraste o SIGA Desktop para a pasta Aplicações.",
    "Na primeira vez, clique no SIGA Desktop com o botão direito, escolha «Abrir» e confirme.",
    "No macOS 15 ou mais recente, se só aparecer «Concluído», vá a Definições do Sistema → Privacidade e Segurança → «Abrir mesmo assim».",
  ],
  linux: [
    "Ubuntu ou Debian: abra o .deb com dois cliques, ou instale com «sudo apt install ./SIGA-Desktop-Linux-amd64.deb».",
    "Fedora ou openSUSE: use o .rpm. Noutras distribuições, dê permissão de execução ao AppImage e abra-o.",
  ],
};

/**
 * Transferir a app SIGA Plus para computador: o botão do sistema de quem visita
 * primeiro, os outros sistemas por baixo. Usado em /transferir e nas Definições.
 */
export function DesktopDownloadPanel() {
  // O sistema só se sabe no navegador; no servidor fica o Windows, o mais comum.
  const [os, setOs] = useState<DesktopOs | null>("windows");
  const [detected, setDetected] = useState(false);
  const [insideApp, setInsideApp] = useState(false);
  useEffect(() => {
    setOs(detectDesktopOs(navigator.userAgent, navigator.platform ?? ""));
    setDetected(true);
    setInsideApp(isTauriDesktop());
  }, []);

  const release = useQuery({
    queryKey: ["desktop-release-latest"],
    queryFn: () => fetchLatestDesktopRelease(),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  const sizes = release.data?.sizes ?? {};
  const version = release.data?.version;

  const shownOs = os ?? "windows";
  const primary = primaryDesktopAsset(shownOs);
  // No telemóvel não há sistema a destacar: todos os ficheiros vão para a lista.
  const onPhone = detected && os === null;
  const others = onPhone
    ? DESKTOP_ASSETS
    : DESKTOP_ASSETS.filter((asset) => asset.file !== primary.file);
  const primaryMeta = [primary.format, formatDownloadSize(sizes[primary.file])]
    .concat(version ? [`versão ${version}`] : [])
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <IconChip icon={Monitor} tone="primary" size="md" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold">SIGA Plus para computador</h2>
          <p className="text-sm text-muted-foreground">
            Impressão directa, catracas e trabalho sem Internet, com actualizações automáticas.
          </p>
        </div>
      </div>

      {insideApp ? (
        <p className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
          Já está a usar a app de computador. Pode transferi-la aqui para outro computador.
        </p>
      ) : onPhone ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Esta app é para computador. Abra esta página no computador da escola, ou transfira o
          ficheiro aqui e passe-o por pen.
        </p>
      ) : null}

      {onPhone ? null : (
        <div className="rounded-xl border bg-card p-4">
          <Button asChild size="lg" className="w-full gap-2 sm:w-auto">
            <a href={desktopDownloadUrl(primary.file)} rel="noopener">
              <Download className="size-4" />
              Transferir para {DESKTOP_OS_LABEL[shownOs]}
            </a>
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">{primaryMeta}</p>

          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-medium">
              Como instalar no {DESKTOP_OS_LABEL[shownOs]}
            </summary>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted-foreground">
              {STEPS[shownOs].map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </details>
        </div>
      )}

      <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {onPhone ? "Instaladores" : "Outros sistemas"}
        </h3>
        <ul className="mt-2 divide-y rounded-xl border">
          {others.map((asset) => (
            <li key={asset.file} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{DESKTOP_OS_LABEL[asset.os]}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[asset.format, formatDownloadSize(sizes[asset.file])]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button asChild size="sm" variant="outline" className="shrink-0 gap-1.5">
                <a
                  href={desktopDownloadUrl(asset.file)}
                  rel="noopener"
                  aria-label={`Transferir ${asset.format} para ${DESKTOP_OS_LABEL[asset.os]}`}
                >
                  <Download className="size-3.5" />
                  Transferir
                </a>
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted-foreground">
        <a
          className="underline-offset-2 hover:underline"
          href={desktopDownloadUrl(DESKTOP_CHECKSUMS_FILE)}
          rel="noopener"
        >
          Verificar integridade (SHA-256)
        </a>
        {" · "}
        <a
          className="underline-offset-2 hover:underline"
          href={DESKTOP_RELEASES_PAGE}
          target="_blank"
          rel="noopener noreferrer"
        >
          Notas da versão
        </a>
      </p>
    </div>
  );
}
