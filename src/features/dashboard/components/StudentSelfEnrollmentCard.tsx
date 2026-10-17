import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { enrollMyUnits, getMyEnrollmentOffer } from "@/features/higher-ed/server";
import { toastActionError } from "@/lib/action-error-toast";

const OFFER_KEY = ["dashboard", "student-enrollment-offer"] as const;

/**
 * Matrícula on-line do Ensino Superior: o estudante escolhe as cadeiras do ano
 * activo. Só aparece quando a escola a abriu no regulamento; o servidor repete
 * todas as verificações (período, dívida, precedências, créditos).
 */
export function StudentSelfEnrollmentCard() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: OFFER_KEY,
    queryFn: () => getMyEnrollmentOffer(),
    staleTime: 60 * 1000,
  });
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const enroll = useMutation({
    mutationFn: (input: { programId: string; unitIds: string[] }) => enrollMyUnits({ data: input }),
    onSuccess: (result, input) => {
      toast.success(`Inscrito em ${result.enrolled} cadeira(s).`);
      setSelected((current) => ({ ...current, [input.programId]: [] }));
      void queryClient.invalidateQueries({ queryKey: OFFER_KEY });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "student-higher-ed"] });
    },
    onError: (error) => toastActionError(error, "Não foi possível fazer a inscrição."),
  });

  const data = query.data;
  if (!data?.enabled) return null;

  return (
    <>
      {data.offers.map(({ program, units, creditsThisYear }) => {
        const chosen = selected[program.id] ?? [];
        const chosenCredits = units
          .filter((unit) => chosen.includes(unit.id))
          .reduce((sum, unit) => sum + unit.credits, 0);
        const total = creditsThisYear + chosenCredits;
        const overLimit = total > data.limits.perYear;
        const open = units.filter((unit) => unit.state !== "inscrita");
        const toggle = (unitId: string, on: boolean) =>
          setSelected((current) => {
            const list = current[program.id] ?? [];
            return {
              ...current,
              [program.id]: on ? [...list, unitId] : list.filter((id) => id !== unitId),
            };
          });
        return (
          <section key={program.id} className="surface-card w-full min-w-0 space-y-4 p-5">
            <div className="space-y-1">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <ClipboardCheck className="size-4 text-muted-foreground" aria-hidden />
                Inscrição em cadeiras · {program.name}
              </h2>
              <p className="text-xs text-muted-foreground">
                {creditsThisYear} créditos já inscritos neste ano · máximo {data.limits.perYear} por
                ano e {data.limits.perSemester} por semestre
                {data.closesOn ? ` · inscrições até ${data.closesOn}` : ""}
              </p>
            </div>
            {data.blocked.length ? (
              <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                {data.blocked.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}
            {open.length ? (
              <ul className="divide-y rounded-md border">
                {open.map((unit) => {
                  const disabled = unit.state !== "disponivel" || data.blocked.length > 0;
                  return (
                    <li key={unit.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                      <Checkbox
                        id={`self-${unit.id}`}
                        className="mt-0.5"
                        checked={chosen.includes(unit.id)}
                        disabled={disabled}
                        onCheckedChange={(value) => toggle(unit.id, value === true)}
                      />
                      <label htmlFor={`self-${unit.id}`} className="min-w-0 flex-1">
                        <span>{unit.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {unit.semester}.º semestre · {unit.credits} créditos
                        </span>
                        {unit.reasons.length ? (
                          <span className="block text-xs text-muted-foreground">
                            {unit.reasons.join(" ")}
                          </span>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Não há cadeiras por escolher neste ano.
              </p>
            )}
            {units.some((unit) => unit.state === "inscrita") ? (
              <p className="text-xs text-muted-foreground">
                Já inscrito:{" "}
                {units
                  .filter((unit) => unit.state === "inscrita")
                  .map((unit) => unit.name)
                  .join(", ")}
                . Para anular, fale com a secretaria.
              </p>
            ) : null}
            {open.length ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  disabled={!chosen.length || overLimit || enroll.isPending}
                  onClick={() => enroll.mutate({ programId: program.id, unitIds: chosen })}
                >
                  {enroll.isPending ? "A inscrever…" : `Inscrever (${chosenCredits} créditos)`}
                </Button>
                {overLimit ? (
                  <span className="text-xs text-destructive">
                    {total} créditos ultrapassam o máximo de {data.limits.perYear} por ano.
                  </span>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </>
  );
}
