import { toast as sonnerToast, type ExternalToast } from "sonner";
import { formatMutationError } from "@/lib/format-error";
import { isTechnicalMessage } from "@/lib/public-error";
import { isTauriDesktop, notifyNative } from "@/lib/desktop-utils";
import { openSettingsPanel, requestSettingsOpen } from "@/lib/settings-deep-link";
import {
  guidanceActionPath,
  guidanceFixFor,
  guidanceFor,
  type Guidance,
  type GuidanceAction,
} from "@/lib/error-guidance";

/**
 * O `toast` do SIGA. Todo o sistema importa daqui, não de `sonner` (regra de
 * lint em `eslint.config.js`), para que **cada** `toast.error` saia com:
 *   - uma mensagem legível (JSON do zod e erros de SQL/rede nunca aparecem);
 *   - a forma certa de fazer, em `description`;
 *   - um botão para o sítio onde se corrige, quando a pessoa lá pode ir;
 *   - na app desktop em segundo plano, também a notificação do sistema.
 *
 * As regras de cada caso estão em `error-guidance.ts`. Um aviso que já traga
 * `action` próprio, ou `guidance: false`, não é alterado.
 */

export type ErrorToastOptions = ExternalToast & {
  /** `false` mostra a mensagem tal como está, sem correcção nem botão. */
  guidance?: boolean;
};

type Navigate = (action: Extract<GuidanceAction, { kind: "route" }>) => void;
type CanOpen = (path: string) => boolean;

let navigateTo: Navigate | null = null;
let canOpenPath: CanOpen | null = null;

/**
 * Ligação ao router e às permissões da conta. Registada pelo `AppShell`; sem
 * ela (páginas públicas, ecrã de entrada) os avisos não oferecem destinos
 * internos — quem não entrou não tem onde os abrir.
 */
export function registerErrorGuidance(bridge: { navigate: Navigate; canOpen: CanOpen }) {
  navigateTo = bridge.navigate;
  canOpenPath = bridge.canOpen;
  return () => {
    if (navigateTo === bridge.navigate) navigateTo = null;
    if (canOpenPath === bridge.canOpen) canOpenPath = null;
  };
}

/** Abre o destino de uma correcção: painel de Definições ou ecrã. */
export function runGuidanceAction(action: GuidanceAction) {
  if (action.kind === "settings") {
    // Com o AppShell montado o painel abre por cima do ecrã actual; sem ele,
    // `/configuracoes` guarda o pedido e abre-o no painel inicial.
    if (openSettingsPanel(action.panel)) return;
    requestSettingsOpen(action.panel);
    window.location.assign(`/configuracoes?painel=${encodeURIComponent(action.panel)}`);
    return;
  }
  if (navigateTo) {
    navigateTo(action);
    return;
  }
  const query = action.search ? `?${new URLSearchParams(action.search).toString()}` : "";
  window.location.assign(`${action.to}${query}`);
}

/**
 * A conta pode abrir o destino? Para configuração exige também acesso às
 * Definições: um professor vê o Calendário mas não cria o ano lectivo, e um
 * botão que leva a um ecrã onde nada se pode fazer só confunde.
 */
function canOpen(guidance: Guidance) {
  if (!canOpenPath || !guidance.action) return false;
  if (!canOpenPath(guidanceActionPath(guidance.action))) return false;
  return guidance.kind !== "config" || canOpenPath("/configuracoes");
}

const GENERIC_TECHNICAL: Guidance = {
  id: "generic.technical",
  kind: "unavailable",
  title: "Não foi possível concluir a operação",
  fix: "Tente outra vez. Se voltar a falhar, abra Configurações → Diagnóstico e envie o relatório ao suporte.",
  action: { kind: "route", to: "/configuracoes/diagnostico", label: "Abrir diagnóstico" },
};

/** Texto final de um erro de string: zod em JSON passa a frase por campo. */
function readable(message: string) {
  return formatMutationError(new Error(message), message).trim();
}

export type GuidedError = {
  title: string;
  description?: string;
  action?: GuidanceAction;
  /** Deduplicação: o mesmo problema repetido substitui o aviso, não empilha. */
  id: string;
};

/**
 * Decide título, correcção e destino de uma mensagem de erro. Exportada para
 * o `RouteErrorScreen` e os testes; os avisos usam-na via `toast.error`.
 */
export function describeError(message: string): GuidedError {
  const text = readable(message);
  const guidance = guidanceFor(text) ?? (isTechnicalMessage(text) ? GENERIC_TECHNICAL : null);
  if (!guidance) return { title: text, id: `erro:${text}` };
  const allowed = canOpen(guidance);
  return {
    title: guidance.title ?? text,
    description: guidanceFixFor(guidance, allowed),
    action: allowed ? guidance.action : undefined,
    id: `erro:${guidance.id}:${guidance.title ?? text}`,
  };
}

function notifyDesktopInBackground(title: string, body?: string) {
  if (typeof document === "undefined" || !document.hidden || !isTauriDesktop()) return;
  void notifyNative(title, body);
}

function guidedError(
  message: Parameters<typeof sonnerToast.error>[0],
  options?: ErrorToastOptions,
) {
  const { guidance = true, ...rest } = options ?? {};
  if (typeof message !== "string") return sonnerToast.error(message, rest);
  if (!guidance || rest.action) {
    return sonnerToast.error(readable(message), rest);
  }
  const guided = describeError(message);
  if (isTechnicalMessage(message)) console.warn("[SIGA] erro técnico:", message);
  const description = rest.description ?? guided.description;
  notifyDesktopInBackground(
    guided.title,
    typeof description === "string" ? description : undefined,
  );
  const target = guided.action;
  return sonnerToast.error(guided.title, {
    id: guided.id,
    // Com correcção há mais para ler; quem usa leitor de ecrã também precisa.
    duration: guided.description ? 12_000 : undefined,
    ...rest,
    description,
    action: target ? { label: target.label, onClick: () => runGuidanceAction(target) } : undefined,
  });
}

/** O `toast` do sonner, com `error` orientado. */
export const toast: Omit<typeof sonnerToast, "error"> &
  ((...args: Parameters<typeof sonnerToast>) => ReturnType<typeof sonnerToast>) & {
    error: typeof guidedError;
  } = Object.assign(
  (...args: Parameters<typeof sonnerToast>) => sonnerToast(...args),
  sonnerToast,
  { error: guidedError },
);
