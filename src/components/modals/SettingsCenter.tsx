import { useMemo } from "react";
import {
  Building2,
  CreditCard,
  GraduationCap,
  FolderOpen,
  Gauge,
  Globe,
  KeyRound,
  Palette,
  Link2,
  Plug,
  ShieldCheck,
  Sliders,
  Sparkles,
  User,
  UserCog,
} from "lucide-react";
import { StackedModal, type StackPanel } from "@/components/ui/stacked-modal";
import { AppearanceColors } from "@/components/settings/AppearanceColors";
import { ProfileSettingsPanel } from "@/features/auth/ProfileSettingsPanel";
import { PasswordChangeForm } from "@/features/auth/PasswordChangeForm";
import {
  FinancePanel,
  IntegrationsPanel,
  PedagogicalSettingsPanel,
  SchoolSettingsPanel,
  SecurityPanel,
  DigitalIdentityPanel,
} from "@/features/school/settings-panels";
import { EnrollmentCampaignPanel } from "@/features/enrollment/EnrollmentCampaignPanel";
import { SpotlightSettingsPanel } from "@/features/spotlight/SpotlightSettingsPanel";
import { FilesSettingsPanel } from "@/features/arquivos/FilesSettingsPanel";
import { PerformancePanel } from "@/features/school/PerformancePanel";

/**
 * Centro único de configurações do SIGA: tudo o que antes vivia espalhado
 * (página /configuracoes, atalhos no cabeçalho) fica aqui, num só modal.
 */

function useSettingsPanels(): StackPanel[] {
  return useMemo<StackPanel[]>(
    () => [
      {
        id: "root",
        title: "Definições",
        description: "Só o que o SGA guarda de facto.",
        icon: Sliders,
        tone: "primary",
        rows: [
          {
            label: "Conta",
            description: "Perfil e palavra-passe",
            icon: User,
            tone: "primary",
            to: "conta",
          },
          {
            label: "Escola",
            description: "Identidade, ano lectivo e notificações",
            icon: Building2,
            tone: "info",
            to: "escola",
          },
          {
            label: "Financeiro",
            description: "Cobrança e multas",
            icon: CreditCard,
            tone: "warning",
            to: "financeiro",
          },
          {
            label: "Matrícula pública",
            description: "Link e página de apresentação",
            icon: Link2,
            tone: "info",
            to: "matricula",
          },
          {
            label: "Destaques",
            description: "Notas e novidades no painel da conta",
            icon: Sparkles,
            tone: "primary",
            to: "destaques",
          },
          {
            label: "Arquivos",
            description: "Áreas e visibilidade dos ficheiros",
            icon: FolderOpen,
            tone: "info",
            to: "arquivos",
          },
          {
            label: "Integrações",
            description: "Gmail e outros canais",
            icon: Plug,
            tone: "primary",
            to: "integracoes",
          },
          {
            label: "Segurança",
            description: "Políticas e auditoria",
            icon: ShieldCheck,
            tone: "destructive",
            to: "seguranca",
          },
          {
            label: "Aparência",
            description: "Cores e tema",
            icon: Palette,
            tone: "muted",
            to: "sistema.cores",
          },
          {
            label: "Desempenho",
            description: "Vitals e consultas lentas",
            icon: Gauge,
            tone: "info",
            to: "sistema.desempenho",
          },
        ],
      },
      {
        id: "conta",
        title: "Conta",
        icon: User,
        tone: "primary",
        rows: [
          {
            label: "Perfil",
            description: "Nome e foto",
            icon: UserCog,
            tone: "primary",
            to: "conta.perfil",
          },
          {
            label: "Palavra-passe",
            description: "Alterar credenciais",
            icon: KeyRound,
            tone: "warning",
            to: "conta.senha",
          },
        ],
      },
      {
        id: "conta.perfil",
        title: "Perfil",
        icon: UserCog,
        tone: "primary",
        render: () => <ProfileSettingsPanel />,
      },
      {
        id: "conta.senha",
        title: "Palavra-passe",
        description: "Mínimo de 10 caracteres, com letra, número e símbolo.",
        icon: KeyRound,
        tone: "warning",
        render: () => <PasswordChangeForm compact />,
      },
      {
        id: "escola",
        title: "Escola",
        description: "Identidade da instituição, ano lectivo e notificações.",
        icon: Building2,
        tone: "info",
        render: () => <SchoolSettingsPanel />,
      },
      {
        id: "identidade",
        title: "Identidade Digital",
        description: "Subdomínios, e-mail institucional e domínio personalizado.",
        icon: Globe,
        tone: "primary",
        render: () => <DigitalIdentityPanel />,
      },
      {
        id: "pedagogico",
        title: "Pedagógico",
        description: "Níveis de ensino, cursos do II ciclo e disciplinas do currículo.",
        icon: GraduationCap,
        tone: "primary",
        render: () => <PedagogicalSettingsPanel />,
      },
      {
        id: "financeiro",
        title: "Financeiro",
        description: "Parâmetros de cobrança activos nesta instalação.",
        icon: CreditCard,
        tone: "warning",
        render: () => <FinancePanel />,
      },
      {
        id: "matricula",
        title: "Matrícula pública",
        description: "Página de apresentação e link partilhável para candidaturas.",
        icon: Link2,
        tone: "info",
        render: () => <EnrollmentCampaignPanel />,
      },
      {
        id: "destaques",
        title: "Destaques",
        description: "Cartões do painel da conta: notas, novidades e atalhos.",
        icon: Sparkles,
        tone: "primary",
        render: () => <SpotlightSettingsPanel />,
      },
      {
        id: "arquivos",
        title: "Arquivos",
        description:
          "Onde a escola guarda PDF, Word, Excel e imagens — e a área por defeito de cada colaborador.",
        icon: FolderOpen,
        tone: "info",
        render: () => <FilesSettingsPanel />,
      },
      {
        id: "integracoes",
        title: "Integrações",
        description: "Estado real de cada canal ligado ao SIGA.",
        icon: Plug,
        tone: "primary",
        render: () => <IntegrationsPanel />,
      },
      {
        id: "seguranca",
        title: "Segurança",
        description: "O que esta instalação aplica de facto.",
        icon: ShieldCheck,
        tone: "destructive",
        render: () => <SecurityPanel />,
      },
      {
        id: "sistema.cores",
        title: "Aparência",
        description: "Personalização visual guardada neste browser.",
        icon: Palette,
        tone: "primary",
        render: () => <AppearanceColors />,
      },
      {
        id: "sistema.desempenho",
        title: "Desempenho",
        description: "Web Vitals, consultas e resposta ao toque.",
        icon: Gauge,
        tone: "info",
        render: () => <PerformancePanel />,
      },
    ],
    [],
  );
}

export function SettingsCenter({
  open,
  onOpenChange,
  initialPanelId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPanelId?: string | undefined;
}) {
  const panels = useSettingsPanels();
  return (
    <StackedModal
      open={open}
      onOpenChange={onOpenChange}
      panels={panels}
      rootId="root"
      eyebrow="SIGA"
      size="xl"
      initialPanelId={initialPanelId}
    />
  );
}
