import { useMemo, useRef, useState, type FormEvent } from "react";
import { MailPlus, Search, UserPlus, Users } from "lucide-react";
import { toast } from "@/lib/toast";
import { reportPossibleStepUp } from "@/lib/step-up";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModalShell, ModalHeader, ModalContent, ModalFooter } from "@/components/ui/modal-system";
import { confirmDiscardChanges } from "@/components/ui/modal-system/confirm-close";
import type { ApplicationRole } from "@/features/auth/access-policy";
import {
  inviteSystemUser,
  listSystemAccounts,
  updateSystemAccountCargo,
} from "@/features/access/server";
import { createPerson } from "@/features/people/server";
import {
  isUnassignedStaffCandidate,
  type CandidateScope,
} from "@/features/access/staff-candidates";

type SystemAccount = Awaited<ReturnType<typeof listSystemAccounts>>[number];
type Mode = "existing" | "invite" | "person";
type StaffRole = Extract<
  ApplicationRole,
  "Administrador" | "Secretaria" | "Tesouraria" | "Professor"
>;

const STAFF_ROLES: StaffRole[] = ["Administrador", "Secretaria", "Tesouraria", "Professor"];
export function AccessOnboardingDialog({
  accounts,
  accountsLoading,
  accountsError,
  secretMissing,
  isAdministrator,
  onChanged,
}: {
  accounts: SystemAccount[];
  accountsLoading: boolean;
  accountsError: boolean;
  secretMissing: boolean;
  isAdministrator: boolean;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("invite");
  const [scope, setScope] = useState<CandidateScope>("unassigned");
  const [query, setQuery] = useState("");
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [staffRole, setStaffRole] = useState<StaffRole>("Professor");
  const [personRole, setPersonRole] = useState("Funcionário");
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false);
  const [dirty, setDirty] = useState(false);
  const availableRoles = isAdministrator
    ? STAFF_ROLES
    : STAFF_ROLES.filter((role) => role !== "Administrador" && role !== "Tesouraria");

  const candidates = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt");
    return accounts
      .filter((account) => isUnassignedStaffCandidate(account, scope))
      .filter(
        (account) =>
          !needle ||
          account.full_name.toLocaleLowerCase("pt").includes(needle) ||
          (account.email ?? "").toLocaleLowerCase("pt").includes(needle),
      )
      .sort((left, right) =>
        left.full_name.localeCompare(right.full_name, "pt", { sensitivity: "base" }),
      );
  }, [accounts, query, scope]);
  const selected = accounts.find((account) => account.id === accountId);
  const eligibleSelected = candidates.some((account) => account.id === accountId);
  const needsAccountData = mode !== "person";
  const canSubmit =
    !busy &&
    (!needsAccountData || !secretMissing) &&
    (mode !== "existing" || (!accountsError && eligibleSelected)) &&
    (mode === "existing" || name.trim().length >= 2) &&
    (mode !== "invite" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));

  const closeDialog = () => {
    if (confirmDiscardChanges(dirty)) setOpen(false);
  };

  const openDialog = () => {
    setMode("invite");
    setScope("unassigned");
    setQuery("");
    setAccountId("");
    setName("");
    setEmail("");
    setPhone("");
    setStaffRole("Professor");
    setPersonRole("Funcionário");
    setDirty(false);
    setOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || inflight.current) return;
    if (mode === "existing" && selected && ["Aluno", "Encarregado"].includes(selected.cargo)) {
      if (
        !window.confirm(
          "Esta conta tem acesso como aluno ou encarregado. A mudança de cargo substitui o papel actual nesta escola. Confirma?",
        )
      ) {
        return;
      }
    }

    inflight.current = true;
    setBusy(true);
    try {
      if (mode === "existing") {
        await updateSystemAccountCargo({
          data: { userId: accountId, cargo: staffRole },
        });
        toast.success("Cargo atribuído à conta existente.");
      } else if (mode === "invite") {
        const result = await inviteSystemUser({
          data: { fullName: name.trim(), email: email.trim(), cargo: staffRole },
        });
        if (result.inviteDelivered) {
          toast.success("Funcionário convidado", {
            description: "Foi enviado um e-mail para definir a senha de acesso.",
          });
        } else {
          toast.warning("Conta criada, mas o convite não foi entregue", {
            description:
              result.inviteDeliveryError ??
              "Reenvie o e-mail de acesso a partir da tabela de contas.",
          });
        }
      } else {
        const roleMap: Record<string, "professor" | "funcionario" | "diretor" | "coordenador"> = {
          Professor: "professor",
          Funcionário: "funcionario",
          Director: "diretor",
          Coordenador: "coordenador",
        };
        await createPerson({
          data: {
            person: {
              full_name: name.trim(),
              email: email.trim() || undefined,
              phone_primary: phone.trim() || undefined,
            },
            roles: [roleMap[personRole] ?? "funcionario"],
            documents: [],
            relationships: [],
          },
        });
        toast.success("Pessoa adicionada ao registo escolar.");
      }
      try {
        await onChanged();
      } catch {
        toast.warning("O registo foi guardado, mas não foi possível actualizar a lista. Recarregue a página.");
      }
      setDirty(false);
      setOpen(false);
    } catch (error) {
      if (!reportPossibleStepUp(error)) {
        toast.error("Não foi possível concluir", {
          description: error instanceof Error ? error.message : "Tente novamente.",
        });
      }
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" className="gap-2" onClick={openDialog}>
        <UserPlus className="size-4" /> Adicionar
      </Button>
      <ModalShell open={open} onOpenChange={setOpen} size="lg" hasUnsavedChanges={dirty}>
        <ModalHeader
          title="Adicionar à equipa"
          subtitle="Escolha uma conta da escola, convide um funcionário ou registe uma pessoa sem login."
          onClose={closeDialog}
        />
        <ModalContent className="space-y-3">
          <div
            role="tablist"
            aria-label="Forma de adicionar"
            className="grid grid-cols-1 gap-1 rounded-lg bg-muted/50 p-1 sm:grid-cols-3"
          >
            {(
              [
                ["existing", "Conta existente", Users],
                ["invite", "Convidar", MailPlus],
                ["person", "Sem login", UserPlus],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                className={
                  mode === key
                    ? "flex min-h-10 items-center justify-center gap-2 rounded-md bg-background px-2 text-xs font-semibold shadow-xs"
                    : "flex min-h-10 items-center justify-center gap-2 rounded-md px-2 text-xs text-muted-foreground hover:bg-background/60"
                }
                onClick={() => setMode(key)}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>

          <form id="access-add-form" className="space-y-3" onSubmit={(event) => void submit(event)}>
            {mode === "existing" ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Só aparecem contas da escola seleccionada sem função de funcionário. Quem já tem
                  um cargo de funcionário não aparece nesta lista.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="access-candidate-scope">Mostrar</Label>
                    <select
                      id="access-candidate-scope"
                      value={scope}
                      onChange={(event) => {
                        setScope(event.target.value as CandidateScope);
                        setAccountId("");
                      }}
                      className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="unassigned">Sem cargo atribuído</option>
                      <option value="without_staff">Sem cargo de funcionário</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="access-candidate-query">Pesquisar utilizador</Label>
                    <div className="relative mt-1">
                      <Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
                      <Input
                        id="access-candidate-query"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Nome ou e-mail…"
                        className="pl-9"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <Label htmlFor="access-candidate">
                    Utilizador disponível ({candidates.length})
                  </Label>
                  <select
                    id="access-candidate"
                    value={eligibleSelected ? accountId : ""}
                    onChange={(event) => {
                      setAccountId(event.target.value);
                      setDirty(true);
                    }}
                    className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                    required
                    disabled={accountsError || accountsLoading || candidates.length === 0}
                  >
                    <option value="">Seleccione uma conta…</option>
                    {candidates.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.full_name} — {account.email || "Sem e-mail"} ({" "}
                        {account.cargo || "Sem cargo"})
                      </option>
                    ))}
                  </select>
                  {accountsError ? (
                    <p role="alert" className="mt-1 text-xs text-destructive">
                      Não foi possível consultar as contas da escola.
                    </p>
                  ) : !accountsLoading && candidates.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Nenhuma conta elegível. Use «Convidar» para adicionar uma nova.
                    </p>
                  ) : null}
                </div>
                {selected && ["Aluno", "Encarregado"].includes(selected.cargo) ? (
                  <p className="text-xs text-warning">
                    Esta conta já tem acesso ao portal. Alterar o cargo substituirá o papel actual
                    nesta escola.
                  </p>
                ) : null}
              </>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="access-add-name">Nome completo</Label>
                  <Input
                    id="access-add-name"
                    required
                    minLength={2}
                    maxLength={160}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setDirty(true);
                    }}
                    placeholder="Ex.: Maria António"
                    className="mt-1"
                  />
                </div>
                <div className={mode === "invite" ? "sm:col-span-2" : undefined}>
                  <Label htmlFor="access-add-email">
                    E-mail {mode === "person" ? "(opcional)" : "do funcionário"}
                  </Label>
                  <Input
                    id="access-add-email"
                    required={mode === "invite"}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setDirty(true);
                    }}
                    placeholder="nome@escola.ao"
                    className="mt-1"
                  />
                </div>
                {mode === "person" ? (
                  <div>
                    <Label htmlFor="access-add-phone">Telefone (opcional)</Label>
                    <Input
                      id="access-add-phone"
                      type="tel"
                      value={phone}
                      onChange={(event) => {
                        setPhone(event.target.value);
                        setDirty(true);
                      }}
                      placeholder="+244 9XX XXX XXX"
                      className="mt-1"
                    />
                  </div>
                ) : null}
              </div>
            )}
            <div>
              <Label htmlFor="access-add-role">
                {mode === "person" ? "Papel escolar" : "Cargo a atribuir"}
              </Label>
              {mode === "person" ? (
                <select
                  id="access-add-role"
                  value={personRole}
                  onChange={(event) => {
                    setPersonRole(event.target.value);
                    setDirty(true);
                  }}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {["Funcionário", "Professor", "Director", "Coordenador"].map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              ) : (
                <select
                  id="access-add-role"
                  value={staffRole}
                  onChange={(event) => {
                    setStaffRole(event.target.value as StaffRole);
                    setDirty(true);
                  }}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {availableRoles.map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              )}
            </div>
            {mode === "invite" ? (
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Senha e envio do convite</p>
                <p className="mt-1">
                  O novo funcionário recebe um e-mail com ligação privada para criar a própria
                  senha. Por segurança, nenhuma senha é enviada ou guardada neste formulário.
                </p>
                <p className="mt-1">Antes de enviar, confirme o endereço de e-mail e o cargo.</p>
              </div>
            ) : mode === "person" ? (
              <p className="text-xs text-muted-foreground">
                Este registo não cria uma conta de login. Para dar acesso ao sistema, use
                «Convidar».
              </p>
            ) : null}
            {secretMissing && mode !== "person" ? (
              <p role="alert" className="text-xs text-destructive">
                A gestão de contas está indisponível neste ambiente. O registo sem login continua
                disponível.
              </p>
            ) : null}
          </form>
        </ModalContent>
        <ModalFooter
          onCancel={closeDialog}
          onSubmit={(event) => void submit(event)}
          disabled={!canSubmit}
          isSubmitting={busy}
          submitLabel={
            mode === "invite"
              ? "Criar e enviar convite"
              : mode === "existing"
                ? "Atribuir cargo"
                : "Adicionar pessoa"
          }
        />
      </ModalShell>
    </>
  );
}
