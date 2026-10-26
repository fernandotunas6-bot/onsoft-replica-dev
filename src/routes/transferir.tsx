// style-check: route-exempt - página pública de transferência da app, sem shell administrativo.
import { createFileRoute, Link } from "@tanstack/react-router";
import { SigaLogo } from "@/components/ui/siga-logo";
import { AppDownloads } from "@/features/desktop/AppDownloads";

export const Route = createFileRoute("/transferir")({
  head: () => ({
    meta: [
      { title: "Transferir a app · SIGA" },
      {
        name: "description",
        content:
          "Instale o SIGA Plus no computador (Windows, macOS, Linux) ou no telemóvel Android.",
      },
    ],
  }),
  component: DownloadAppPage,
});

function DownloadAppPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-lg space-y-6">
        <Link to="/" aria-label="Voltar ao SIGA" className="inline-block">
          <SigaLogo />
        </Link>
        <h1 className="sr-only">Transferir as apps do SIGA Plus</h1>
        <AppDownloads />
      </div>
    </main>
  );
}
