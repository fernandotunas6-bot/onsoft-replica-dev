import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { getOrCreateCalendarFeedToken } from "@/features/calendar/feed";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { AppMark } from "./app-marks";
import {
  actionForCapability,
  copyText,
  meetingRoomLink,
  officialUrlForCapability,
  paymentReference,
  providerIdFromCapability,
} from "./actions";
import { capabilitiesForModule, type SigaHostModule } from "./install";
import { useInstalledIntegrations } from "./use-installed-integrations";

export function InstalledModuleTools({
  module,
  onExport,
}: {
  module: SigaHostModule;
  onExport?: (kind: "sige_students" | "sige_classes") => void;
}) {
  const navigate = useNavigate();
  const { school } = useSchoolSettings();
  const { granted } = useInstalledIntegrations();
  const tools = capabilitiesForModule(module, granted);
  if (!tools.length) return null;

  const run = async (id: string, label: string) => {
    const kind = actionForCapability({ id });
    try {
      if (kind === "ics-google" || kind === "ics-apple") {
        const feed = await getOrCreateCalendarFeedToken();
        const url = `${window.location.origin}/calendario/ics?token=${feed.token}`;
        await copyText(url);
        toast.success("Feed ICS copiado", {
          description:
            kind === "ics-apple"
              ? "No iPhone: Definições → Calendário → Adicionar conta → Calendário subscrito."
              : "No Google Calendar: Definições → Adicionar calendário → Por URL.",
        });
        if (kind === "ics-google") {
          window.open(
            "https://calendar.google.com/calendar/u/0/r/settings/addbyurl",
            "_blank",
            "noopener,noreferrer",
          );
        }
        return;
      }
      if (kind === "copy-payment-ref" || kind === "copy-unitel-ref") {
        const reference = paymentReference(kind === "copy-unitel-ref" ? "UML" : "EMIS");
        await copyText(reference);
        toast.success(`${label}: referência ${reference}`, {
          description: "Cole no plano de pagamento ou no comprovativo.",
        });
        return;
      }
      if (kind === "copy-nif") {
        const nif = school?.nif?.trim();
        if (!nif) {
          toast.message("NIF em falta", {
            description: "Defina o NIF da escola em Definições → Escola.",
          });
          return;
        }
        await copyText(nif);
        toast.success(`NIF ${nif} copiado`);
        return;
      }
      if (kind === "copy-einvoice") {
        const nif = school?.nif?.trim() || "sem-nif";
        const payload = `AGT;${nif};${school?.name ?? "Escola"};${new Date().toISOString().slice(0, 10)}`;
        await copyText(payload);
        toast.success("Linha de faturação electrónica copiada", {
          description: "Use no software certificado ou no Portal do Contribuinte.",
        });
        window.open(
          officialUrlForCapability(id) || "https://portaldocontribuinte.minfin.gov.ao/",
          "_blank",
          "noopener,noreferrer",
        );
        return;
      }
      if (kind === "copy-meeting-zoom" || kind === "copy-meeting-teams") {
        const link = meetingRoomLink(kind === "copy-meeting-zoom" ? "zoom" : "teams");
        await copyText(link);
        toast.success("Link da sala copiado", { description: link });
        return;
      }
      if (kind === "open-whatsapp") {
        window.open("https://web.whatsapp.com/", "_blank", "noopener,noreferrer");
        toast.message("WhatsApp Web", {
          description: "Cole o link do grupo na ficha da turma para ficar gravado no SIGA.",
        });
        return;
      }
      if (kind === "navigate-notas") {
        void navigate({ href: "/pedagogica?tab=notas" });
        toast.message(label, { description: "Aberta a pauta para usar esta função." });
        return;
      }
      if (kind === "navigate-horarios") {
        void navigate({ href: "/pedagogica?tab=horarios" });
        return;
      }
      if (kind === "navigate-comunicacoes") {
        void navigate({ href: "/comunicacoes" });
        toast.message(label, { description: "Use o comunicado para enviar por este canal." });
        return;
      }
      if (kind === "navigate-arquivos") {
        void navigate({ href: "/arquivos" });
        toast.message(label, {
          description: "Aberta a biblioteca. OneDrive fica catalog-ready; os bytes estão no SGA ou neste dispositivo.",
        });
        return;
      }
      if (kind === "export-sige-students" || kind === "export-sige-classes") {
        if (onExport) {
          onExport(kind === "export-sige-students" ? "sige_students" : "sige_classes");
          toast.success("Exportação SIGE preparada");
          return;
        }
        void navigate({
          href: kind === "export-sige-students" ? "/alunos" : "/pedagogica?tab=turmas",
        });
        toast.message("Exportar para o SIGE", {
          description: "Use CSV ou PDF Oficial nesta lista.",
        });
        return;
      }
      const href = officialUrlForCapability(id);
      if (href) window.open(href, "_blank", "noopener,noreferrer");
      toast.success(`${label} pronta`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível executar a função.");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        Funções instaladas
      </p>
      <div className="flex flex-wrap gap-2">
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-2.5 py-1.5 text-left text-xs font-medium transition-colors hover:bg-secondary"
            onClick={() => void run(tool.id, tool.label)}
          >
            <AppMark id={providerIdFromCapability(tool.id)} className="size-6" />
            {tool.label}
          </button>
        ))}
      </div>
    </div>
  );
}
