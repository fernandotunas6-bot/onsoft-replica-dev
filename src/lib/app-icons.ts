/**
 * Catálogo semântico de ícones do SIGA Plus — um conceito, um ícone.
 *
 * Todos vêm do Lucide (traço de 1,8 px, grelha 24 px), a única biblioteca de
 * ícones do projecto. O objectivo é evitar a proliferação visual: o mesmo
 * conceito com ícones diferentes em ecrãs diferentes, ou conceitos diferentes
 * com o mesmo ícone lado a lado no menu. Código novo que represente um módulo,
 * uma acção ou um estado importa daqui, não directamente do `lucide-react`.
 *
 * `tests/ui/app-icons.test.ts` garante que nenhum ícone de módulo é partilhado
 * por dois conceitos diferentes.
 */
import {
  Banknote,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarX,
  ChartColumn,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  Clock,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileBadge,
  FileSpreadsheet,
  FileText,
  FileUp,
  FolderOpen,
  GraduationCap,
  IdCard,
  Inbox,
  Info,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  Megaphone,
  Network,
  NotebookPen,
  Pencil,
  Plug,
  Plus,
  Printer,
  QrCode,
  ReceiptText,
  RefreshCw,
  School,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Stethoscope,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Upload,
  UserCheck,
  UserPlus,
  UserRound,
  UserRoundCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/** Módulos e áreas do sistema (menu lateral, cabeçalhos de página, atalhos). */
export const moduleIcons = {
  dashboard: LayoutDashboard,
  pedagogy: School,
  students: GraduationCap,
  enrollment: UserPlus,
  enrollmentConfirm: UserCheck,
  onlineEnrollment: Link2,
  people: Users,
  access: KeyRound,
  classes: BookOpen,
  grades: ClipboardCheck,
  academicReports: ChartColumn,
  attendance: CalendarCheck,
  staffAbsences: CalendarX,
  qrPresence: QrCode,
  accessCards: IdCard,
  schedule: Clock,
  calendar: CalendarDays,
  finance: Wallet,
  receipts: ReceiptText,
  financialReports: TrendingUp,
  hr: BriefcaseBusiness,
  payouts: Banknote,
  documents: FileText,
  files: FolderOpen,
  lessonPlans: NotebookPen,
  communications: Megaphone,
  alumni: Network,
  import: FileUp,
  officialTemplates: FileSpreadsheet,
  audit: ScrollText,
  settings: Settings,
  security: ShieldCheck,
  school: Building2,
  integrations: Plug,
  profile: UserRound,
  accessRequests: Inbox,
  /** Vincular a conta a uma escola (pedido do lado do requerente). */
  institutionalLink: UserRoundCheck,
  /** Tesouraria: caixa e cobranças do dia. */
  treasury: Landmark,
  /** Acompanhamento de alunos em risco de insucesso. */
  studentRisk: TrendingDown,
  /** Diagnóstico de erros do sistema. */
  diagnostics: Stethoscope,
} satisfies Record<string, LucideIcon>;

export type ModuleIconKey = keyof typeof moduleIcons;

/** Acções recorrentes — sempre o mesmo glifo para a mesma acção. */
export const actionIcons = {
  add: Plus,
  edit: Pencil,
  delete: Trash2,
  download: Download,
  upload: Upload,
  search: Search,
  refresh: RefreshCw,
  external: ExternalLink,
  copy: Copy,
  print: Printer,
  /** Exportar o documento/relatório oficial (PDF com timbre da escola). */
  officialExport: FileBadge,
  loading: LoaderCircle,
} satisfies Record<string, LucideIcon>;

/** Estados — combinam com os tons `success | warning | destructive | info | muted`. */
export const statusIcons = {
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
  info: Info,
  pending: Clock3,
} satisfies Record<string, LucideIcon>;
