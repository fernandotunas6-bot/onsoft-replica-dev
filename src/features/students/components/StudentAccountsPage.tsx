import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Printer, ShieldCheck, UserCheck, UserPlus, Users, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";
import { InlineLoading } from "@/components/ui/inline-loading";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { publicErrorMessage } from "@/lib/public-error";
import { cn } from "@/lib/utils";
import { setStudentNumberLogin } from "@/features/access/student-access-server";
import { ACCOUNTS_BATCH } from "@/features/students/student-accounts";
import {
  createStudentAccounts,
  listStudentAccounts,
  resetStudentPassword,
  type IssuedCredential,
} from "@/features/students/student-accounts-server";

/**
 * Pessoas → Acessos dos alunos: criar as contas de uma turma, imprimir as fichas
 * com a senha provisória e dar nova senha a quem a esqueceu. As senhas só
 * existem neste ecrã, uma vez: o servidor não as guarda.
 */
export function StudentAccountsView() {
  const queryClient = useQueryClient();
  const queryKey = ["student-accounts"];
  const [classId, setClassId] = useState("");
  const [search, setSearch] = useState("");
  const [issued, setIssued] = useState<Array<IssuedCredential & { classLabel: string }>>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const query = useQuery({ queryKey, queryFn: () => listStudentAccounts() });
  const data = query.data;

  const classes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const student of data?.students ?? []) seen.set(student.classGroupId, student.classLabel);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt", { numeric: true }));
  }, [data]);
  const term = search.trim().toLowerCase();
  const shown = (data?.students ?? []).filter(
    (student) =>
      (!classId || student.classGroupId === classId) &&
      (!term ||
        student.name.toLowerCase().includes(term) ||
        student.studentNumber.includes(term)),
  );
  const missing = shown.filter((student) => !student.hasAccount);
  const labelOf = new Map((data?.students ?? []).map((s) => [s.studentId, s.classLabel]));

  const create = useMutation({
    mutationFn: async () => {
      const ids = missing.map((student) => student.studentId);
      const done: Array<IssuedCredential & { classLabel: string }> = [];
      const failed: string[] = [];
      // Em lotes: cada conta são várias escritas, e o pedido tem limite.
      for (let i = 0; i < ids.length; i += ACCOUNTS_BATCH) {
        setProgress(`A criar contas… ${Math.min(i + ACCOUNTS_BATCH, ids.length)} de ${ids.length}`);
        const result = await createStudentAccounts({
          data: { studentIds: ids.slice(i, i + ACCOUNTS_BATCH) },
        });
        done.push(
          ...result.issued.map((item) => ({
            ...item,
            classLabel: labelOf.get(item.studentId) ?? "",
          })),
        );
        failed.push(...result.failed.map((item) => `${item.name}: ${item.message}`));
      }
      return { done, failed };
    },
    onSuccess: ({ done, failed }) => {
      setIssued((current) => [...current, ...done]);
      if (failed.length) toast.error(`${failed.length} conta(s) por criar. ${failed[0]}`);
      if (done.length) toast.success(`${done.length} conta(s) criadas. Imprima as fichas agora.`);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(publicErrorMessage(error, "Não foi possível criar as contas.")),
    onSettled: () => setProgress(null),
  });
  const reset = useMutation({
    mutationFn: (studentId: string) => resetStudentPassword({ data: { studentId } }),
    onSuccess: (credential) => {
      setIssued((current) => [
        ...current.filter((item) => item.studentId !== credential.studentId),
        { ...credential, classLabel: labelOf.get(credential.studentId) ?? "" },
      ]);
      toast.success(`Nova senha para ${credential.name}. Imprima a ficha.`);
    },
    onError: (error) => toast.error(publicErrorMessage(error, "Não foi possível dar nova senha.")),
  });
  const numberLogin = useMutation({
    mutationFn: (enabled: boolean) => setStudentNumberLogin({ data: { enabled } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
    onError: (error) => toast.error(publicErrorMessage(error, "Não foi possível mudar.")),
  });

  if (query.isLoading) return <InlineLoading label="A carregar os alunos…" />;
  if (query.isError || !data) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {publicErrorMessage(query.error, "Não foi possível carregar os alunos.")}
      </p>
    );
  }
  const total = data.students.length;
  const withAccount = data.students.filter((student) => student.hasAccount).length;
  const portal = typeof window !== "undefined" ? window.location.host : "";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:hidden">
        {[
          { icon: Users, tone: "primary" as const, label: "Alunos do ano", value: total },
          { icon: UserCheck, tone: "success" as const, label: "Com conta", value: withAccount },
          { icon: UserX, tone: "warning" as const, label: "Sem conta", value: total - withAccount },
        ].map((tile) => (
          <div key={tile.label} className="flex items-center gap-3 rounded-xl border bg-card p-3">
            <IconChip icon={tile.icon} tone={tile.tone} size="sm" />
            <div>
              <p className="text-base font-semibold tabular-nums leading-tight">{tile.value}</p>
              <p className="text-[11px] text-muted-foreground">{tile.label}</p>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <IconChip
            icon={ShieldCheck}
            tone={data.numberLoginEnabled ? "success" : "muted"}
            size="sm"
          />
          <div className="min-w-0">
            <p className="text-xs font-medium leading-tight">
              Entrar com o nº de aluno: {data.numberLoginEnabled ? "ligado" : "desligado"}
            </p>
            {data.isAdministrator ? (
              <button
                type="button"
                className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-50"
                disabled={numberLogin.isPending}
                onClick={() => numberLogin.mutate(!data.numberLoginEnabled)}
              >
                {data.numberLoginEnabled ? "Desligar" : "Ligar"}
              </button>
            ) : (
              <p className="text-[11px] text-muted-foreground">Decide o Administrador.</p>
            )}
          </div>
        </div>
      </div>

      {!data.numberLoginEnabled ? (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm print:hidden">
          Com «Entrar com o nº de aluno» desligado, os alunos só entram pelo BI — e a maioria não o
          tem registado. Ligue-o antes de entregar as fichas.
        </p>
      ) : null}

      <section className="space-y-3 print:hidden" aria-labelledby="alunos-contas">
        <div className="flex flex-wrap items-end gap-2">
          <h2 id="alunos-contas" className="mr-auto text-sm font-semibold">
            Alunos {data.yearName ? `· ${data.yearName}` : ""}
          </h2>
          <select
            aria-label="Turma"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
          >
            <option value="">Todas as turmas</option>
            {classes.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <Input
            aria-label="Procurar aluno"
            placeholder="Nome ou nº de aluno"
            className="h-10 w-48"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button
            type="button"
            className="gap-2"
            disabled={!missing.length || create.isPending}
            onClick={() => create.mutate()}
          >
            <UserPlus className="size-4" aria-hidden />
            {progress ?? `Criar contas em falta (${missing.length})`}
          </Button>
        </div>
        <div className="w-0 min-w-full overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-normal">Nome</th>
                <th className="px-3 py-2 font-normal">ID do aluno</th>
                <th className="px-3 py-2 font-normal">Turma</th>
                <th className="px-3 py-2 font-normal">Conta</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((student) => (
                <tr key={student.studentId}>
                  <td className="px-3 py-2">{student.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{student.studentNumber || "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{student.classLabel}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        student.hasAccount
                          ? "bg-success/10 text-success-strong"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {student.hasAccount ? "Activa" : "Sem conta"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {student.hasAccount ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-xs"
                        disabled={reset.isPending}
                        onClick={() => reset.mutate(student.studentId)}
                      >
                        <KeyRound className="size-3.5" aria-hidden /> Nova senha
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!shown.length ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    Nenhum aluno neste filtro.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {issued.length ? (
        <section className="space-y-3" aria-labelledby="fichas-acesso">
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <h2 id="fichas-acesso" className="mr-auto text-sm font-semibold">
              Fichas de acesso ({issued.length})
            </h2>
            <Button type="button" variant="outline" className="gap-2" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden /> Imprimir fichas
            </Button>
          </div>
          <p className="text-xs text-muted-foreground print:hidden">
            As senhas só aparecem agora: imprima antes de sair desta página. No primeiro acesso, o
            aluno escolhe a sua senha.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 print:grid-cols-2" aria-label="Fichas de acesso">
            {issued.map((credential) => (
              <li
                key={credential.studentId}
                className="break-inside-avoid space-y-1.5 rounded-xl border border-dashed p-4 text-sm"
              >
                <p className="font-semibold">{credential.name}</p>
                <p className="text-xs text-muted-foreground">{credential.classLabel}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pt-1">
                  <dt className="text-muted-foreground">Endereço</dt>
                  <dd className="font-mono text-xs">{portal}</dd>
                  <dt className="text-muted-foreground">Nº de aluno</dt>
                  <dd className="font-mono">{credential.studentNumber}</dd>
                  <dt className="text-muted-foreground">Senha provisória</dt>
                  <dd className="font-mono font-semibold tracking-wide">{credential.password}</dd>
                </dl>
                <p className="pt-1 text-[11px] text-muted-foreground">
                  No primeiro acesso escolhe a tua senha. Não partilhes estes dados.
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
