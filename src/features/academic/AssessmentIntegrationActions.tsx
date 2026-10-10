import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { whatsappHref } from "@/features/integrations/actions";

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Botões da barra do Centro de Avaliação que só aparecem com a integração
 * instalada na escola (Turnitin, Classroom, Moodle, Canvas, WhatsApp, Resend).
 */
export function AssessmentIntegrationActions({
  schoolName,
  academicYear,
  term,
  groupName,
  workCount,
}: {
  schoolName: string;
  academicYear: string;
  term: number;
  groupName: string;
  workCount: number;
}) {
  const installed = useInstalledIntegrations();
  const summary = `Centro de Avaliação · ${groupName} · T${term} · ${academicYear}`;

  return (
    <>
      {installed.hasCapability("turnitin.originality") ? (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const payload = [
              schoolName,
              academicYear,
              `T${term}`,
              groupName,
              `${workCount} trabalhos`,
            ].join(" · ");
            await navigator.clipboard.writeText(payload);
            toast.success("Lote Turnitin copiado", {
              description: "Cole no Turnitin ou abra o guia oficial.",
            });
            openExternal("https://developers.turnitin.com/");
          }}
        >
          Turnitin
        </Button>
      ) : null}
      {installed.hasCapability("classroom.work") ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => openExternal("https://classroom.google.com/")}
        >
          Trabalhos
        </Button>
      ) : null}
      {installed.hasCapability("moodle.grades") ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => openExternal("https://docs.moodle.org/en/Gradebook")}
        >
          Notas Moodle
        </Button>
      ) : null}
      {installed.hasCapability("canvas.assignments") ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => openExternal("https://canvas.instructure.com/doc/api/assignments.html")}
        >
          Canvas
        </Button>
      ) : null}
      {installed.hasCapability("whatsapp.notices") ? (
        <Button size="sm" variant="outline" asChild>
          <a href={whatsappHref("", summary)} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
        </Button>
      ) : null}
      {installed.hasCapability("resend.documents") ? (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(`${summary}\n${schoolName}`);
            toast.success("Resumo copiado para e-mail Resend");
          }}
        >
          E-mail
        </Button>
      ) : null}
    </>
  );
}
