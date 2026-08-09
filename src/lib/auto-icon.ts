import type { ElementType } from "react";
import {
  Activity,
  BadgeCheck,
  Banknote,
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  GraduationCap,
  Layers,
  Mail,
  Percent,
  Receipt,
  Settings,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import type { ChipTone } from "@/components/ui/icon-chip";

/**
 * Keyword → icon/tone inference so every module gets Minimals-style icon chips
 * without changing any module content or colours (tones map to existing tokens).
 */
const rules: { match: RegExp; icon: ElementType; tone: ChipTone }[] = [
  { match: /estudante|aluno|matricul/i, icon: GraduationCap, tone: "primary" },
  { match: /utilizador|usuário|usuario|user|acesso|perfil/i, icon: Users, tone: "info" },
  { match: /permiss|segur|senha|password/i, icon: ShieldCheck, tone: "warning" },
  { match: /turma|classe|sala/i, icon: Layers, tone: "info" },
  { match: /disciplina|curso|pedag/i, icon: BookOpen, tone: "primary" },
  { match: /nota|média|media|aproveit/i, icon: Percent, tone: "success" },
  { match: /horár|horar|período|periodo|hora/i, icon: Clock, tone: "info" },
  { match: /calend|ano|mês|mes\b|data/i, icon: CalendarDays, tone: "muted" },
  { match: /fatura|recibo/i, icon: Receipt, tone: "warning" },
  { match: /pagamento|cobran|pago/i, icon: CreditCard, tone: "success" },
  { match: /caixa|saldo|entrada|receita/i, icon: Wallet, tone: "success" },
  { match: /despesa|saída|saida|dívida|divida|pendente/i, icon: Banknote, tone: "destructive" },
  { match: /relatór|relator|estatíst|estatist|gráfic|grafic/i, icon: BarChart3, tone: "primary" },
  { match: /crescim|tend|evolu/i, icon: TrendingUp, tone: "success" },
  { match: /documento|declara|certific|ficheiro/i, icon: FileText, tone: "info" },
  { match: /comunica|mensagem|email|e-mail|gmail/i, icon: Mail, tone: "primary" },
  { match: /config|ajuste|integra/i, icon: Settings, tone: "muted" },
  { match: /aprovad|conclu|activo|ativo|válid|valid/i, icon: BadgeCheck, tone: "success" },
  { match: /lista|registo|registro|tarefa/i, icon: ClipboardList, tone: "muted" },
];

export function inferIcon(label: string): { icon: ElementType; tone: ChipTone } {
  for (const rule of rules) {
    if (rule.match.test(label)) return { icon: rule.icon, tone: rule.tone };
  }
  return { icon: Activity, tone: "primary" };
}
