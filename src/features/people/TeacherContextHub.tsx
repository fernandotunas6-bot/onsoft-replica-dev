import { useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRight, BookOpen, BriefcaseBusiness, CalendarDays, ClipboardCheck,
  FolderOpen, GraduationCap, type LucideIcon,
} from "lucide-react";
import { canAccessPath, type ModuleGrantMap } from "@/features/auth/access-policy";
import {
  availableTeacherTools, type TeacherToolId, type TeacherContextGroup,
} from "@/features/people/teacher-context-catalog";

type ProfileTab = "hoje" | "disciplinas" | "documentos" | "contratos" | "vencimentos" | "historico";
const GROUP_ICONS: Record<TeacherContextGroup, LucideIcon> = {
  Lectivo: CalendarDays,
  Avaliação: ClipboardCheck,
  Recursos: FolderOpen,
  Carreira: BriefcaseBusiness,
  "Ensino Superior": GraduationCap,
};

export function TeacherContextHub({
  teacherId, personId, assignedLevels, schoolLevels, isSelf, canManage, canReadHr,
  role, grants, onSelectTab, compact = false,
}: {
  teacherId: string;
  personId?: string | null;
  assignedLevels: readonly string[];
  schoolLevels: readonly string[];
  isSelf: boolean;
  canManage: boolean;
  canReadHr: boolean;
  role: string;
  grants: ModuleGrantMap;
  onSelectTab: (tab: ProfileTab) => void;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const tools = availableTeacherTools({
    assignedLevels, schoolLevels, isSelf, canManage, canReadHr,
    canOpen: (path) => canAccessPath(path, role, grants),
  });
  const groups = [...new Set(tools.map((tool) => tool.group))];
  const open = (id: TeacherToolId) => {
    switch (id) {
      case "aulas": onSelectTab("hoje"); break;
      case "turmas": onSelectTab("disciplinas"); break;
      case "documentos": onSelectTab("documentos"); break;
      case "contratos": onSelectTab("contratos"); break;
      case "vencimentos": onSelectTab("vencimentos"); break;
      case "historico": onSelectTab("historico"); break;
      case "horario":
        void navigate({ to: "/pedagogica", search: {
          tab: "horarios", ...(canManage ? { professor: teacherId } : {}),
        } }); break;
      case "planos":
        void navigate({ to: "/planos-aula", search: { professor: teacherId } }); break;
      case "notas":
        void navigate({ to: "/pedagogica", search: { tab: "notas" } }); break;
      case "trabalhos":
        void navigate({ to: "/pedagogica/trabalhos", search: { professor: teacherId } }); break;
      case "pautas":
        void navigate({ to: "/pedagogica", search: { tab: "pautas" } }); break;
      case "exames":
        void navigate({ to: "/pedagogica", search: { tab: "exames" } }); break;
      case "competencias":
        void navigate({ to: "/pedagogica", search: { tab: "competencias" } }); break;
      case "risco": void navigate({ to: "/pedagogica/risco" }); break;
      case "materiais":
        void navigate({ to: "/arquivos", search: {
          ...(personId ? { pessoa: personId } : {}),
        } }); break;
      case "virtuais": void navigate({ to: "/aulas-virtuais" }); break;
      case "calendario": void navigate({ to: "/calendario" }); break;
      case "comunicacoes": void navigate({ to: "/comunicacoes" }); break;
      case "identidade":
        if (personId) void navigate({ to: "/pessoas/$personId", params: { personId } });
        break;
      case "faltas": void navigate({ to: "/financeiro/rh/faltas" }); break;
      case "superior_pautas": void navigate({ to: "/pedagogica/pautas-superior" }); break;
      case "superior_planos": void navigate({ to: "/pedagogica/superior" }); break;
      default: id satisfies never;
    }
  };
  const visible = compact ? tools.filter((tool) =>
    ["aulas", "horario", "turmas", "planos", "notas", "trabalhos", "documentos", "superior_pautas"].includes(tool.id)
  ).slice(0, 6) : tools;

  return <div className="space-y-4" aria-label="Ferramentas contextuais do professor">
    {!compact ? <p className="text-sm text-muted-foreground">
      As ferramentas usam o perfil docente da escola activa. Acções de lançamento,
      emissão e pagamento abrem os módulos originais, sujeitos às permissões de cada função.
    </p> : null}
    {(compact ? ["Lectivo", "Avaliação", "Carreira", "Ensino Superior"] as TeacherContextGroup[] : groups)
      .filter((group) => visible.some((tool) => tool.group === group))
      .map((group) => {
        const Icon = GROUP_ICONS[group];
        return <section key={group} className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="size-4 text-muted-foreground" aria-hidden /> {group}
          </h3>
          <div className={compact ? "grid gap-2 sm:grid-cols-2" : "grid gap-2 sm:grid-cols-2 xl:grid-cols-3"}>
            {visible.filter((tool) => tool.group === group).map((tool) =>
              <button key={tool.id} type="button"
                className="group flex min-h-16 w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => open(tool.id)}
                aria-label={tool.label}>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{tool.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{tool.detail}</span>
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
              </button>
            )}
          </div>
        </section>;
      })}
    {!tools.length ? <p className="text-sm text-muted-foreground">
      Não há ferramentas disponíveis para esta função e escola.
    </p> : null}
    {compact ? <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <BookOpen className="size-3.5" /> As restantes áreas estão no separador Ferramentas.
    </p> : null}
  </div>;
}
