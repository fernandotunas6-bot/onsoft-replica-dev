import { useRef, useState } from "react";
import {
  Copy,
  Ellipsis,
  KeyRound,
  LockKeyhole,
  Mail,
  MessageCircle,
  Printer,
  UnlockKeyhole,
  UserRound,
  UserX,
} from "lucide-react";
import { whatsappHref } from "@/features/integrations/actions";
import { toast } from "@/lib/toast";
import { reportPossibleStepUp } from "@/lib/step-up";
import { passwordMeetsPolicy, PASSWORD_POLICY_HINT } from "@/lib/password-policy-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModalShell, ModalHeader, ModalContent, ModalFooter } from "@/components/ui/modal-system";
import {
  listSystemAccounts,
  resetStaffPasswordDirect,
  resendSystemInvite,
  sendSystemInviteEmail,
  setSystemAccountDisabled,
} from "@/features/access/server";

type Account = Awaited<ReturnType<typeof listSystemAccounts>>[number];
type Dialog = "profile" | "password" | "remove" | "share" | null;

export function AccountRowActions({
  account,
  whatsappEnabled = false,
  canAdminister,
  onChanged,
  onPrint,
}: {
  account: Account;
  whatsappEnabled?: boolean;
  canAdminister: boolean;
  onChanged: () => Promise<unknown>;
  onPrint: () => Promise<unknown>;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [shareHref, setShareHref] = useState<string | null>(null);
  const close = () => {
    if (busyRef.current) return;
    setDialog(null);
    setPassword("");
    setShareHref(null);
  };
  const notifyError = (error: unknown) => {
    if (reportPossibleStepUp(error)) return;
    toast.error(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
  };
  const execute = async (action: () => Promise<unknown>, success: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await action();
      toast.success(success);
      setDialog(null);
      setPassword("");
    } catch (error) {
      notifyError(error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const lock = async (disabled: boolean) => {
    await execute(
      async () => {
        const result = await setSystemAccountDisabled({
          data: { userId: account.id, disabled },
        });
        try {
          await onChanged();
        } catch {
          toast.warning("O acesso foi actualizado; recarregue a lista para confirmar.");
        }
        if (result.notice) toast.warning(result.notice);
      },
      disabled ? "Acesso suspenso nesta escola." : "Acesso reactivado nesta escola.",
    );
  };
  const sendRecovery = () =>
    execute(async () => {
      await sendSystemInviteEmail({ data: { userId: account.id } });
    }, "E-mail para recuperar o acesso enviado.");
  const copyRecovery = () =>
    execute(async () => {
      const link = await resendSystemInvite({ data: { userId: account.id } });
      await navigator.clipboard.writeText(link.actionLink);
    }, "Ligação de recuperação copiada. Partilhe apenas com o titular.");

  const prepareWhatsApp = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setShareHref(null);
    try {
      const link = await resendSystemInvite({ data: { userId: account.id } });
      setShareHref(whatsappHref("", `Acesso SIGA: ${link.actionLink}`));
      setDialog("share");
    } catch (error) {
      notifyError(error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-9"
            aria-label={`Mais acções para ${account.full_name}`}
            title="Mais acções"
          >
            <Ellipsis className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem onSelect={() => setDialog("profile")}>
            <UserRound className="mr-2 size-4" /> Ver perfil e acesso
          </DropdownMenuItem>
          {account.email && !account.is_self ? (
            <>
              <DropdownMenuItem disabled={busy} onSelect={() => void sendRecovery()}>
                <Mail className="mr-2 size-4" /> Recuperar senha por e-mail
              </DropdownMenuItem>
              {canAdminister ? (
                <>
                  <DropdownMenuItem disabled={busy} onSelect={() => void copyRecovery()}>
                    <Copy className="mr-2 size-4" /> Copiar ligação de recuperação
                  </DropdownMenuItem>
                  {whatsappEnabled ? (
                    <DropdownMenuItem disabled={busy} onSelect={() => void prepareWhatsApp()}>
                      <MessageCircle className="mr-2 size-4" /> Partilhar acesso por WhatsApp
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onSelect={() => setDialog("password")}>
                    <KeyRound className="mr-2 size-4" /> Definir nova senha
                  </DropdownMenuItem>
                </>
              ) : null}
            </>
          ) : null}
          <DropdownMenuItem onSelect={() => void onPrint().catch(notifyError)}>
            <Printer className="mr-2 size-4" /> Imprimir credenciais
          </DropdownMenuItem>
          {canAdminister && !account.is_self ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={busy} onSelect={() => void lock(!account.disabled)}>
                {account.disabled ? (
                  <UnlockKeyhole className="mr-2 size-4" />
                ) : (
                  <LockKeyhole className="mr-2 size-4" />
                )}
                {account.disabled ? "Reactivar acesso" : "Bloquear acesso"}
              </DropdownMenuItem>
              {!account.disabled ? (
                <DropdownMenuItem onSelect={() => setDialog("remove")} className="text-destructive">
                  <UserX className="mr-2 size-4" /> Remover acesso à escola…
                </DropdownMenuItem>
              ) : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ModalShell open={dialog !== null} onOpenChange={(open) => !open && close()} size="sm">
        <ModalHeader
          title={
            dialog === "profile"
              ? "Perfil de acesso"
              : dialog === "share"
                ? "Partilhar acesso por WhatsApp"
                : dialog === "password"
                  ? "Definir nova senha"
                  : "Remover acesso à escola"
          }
          subtitle={account.full_name}
          onClose={close}
          closeDisabled={busy}
        />
        <ModalContent>
          {dialog === "profile" ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Nome</dt>
              <dd className="break-words font-medium">{account.full_name}</dd>
              <dt className="text-muted-foreground">E-mail</dt>
              <dd className="break-all">{account.email ?? "Não indicado"}</dd>
              <dt className="text-muted-foreground">Cargo</dt>
              <dd>{account.cargo}</dd>
              <dt className="text-muted-foreground">Estado</dt>
              <dd>{account.disabled ? "Bloqueado" : "Activo"}</dd>
              <dt className="text-muted-foreground">Último acesso</dt>
              <dd>
                {account.last_sign_in_at
                  ? new Date(account.last_sign_in_at).toLocaleString("pt-AO")
                  : "Nunca entrou"}
              </dd>
              <dt className="text-muted-foreground">E-mail confirmado</dt>
              <dd>{account.email_confirmed ? "Sim" : "Não"}</dd>
            </dl>
          ) : dialog === "share" && shareHref ? (
            <div className="space-y-3 text-sm">
              <p>
                Confirme o contacto de <strong>{account.full_name}</strong> no WhatsApp antes de
                enviar a ligação de acesso.
              </p>
              <Button asChild>
                <a href={shareHref} target="_blank" rel="noopener noreferrer">
                  Abrir WhatsApp
                </a>
              </Button>
              <p className="text-muted-foreground">
                A mensagem fica preparada; só será enviada quando confirmar no WhatsApp.
              </p>
            </div>
          ) : dialog === "password" ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Acção administrativa protegida. Não envie senhas por e-mail ou WhatsApp. Prefira
                «Recuperar senha por e-mail», para o titular definir a sua própria senha.
              </p>
              <Label htmlFor={`new-password-${account.id}`}>Nova senha</Label>
              <Input
                id={`new-password-${account.id}`}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Pelo menos 8 caracteres"
              />
              <p className="text-xs text-muted-foreground">{PASSWORD_POLICY_HINT}</p>
            </div>
          ) : dialog === "remove" ? (
            <div className="space-y-3 text-sm">
              <p>
                Deseja retirar o acesso de <strong>{account.full_name}</strong> a esta escola?
              </p>
              <p className="text-muted-foreground">
                Esta acção suspende o vínculo, sem eliminar a identidade, o histórico escolar nem os
                acessos autorizados noutras escolas. Pode reactivar depois.
              </p>
            </div>
          ) : null}
        </ModalContent>
        <ModalFooter
          cancelLabel="Fechar"
          onCancel={close}
          isSubmitting={busy}
          onSubmit={
            dialog === "profile" || dialog === "share"
              ? undefined
              : dialog === "password"
                ? () =>
                    void execute(async () => {
                      await resetStaffPasswordDirect({
                        data: { userId: account.id, newPassword: password },
                      });
                    }, "Senha redefinida.")
                : () => void lock(true)
          }
          disabled={dialog === "password" && !passwordMeetsPolicy(password)}
          submitLabel={dialog === "password" ? "Confirmar nova senha" : "Suspender acesso"}
          submitVariant={dialog === "remove" ? "destructive" : "default"}
        />
      </ModalShell>
    </>
  );
}
