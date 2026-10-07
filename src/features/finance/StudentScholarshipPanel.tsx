import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Award } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastActionError } from "@/lib/action-error-toast";
import { schoolTodayIso } from "@/lib/school-date";
import {
  getStudentScholarships,
  grantScholarship,
  revokeScholarship,
} from "./student-scholarship-server";
import { SCHOLARSHIP_KINDS, scholarshipKindLabel, type ScholarshipKind } from "./scholarships";

/**
 * Bolsa de estudo do aluno (ficha do aluno). A Secretaria vê; a Administração e a
 * Tesouraria concedem e revogam (2FA). O desconto entra nas faturas emitidas a seguir:
 * o maior entre o de irmãos e o da bolsa.
 */
export function StudentScholarshipPanel({ studentId }: { studentId: string }) {
  const query = useQuery({
    queryKey: ["finance", "scholarships", studentId],
    queryFn: () => getStudentScholarships({ data: { studentId } }),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    kind: "merit" as ScholarshipKind,
    percent: "",
    scope: "tuition" as "tuition" | "all",
    sponsor: "",
    validFrom: schoolTodayIso(),
    validUntil: "",
    evidence: "",
  });
  const refresh = async () => {
    setOpen(false);
    await query.refetch();
  };
  const grant = useMutation({
    mutationFn: () =>
      grantScholarship({
        data: {
          studentId,
          kind: form.kind,
          percent: Number(form.percent),
          scope: form.scope,
          sponsor: form.sponsor,
          validFrom: form.validFrom,
          validUntil: form.validUntil || null,
          evidenceNote: form.evidence,
        },
      }),
    onSuccess: async () => {
      toast.success("Bolsa concedida.", {
        description: "O desconto entra nas próximas faturas emitidas.",
      });
      await refresh();
    },
    onError: (error) => toastActionError(error, "Não foi possível conceder a bolsa."),
  });
  const revoke = useMutation({
    mutationFn: (scholarshipId: string) =>
      revokeScholarship({ data: { scholarshipId, reason: "Bolsa terminada pela escola." } }),
    onSuccess: async () => {
      toast.success("Bolsa revogada.");
      await refresh();
    },
    onError: (error) => toastActionError(error, "Não foi possível revogar a bolsa."),
  });

  if (!query.data?.available) return null;
  const current = query.data.rows.find((row) => !row.revoked_at) ?? null;
  const percent = Number(form.percent);
  const valid = percent > 0 && percent <= 100 && form.validFrom && form.evidence.trim().length >= 3;

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-base font-bold">
          <Award className="size-4 text-muted-foreground" aria-hidden /> Bolsa de estudo
        </h2>
        {query.data.canWrite ? (
          current ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => revoke.mutate(current.id)}
              disabled={revoke.isPending}
            >
              Revogar bolsa
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setOpen((value) => !value)}>
              Conceder bolsa
            </Button>
          )
        ) : null}
      </div>
      {current ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={current.inForce ? "secondary" : "outline"}>
            {current.inForce ? "Em vigor" : "Fora do período"}
          </Badge>
          <span className="font-semibold">{current.percent}%</span>
          <span className="text-muted-foreground">
            {scholarshipKindLabel(current.kind)} ·{" "}
            {current.scope === "all" ? "todas as taxas" : "só propinas"} · desde{" "}
            {current.valid_from}
            {current.valid_until ? ` até ${current.valid_until}` : ""}
            {current.sponsor ? ` · ${current.sponsor}` : ""}
          </span>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Sem bolsa.</p>
      )}
      {open && !current ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sch-kind">Tipo</Label>
            <select
              id="sch-kind"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={form.kind}
              onChange={(event) =>
                setForm({ ...form, kind: event.target.value as ScholarshipKind })
              }
            >
              {SCHOLARSHIP_KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sch-percent">Desconto (%)</Label>
            <Input
              id="sch-percent"
              type="number"
              min={1}
              max={100}
              step={0.01}
              value={form.percent}
              onChange={(event) => setForm({ ...form, percent: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sch-scope">Aplica-se a</Label>
            <select
              id="sch-scope"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={form.scope}
              onChange={(event) =>
                setForm({ ...form, scope: event.target.value as "tuition" | "all" })
              }
            >
              <option value="tuition">Só propinas</option>
              <option value="all">Todas as taxas</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sch-sponsor">Entidade financiadora (opcional)</Label>
            <Input
              id="sch-sponsor"
              value={form.sponsor}
              maxLength={200}
              onChange={(event) => setForm({ ...form, sponsor: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sch-from">Início</Label>
            <Input
              id="sch-from"
              type="date"
              value={form.validFrom}
              onChange={(event) => setForm({ ...form, validFrom: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sch-until">Fim (opcional)</Label>
            <Input
              id="sch-until"
              type="date"
              value={form.validUntil}
              onChange={(event) => setForm({ ...form, validUntil: event.target.value })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sch-evidence">Prova</Label>
            <Input
              id="sch-evidence"
              value={form.evidence}
              maxLength={1000}
              placeholder="Ex.: acta do conselho de direcção n.º 12/2026"
              onChange={(event) => setForm({ ...form, evidence: event.target.value })}
            />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            O desconto entra nas faturas emitidas a partir de agora. Com desconto de irmãos, fica o
            maior dos dois (não se somam).
          </p>
          <div className="sm:col-span-2">
            <Button size="sm" onClick={() => grant.mutate()} disabled={!valid || grant.isPending}>
              {grant.isPending ? "A conceder…" : "Conceder bolsa"}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
