import { cn } from "@/lib/utils";
import { MediaFrame } from "@/components/ui/media-frame";

const brandLogos: Record<string, { src: string; label: string; bleed?: boolean }> = {
  zoom: { src: "/brands/zoom.png", label: "Zoom" },
  teams: { src: "/brands/teams.png", label: "Microsoft Teams" },
  whatsapp_business: { src: "/brands/whatsapp.png", label: "WhatsApp" },
  google_classroom: { src: "/brands/classroom.png", label: "Google Classroom" },
  google_calendar: { src: "/brands/gcal.png", label: "Google Calendar" },
  moodle: { src: "/brands/moodle.png", label: "Moodle" },
  microsoft_365_education: { src: "/brands/microsoft365.png", label: "Microsoft 365" },
  apple_calendar: { src: "/brands/apple-calendar.svg", label: "Apple Calendar", bleed: true },
  resend_email: { src: "/brands/resend-mark.svg", label: "Resend", bleed: true },
  turnitin: { src: "/brands/turnitin.svg", label: "Turnitin", bleed: true },
  canvas: { src: "/brands/canvas-color.svg", label: "Canvas LMS", bleed: true },
  multicaixa_express: { src: "/brands/multicaixa.svg", label: "Multicaixa Express", bleed: true },
  unitel_money: { src: "/brands/unitel.svg", label: "Unitel Money", bleed: true },
  sige: { src: "/brands/sige.png", label: "SIGE" },
  agt: { src: "/brands/agt.svg", label: "AGT", bleed: true },
};

const moduleColors: Record<string, string> = {
  "siga-dashboard": "#6A2CE0",
  "siga-alunos": "#2563EB",
  "siga-pedagogica": "#0F9D58",
  "siga-calendario": "#EA4335",
  "siga-financeiro": "#D97706",
  "siga-faturas": "#C2410C",
  "siga-documentos": "#0F766E",
  "siga-arquivos": "#1D4ED8",
  "siga-comunicacoes": "#0284C7",
  "siga-pessoas": "#7C3AED",
  "siga-relatorios-academicos": "#15803D",
  "siga-relatorios-financeiros": "#B45309",
  "siga-acessos": "#334155",
  "siga-matricula": "#0E7490",
};

const moduleGlyphs: Record<string, string> = {
  "siga-dashboard": "M6 6h5v5H6zm7 0h5v5h-5zM6 13h5v5H6zm7 0h5v5h-5z",
  "siga-alunos": "M12 7.2a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8ZM7.2 17.2c.6-2.2 2.4-3.4 4.8-3.4s4.2 1.2 4.8 3.4H7.2Z",
  "siga-pedagogica": "M5.6 8.2 12 5.8l6.4 2.4L12 10.6 5.6 8.2Zm1.8 2.4v4.2L12 17l4.6-2.2v-4.2L12 14.2 7.4 10.6Z",
  "siga-calendario": "M7 6.4h10A1.6 1.6 0 0 1 18.6 8v10A1.6 1.6 0 0 1 17 19.6H7A1.6 1.6 0 0 1 5.4 18V8A1.6 1.6 0 0 1 7 6.4Zm0 3.2v2.2h10V9.6H7Z",
  "siga-financeiro": "M12 5.6A6.4 6.4 0 1 1 5.6 12 6.4 6.4 0 0 1 12 5.6Zm-.8 3h1.6v1.1c.9.2 1.6.7 1.6 1.7 0 1.1-.9 1.6-1.6 1.8v2.1c.4 0 .7-.2.8-.5h1.5c-.2 1.1-1.1 1.8-2.3 2v1.1h-1.6v-1.1c-.9-.2-1.7-.8-1.7-1.9 0-1.1.8-1.6 1.7-1.8V10c-.3 0-.6.2-.7.5H8.9c.2-1.1 1.1-1.7 2.3-1.9V8.6Z",
  "siga-documentos": "M8 5.6h5.2L18 10.4V18a1.6 1.6 0 0 1-1.6 1.6H8A1.6 1.6 0 0 1 6.4 18V7.2A1.6 1.6 0 0 1 8 5.6Zm5.2 1.4v3.4H17l-3.8-3.4Z",
  "siga-arquivos": "M5.6 8.2 12 5.4l6.4 2.8v8.4L12 19.4 5.6 16.6V8.2Zm1.8 1.6v5.6L12 17.4l4.6-2V9.8L12 7.6 7.4 9.8Z",
  "siga-comunicacoes": "M6 7.2A1.6 1.6 0 0 1 7.6 5.6h8.8A1.6 1.6 0 0 1 18 7.2v6.4a1.6 1.6 0 0 1-1.6 1.6H11l-3.6 3v-3H7.6A1.6 1.6 0 0 1 6 13.6V7.2Z",
  "siga-pessoas": "M9 7.4a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4Zm6.2.4a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6ZM5.8 17.2c.5-2 2.2-3.1 4.4-3.1s3.9 1.1 4.4 3.1H5.8Z",
  "siga-faturas": "M8 5.6h8A1.6 1.6 0 0 1 17.6 7.2v11.2L12 16.2l-5.6 2.2V7.2A1.6 1.6 0 0 1 8 5.6Zm1.4 3h5.2v1.3H9.4zm0 2.6h5.2v1.3H9.4z",
  "siga-relatorios-academicos": "M6.4 16.8 9.6 11l2.2 3.2 2.4-4.2 3.4 6.8H6.4ZM7 6.4h10v1.6H7z",
  "siga-relatorios-financeiros": "M6.4 16.4h2.2v-4H6.4zm4.5 0h2.2V7.6h-2.2zm4.5 0h2.2v-7h-2.2z",
  "siga-acessos": "M12 6.2a3.2 3.2 0 0 1 3.2 3.2v1.4h1.2A1.4 1.4 0 0 1 17.8 12.2v5.2A1.4 1.4 0 0 1 16.4 18.8H7.6A1.4 1.4 0 0 1 6.2 17.4v-5.2A1.4 1.4 0 0 1 7.6 10.8h1.2V9.4A3.2 3.2 0 0 1 12 6.2Z",
  "siga-matricula": "M8 6.2h8A1.8 1.8 0 0 1 17.8 8v12.4L12 17.6l-5.8 2.8V8A1.8 1.8 0 0 1 8 6.2Zm1.6 3.2v1.4h4.8V9.4H9.6Zm0 3v1.4h3.6V12.4H9.6Z",
};

export const brandedLauncherIds = Object.keys(brandLogos);

export function AppMark({ id, className }: { id: string; className?: string }) {
  const logo = brandLogos[id];
  if (logo) {
    return (
      <MediaFrame
        src={logo.src}
        alt={logo.label}
        ratio="1/1"
        rounded="rounded-[22%]"
        className={cn(
          "size-10",
          logo.bleed ? undefined : "bg-background p-0.5 shadow-sm",
          className,
        )}
        imgClassName="object-contain"
      />
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-10", className)}>
      <rect width="24" height="24" rx="6" fill={moduleColors[id] ?? "#6A2CE0"} />
      <path fill="#fff" d={moduleGlyphs[id] ?? "M7 7h10v10H7z"} />
    </svg>
  );
}
