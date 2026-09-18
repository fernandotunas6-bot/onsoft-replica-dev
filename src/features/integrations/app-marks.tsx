import type { ElementType } from "react";
import {
  BookOpen,
  CalendarDays,
  FileText,
  FileUp,
  FolderOpen,
  GraduationCap,
  KeyRound,
  LayoutGrid,
  Megaphone,
  NotebookPen,
  PieChart,
  QrCode,
  Receipt,
  TrendingUp,
  UserCog,
  UserPlus,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MediaFrame } from "@/components/ui/media-frame";
import type { ChipTone } from "@/components/ui/icon-chip";
import { toneClass } from "@/components/ui/icon-chip-styles";

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
  gmail_workspace: { src: "/brands/gmail.png", label: "Gmail Workspace" },
  firebase_analytics: { src: "/brands/firebase.png", label: "Firebase & Crashlytics" },
  sige: { src: "/brands/sige.png", label: "SIGE" },
  agt: { src: "/brands/agt.svg", label: "AGT", bleed: true },
};

export const brandedLauncherIds = Object.keys(brandLogos);

type SigaMark = { icon: ElementType; tone: ChipTone; label: string };

/** Ícones premium dos módulos internos SIGA (launcher e atalhos). */
export const sigaModuleMarks: Record<string, SigaMark> = {
  "siga-dashboard": { icon: LayoutGrid, tone: "primary", label: "Início" },
  "siga-alunos": { icon: GraduationCap, tone: "primary", label: "Alunos" },
  "siga-pedagogica": { icon: BookOpen, tone: "info", label: "Pedagógica" },
  "siga-calendario": { icon: CalendarDays, tone: "info", label: "Calendário" },
  "siga-financeiro": { icon: Wallet, tone: "warning", label: "Tesouraria" },
  "siga-faturas": { icon: Receipt, tone: "warning", label: "Faturas" },
  "siga-documentos": { icon: FileText, tone: "primary", label: "Documentos" },
  "siga-arquivos": { icon: FolderOpen, tone: "muted", label: "Arquivos" },
  "siga-comunicacoes": { icon: Megaphone, tone: "info", label: "Comunicados" },
  "siga-pessoas": { icon: UserCog, tone: "primary", label: "Pessoas" },
  "siga-relatorios-academicos": {
    icon: PieChart,
    tone: "success",
    label: "Relatórios académicos",
  },
  "siga-relatorios-financeiros": {
    icon: TrendingUp,
    tone: "success",
    label: "Relatórios financeiros",
  },
  "siga-acessos": { icon: KeyRound, tone: "destructive", label: "Acessos" },
  "siga-importar": { icon: FileUp, tone: "info", label: "Importação de Dados" },
  "siga-catracas": { icon: QrCode, tone: "primary", label: "Catracas" },
  "siga-planos-aula": { icon: NotebookPen, tone: "info", label: "Planos de Aula" },
  "siga-matricula": { icon: UserPlus, tone: "success", label: "Matrícula" },
};

function PremiumIconMark({
  icon: Icon,
  tone,
  label,
  className,
}: SigaMark & { className?: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      data-app-mark=""
      data-tone={tone}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[22%] leading-none shadow-sm ring-1 ring-black/5 dark:ring-white/10",
        toneClass[tone],
        className ?? "size-10",
      )}
    >
      <Icon className="size-[52%] shrink-0" strokeWidth={1.85} />
    </span>
  );
}

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

  const siga = sigaModuleMarks[id];
  if (siga) {
    return <PremiumIconMark {...siga} className={className} />;
  }

  return <PremiumIconMark icon={LayoutGrid} tone="muted" label="SIGA" className={className} />;
}
