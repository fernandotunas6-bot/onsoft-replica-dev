import { useMemo } from "react";
import {
  Bell,
  Building2,
  CalendarDays,
  CreditCard,
  Database,
  FileText,
  Gauge,
  GraduationCap,
  KeyRound,
  Languages,
  Mail,
  MessageSquare,
  Palette,
  Plug,
  Receipt,
  ShieldCheck,
  Sliders,
  User,
  UserCog,
  Users,
  Webhook,
  WifiOff,
} from "lucide-react";
import { StackedModal, type StackPanel } from "@/components/ui/stacked-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

/**
 * Centro de configurações do SIGA em profundidade (estilo Lovable):
 * um só modal, funções atrás de funções, tudo declarado como dados
 * para se manter modular e fácil de estender por módulo do sistema.
 */

function Field({
  label,
  hint,
  defaultValue,
  id,
  type = "text",
}: {
  label: string;
  hint?: string;
  defaultValue?: string;
  id: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} defaultValue={defaultValue} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Toggle({
  id,
  label,
  hint,
  defaultChecked = false,
}: {
  id: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-semibold">
          {label}
        </Label>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch id={id} defaultChecked={defaultChecked} />
    </div>
  );
}

const saveFooter = (label = "Guardar alterações") =>
  function Footer({ back }: { back: () => void }) {
    return (
      <>
        <Button variant="ghost" onClick={back}>
          Voltar
        </Button>
        <Button onClick={() => toast.success("Configuração guardada")}>{label}</Button>
      </>
    );
  };

function useSettingsPanels(): StackPanel[] {
  return useMemo<StackPanel[]>(
    () => [
      {
        id: "root",
        title: "Configurações do sistema",
        description: "Todas as funções do SIGA, organizadas por módulo e em profundidade.",
        icon: Sliders,
        tone: "primary",
        rows: [
          { label: "Conta e segurança", description: "Perfil, palavra-passe, sessões e 2FA", icon: User, tone: "primary", to: "conta" },
          { label: "Escola e ano lectivo", description: "Identidade, períodos e calendário", icon: Building2, tone: "info", to: "escola" },
          { label: "Académico", description: "Avaliação, pautas e critérios de aprovação", icon: GraduationCap, tone: "success", to: "academico" },
          { label: "Financeiro", description: "Planos, faturação e métodos de pagamento", icon: CreditCard, tone: "warning", to: "financeiro" },
          { label: "Comunicações", description: "E-mail, modelos e notificações", icon: MessageSquare, tone: "info", to: "comunicacoes" },
          { label: "Integrações", description: "Gmail, backend, webhooks", icon: Plug, tone: "primary", to: "integracoes" },
          { label: "Utilizadores e permissões", description: "Funções, convites e auditoria", icon: Users, tone: "destructive", to: "utilizadores" },
          { label: "Aparência e desempenho", description: "Tema, idioma, pré-busca e modo offline", icon: Palette, tone: "muted", to: "sistema" },
        ],
      },

      /* ---------------- Conta ---------------- */
      {
        id: "conta",
        title: "Conta e segurança",
        description: "Dados pessoais e proteção do acesso.",
        icon: User,
        tone: "primary",
        rows: [
          { label: "Perfil", description: "Nome, e-mail e telefone", icon: UserCog, tone: "primary", to: "conta.perfil" },
          { label: "Palavra-passe", description: "Alterar credenciais de acesso", icon: KeyRound, tone: "warning", to: "conta.senha" },
          { label: "Autenticação em dois passos", description: "Aplicação autenticadora ou e-mail", icon: ShieldCheck, tone: "success", to: "conta.2fa" },
          { label: "Notificações pessoais", description: "O que recebes e por onde", icon: Bell, tone: "info", to: "conta.notificacoes" },
        ],
      },
      {
        id: "conta.perfil",
        title: "Perfil",
        icon: UserCog,
        tone: "primary",
        render: () => (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="set-nome" label="Nome completo" defaultValue="usuario teste" />
            <Field id="set-email" label="E-mail" type="email" defaultValue="teste@escola.com" />
            <Field id="set-tel" label="Telefone" defaultValue="+244 900 000 000" />
            <Field id="set-cargo" label="Cargo" defaultValue="Administrador" />
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },
      {
        id: "conta.senha",
        title: "Palavra-passe",
        description: "Mínimo de 10 caracteres, com números e símbolos.",
        icon: KeyRound,
        tone: "warning",
        render: () => (
          <div className="grid gap-4">
            <Field id="set-pass-old" label="Palavra-passe actual" type="password" />
            <Field id="set-pass-new" label="Nova palavra-passe" type="password" />
            <Field id="set-pass-rep" label="Confirmar nova palavra-passe" type="password" />
          </div>
        ),
        footer: (nav) => saveFooter("Actualizar")({ back: nav.back }),
      },
      {
        id: "conta.2fa",
        title: "Autenticação em dois passos",
        icon: ShieldCheck,
        tone: "success",
        render: () => (
          <div className="space-y-3">
            <Toggle id="set-2fa-app" label="Aplicação autenticadora" hint="Códigos temporários (TOTP)." defaultChecked />
            <Toggle id="set-2fa-mail" label="Código por e-mail" hint="Alternativa quando não há acesso à aplicação." />
            <Toggle id="set-2fa-force" label="Exigir a toda a equipa" hint="Aplica-se a todos os utilizadores administrativos." />
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },
      {
        id: "conta.notificacoes",
        title: "Notificações pessoais",
        icon: Bell,
        tone: "info",
        render: () => (
          <div className="space-y-3">
            <Toggle id="set-not-mat" label="Novas matrículas" defaultChecked />
            <Toggle id="set-not-pag" label="Pagamentos e faturas" defaultChecked />
            <Toggle id="set-not-doc" label="Documentos pendentes" />
            <Toggle id="set-not-sec" label="Alertas de segurança" defaultChecked />
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },

      /* ---------------- Escola ---------------- */
      {
        id: "escola",
        title: "Escola e ano lectivo",
        icon: Building2,
        tone: "info",
        rows: [
          { label: "Identidade da escola", description: "Nome, NIF, morada e logótipo", icon: Building2, tone: "info", to: "escola.identidade" },
          { label: "Anos lectivos e períodos", description: "Trimestres, datas e estado", icon: CalendarDays, tone: "primary", to: "escola.anos" },
          { label: "Documentos oficiais", description: "Cabeçalhos, numeração e assinaturas", icon: FileText, tone: "muted", to: "escola.documentos" },
        ],
      },
      {
        id: "escola.identidade",
        title: "Identidade da escola",
        icon: Building2,
        tone: "info",
        render: () => (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="set-esc-nome" label="Nome da instituição" defaultValue="Escola SIGA" />
            <Field id="set-esc-nif" label="NIF" defaultValue="5000000000" />
            <Field id="set-esc-mail" label="E-mail institucional" defaultValue="geral@escola.com" />
            <Field id="set-esc-tel" label="Telefone" defaultValue="+244 222 000 000" />
            <div className="sm:col-span-2">
              <Field id="set-esc-end" label="Morada" defaultValue="Luanda, Angola" />
            </div>
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },
      {
        id: "escola.anos",
        title: "Anos lectivos e períodos",
        description: "Define o ano activo e a estrutura de avaliação.",
        icon: CalendarDays,
        tone: "primary",
        render: () => (
          <div className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="set-ano-ini" label="Início do ano" type="date" defaultValue="2025-09-15" />
              <Field id="set-ano-fim" label="Fim do ano" type="date" defaultValue="2026-07-10" />
            </div>
            <Separator />
            <Toggle id="set-ano-tri" label="Três trimestres" hint="Alternativa: dois semestres." defaultChecked />
            <Toggle id="set-ano-lock" label="Bloquear anos encerrados" hint="Impede edição retroactiva de notas." defaultChecked />
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },
      {
        id: "escola.documentos",
        title: "Documentos oficiais",
        icon: FileText,
        tone: "muted",
        render: () => (
          <div className="space-y-3">
            <Field id="set-doc-prefix" label="Prefixo de numeração" defaultValue="SIGA/2025" />
            <Toggle id="set-doc-qr" label="Incluir QR de validação" defaultChecked />
            <Toggle id="set-doc-sign" label="Assinatura digital do director" />
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },

      /* ---------------- Académico ---------------- */
      {
        id: "academico",
        title: "Académico",
        icon: GraduationCap,
        tone: "success",
        rows: [
          { label: "Escala de avaliação", description: "Notas, pesos e arredondamento", icon: Gauge, tone: "success", to: "academico.escala" },
          { label: "Critérios de aprovação", description: "Média mínima e recursos", icon: ShieldCheck, tone: "warning", to: "academico.aprovacao" },
          { label: "Pautas e boletins", description: "Formato de emissão e visibilidade", icon: FileText, tone: "muted", to: "escola.documentos" },
        ],
      },
      {
        id: "academico.escala",
        title: "Escala de avaliação",
        icon: Gauge,
        tone: "success",
        render: () => (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="set-esc-min" label="Nota mínima" defaultValue="0" />
            <Field id="set-esc-max" label="Nota máxima" defaultValue="20" />
            <Field id="set-esc-peso" label="Peso da prova trimestral (%)" defaultValue="40" />
            <Field id="set-esc-round" label="Arredondamento (casas)" defaultValue="1" />
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },
      {
        id: "academico.aprovacao",
        title: "Critérios de aprovação",
        icon: ShieldCheck,
        tone: "warning",
        render: () => (
          <div className="space-y-3">
            <Field id="set-apr-media" label="Média mínima de aprovação" defaultValue="10" />
            <Toggle id="set-apr-rec" label="Permitir exame de recurso" defaultChecked />
            <Toggle id="set-apr-falta" label="Reprovar por excesso de faltas" hint="Limite de 25% das aulas." defaultChecked />
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },

      /* ---------------- Financeiro ---------------- */
      {
        id: "financeiro",
        title: "Financeiro",
        icon: CreditCard,
        tone: "warning",
        rows: [
          { label: "Planos e mensalidades", description: "Valores, descontos e bolsas", icon: Receipt, tone: "warning", to: "financeiro.planos" },
          { label: "Faturação", description: "Séries, IVA e vencimentos", icon: FileText, tone: "info", to: "financeiro.faturacao" },
          { label: "Métodos de pagamento", description: "Multicaixa, transferência, numerário", icon: CreditCard, tone: "primary", to: "financeiro.metodos" },
        ],
      },
      {
        id: "financeiro.planos",
        title: "Planos e mensalidades",
        icon: Receipt,
        tone: "warning",
        render: () => (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="set-fin-mens" label="Mensalidade base (AOA)" defaultValue="35000" />
            <Field id="set-fin-mat" label="Matrícula (AOA)" defaultValue="60000" />
            <Field id="set-fin-desc" label="Desconto irmãos (%)" defaultValue="10" />
            <Field id="set-fin-bolsa" label="Bolsas disponíveis" defaultValue="12" />
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },
      {
        id: "financeiro.faturacao",
        title: "Faturação",
        icon: FileText,
        tone: "info",
        render: () => (
          <div className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="set-fat-serie" label="Série" defaultValue="FT2025" />
              <Field id="set-fat-iva" label="IVA (%)" defaultValue="14" />
            </div>
            <Toggle id="set-fat-auto" label="Emitir fatura automática na matrícula" defaultChecked />
            <Toggle id="set-fat-mora" label="Aplicar juros de mora" hint="2% após 10 dias de atraso." />
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },
      {
        id: "financeiro.metodos",
        title: "Métodos de pagamento",
        icon: CreditCard,
        tone: "primary",
        render: () => (
          <div className="space-y-3">
            <Toggle id="set-pay-mcx" label="Multicaixa Express" defaultChecked />
            <Toggle id="set-pay-tpa" label="TPA na secretaria" defaultChecked />
            <Toggle id="set-pay-transf" label="Transferência bancária" defaultChecked />
            <Toggle id="set-pay-cash" label="Numerário" />
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },

      /* ---------------- Comunicações ---------------- */
      {
        id: "comunicacoes",
        title: "Comunicações",
        icon: MessageSquare,
        tone: "info",
        rows: [
          { label: "E-mail de envio", description: "Remetente, assinatura e domínio", icon: Mail, tone: "info", to: "comunicacoes.email" },
          { label: "Modelos de mensagem", description: "Matrícula, pagamento, avisos", icon: FileText, tone: "muted", to: "comunicacoes.modelos" },
          { label: "Notificações automáticas", description: "Gatilhos por evento", icon: Bell, tone: "primary", to: "comunicacoes.automaticas" },
        ],
      },
      {
        id: "comunicacoes.email",
        title: "E-mail de envio",
        icon: Mail,
        tone: "info",
        render: () => (
          <div className="grid gap-4">
            <Field id="set-mail-from" label="Remetente" defaultValue="SIGA <geral@escola.com>" />
            <Field id="set-mail-reply" label="Responder para" defaultValue="secretaria@escola.com" />
            <Toggle id="set-mail-gmail" label="Usar Gmail do utilizador" hint="Cada utilizador liga a sua própria conta." defaultChecked />
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },
      {
        id: "comunicacoes.modelos",
        title: "Modelos de mensagem",
        icon: FileText,
        tone: "muted",
        render: () => (
          <div className="space-y-3">
            <Toggle id="set-tpl-mat" label="Confirmação de matrícula" defaultChecked />
            <Toggle id="set-tpl-pag" label="Recibo de pagamento" defaultChecked />
            <Toggle id="set-tpl-div" label="Aviso de dívida" />
            <Toggle id="set-tpl-bol" label="Entrega de boletim" defaultChecked />
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },
      {
        id: "comunicacoes.automaticas",
        title: "Notificações automáticas",
        icon: Bell,
        tone: "primary",
        render: () => (
          <div className="space-y-3">
            <Toggle id="set-auto-3d" label="Lembrete 3 dias antes do vencimento" defaultChecked />
            <Toggle id="set-auto-falta" label="Aviso ao encarregado por falta" defaultChecked />
            <Toggle id="set-auto-nota" label="Publicação de notas" />
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },

      /* ---------------- Integrações ---------------- */
      {
        id: "integracoes",
        title: "Integrações",
        icon: Plug,
        tone: "primary",
        rows: [
          { label: "Gmail (por utilizador)", description: "Envio a partir da conta de cada utilizador", icon: Mail, tone: "destructive", to: "integracoes.gmail" },
          { label: "Base de dados", description: "Backend, políticas e cópias", icon: Database, tone: "success", to: "integracoes.backend" },
          { label: "Webhooks", description: "Eventos enviados para sistemas externos", icon: Webhook, tone: "info", to: "integracoes.webhooks" },
        ],
      },
      {
        id: "integracoes.gmail",
        title: "Gmail (por utilizador)",
        description: "Cada utilizador autoriza a sua conta; o SIGA nunca guarda a palavra-passe.",
        icon: Mail,
        tone: "destructive",
        render: () => (
          <div className="space-y-3">
            <Toggle id="set-gmail-on" label="Permitir ligação de contas Gmail" defaultChecked />
            <Toggle id="set-gmail-thread" label="Agrupar respostas por conversa" defaultChecked />
            <Field id="set-gmail-label" label="Etiqueta aplicada aos envios" defaultValue="SIGA" />
          </div>
        ),
        footer: (nav) => saveFooter("Guardar integração")({ back: nav.back }),
      },
      {
        id: "integracoes.backend",
        title: "Base de dados",
        icon: Database,
        tone: "success",
        render: () => (
          <div className="space-y-3">
            <Toggle id="set-db-rls" label="Segurança por linha (RLS) activa" hint="Cada utilizador só acede aos seus dados." defaultChecked />
            <Toggle id="set-db-backup" label="Cópia de segurança diária" defaultChecked />
            <Field id="set-db-ret" label="Retenção de cópias (dias)" defaultValue="30" />
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },
      {
        id: "integracoes.webhooks",
        title: "Webhooks",
        icon: Webhook,
        tone: "info",
        render: () => (
          <div className="space-y-3">
            <Field id="set-wh-url" label="URL de destino" defaultValue="https://exemplo.com/siga" />
            <Toggle id="set-wh-mat" label="Evento: matrícula criada" defaultChecked />
            <Toggle id="set-wh-pay" label="Evento: pagamento confirmado" defaultChecked />
            <Toggle id="set-wh-doc" label="Evento: documento emitido" />
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },

      /* ---------------- Utilizadores ---------------- */
      {
        id: "utilizadores",
        title: "Utilizadores e permissões",
        icon: Users,
        tone: "destructive",
        rows: [
          { label: "Funções", description: "Administrador, secretaria, professor", icon: UserCog, tone: "primary", to: "utilizadores.funcoes" },
          { label: "Convites", description: "Convidar equipa por e-mail", icon: Mail, tone: "info", to: "utilizadores.convites" },
          { label: "Auditoria de acessos", description: "Sessões e registos de actividade", icon: ShieldCheck, tone: "warning", to: "utilizadores.auditoria" },
        ],
      },
      {
        id: "utilizadores.funcoes",
        title: "Funções",
        icon: UserCog,
        tone: "primary",
        render: () => (
          <div className="space-y-3">
            <Toggle id="set-role-adm" label="Administrador: acesso total" defaultChecked />
            <Toggle id="set-role-sec" label="Secretaria: matrículas e documentos" defaultChecked />
            <Toggle id="set-role-prof" label="Professor: notas das suas turmas" defaultChecked />
            <Toggle id="set-role-fin" label="Financeiro: faturas e pagamentos" />
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },
      {
        id: "utilizadores.convites",
        title: "Convites",
        icon: Mail,
        tone: "info",
        render: () => (
          <div className="grid gap-4">
            <Field id="set-inv-mail" label="E-mail do convidado" type="email" />
            <Field id="set-inv-role" label="Função atribuída" defaultValue="Secretaria" />
            <Toggle id="set-inv-exp" label="Convite expira em 7 dias" defaultChecked />
          </div>
        ),
        footer: (nav) => saveFooter("Enviar convite")({ back: nav.back }),
      },
      {
        id: "utilizadores.auditoria",
        title: "Auditoria de acessos",
        icon: ShieldCheck,
        tone: "warning",
        render: () => (
          <div className="space-y-3">
            <Toggle id="set-aud-log" label="Registar todas as acções administrativas" defaultChecked />
            <Field id="set-aud-ret" label="Retenção de registos (dias)" defaultValue="180" />
            <Toggle id="set-aud-alert" label="Alertar em acesso de novo dispositivo" defaultChecked />
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },

      /* ---------------- Sistema ---------------- */
      {
        id: "sistema",
        title: "Aparência e desempenho",
        icon: Palette,
        tone: "muted",
        rows: [
          { label: "Tema e idioma", description: "Claro/escuro e localização", icon: Languages, tone: "primary", to: "sistema.tema" },
          { label: "Velocidade", description: "Pré-busca de rotas e dados", icon: Gauge, tone: "success", to: "sistema.velocidade" },
          { label: "Modo offline", description: "Cache de recursos críticos", icon: WifiOff, tone: "info", to: "sistema.offline" },
        ],
      },
      {
        id: "sistema.tema",
        title: "Tema e idioma",
        icon: Languages,
        tone: "primary",
        render: () => (
          <div className="space-y-3">
            <Toggle id="set-ui-dark" label="Seguir tema do sistema" defaultChecked />
            <Field id="set-ui-lang" label="Idioma" defaultValue="Português (Angola)" />
            <Field id="set-ui-tz" label="Fuso horário" defaultValue="Africa/Luanda" />
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },
      {
        id: "sistema.velocidade",
        title: "Velocidade",
        description: "Ajustes medidos por Web Vitals (FCP, LCP e INP).",
        icon: Gauge,
        tone: "success",
        render: () => (
          <div className="space-y-3">
            <Toggle id="set-perf-pre" label="Pré-carregar rotas em tempo livre" defaultChecked />
            <Toggle id="set-perf-data" label="Pré-buscar dados dos módulos mais usados" defaultChecked />
            <Toggle id="set-perf-img" label="Pré-carregar imagens acima da dobra" defaultChecked />
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },
      {
        id: "sistema.offline",
        title: "Modo offline",
        icon: WifiOff,
        tone: "info",
        render: () => (
          <div className="space-y-3">
            <Toggle id="set-off-sw" label="Cache de recursos críticos" defaultChecked />
            <Toggle id="set-off-page" label="Página de fallback offline" defaultChecked />
            <Toggle id="set-off-sync" label="Sincronizar ao recuperar ligação" defaultChecked />
          </div>
        ),
        footer: (nav) => saveFooter()({ back: nav.back }),
      },
    ],
    [],
  );
}

export function SettingsCenter({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const panels = useSettingsPanels();
  return (
    <StackedModal
      open={open}
      onOpenChange={onOpenChange}
      panels={panels}
      rootId="root"
      eyebrow="SIGA"
      size="lg"
    />
  );
}
