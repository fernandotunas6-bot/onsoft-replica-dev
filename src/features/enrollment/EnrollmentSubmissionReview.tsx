import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const labels: Record<string, string> = {
  full_name: "Nome completo",
  desired_program: "Curso pretendido",
  birth_date: "Data de nascimento",
  sex: "Sexo",
  phone_primary: "Telefone",
  email: "E-mail",
  province: "Província",
  municipality: "Município",
  commune: "Comuna",
  address: "Morada",
  nif: "BI / NIF",
  guardian_name: "Encarregado",
  guardian_phone: "Telefone do encarregado",
  guardian_relationship: "Parentesco",
  notes: "Notas",
};
export function EnrollmentFeeNotice({ amount }: { amount?: number | null }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-4 text-sm">
      <p className="flex flex-wrap items-center justify-between gap-2">
        <span>Taxa de candidatura</span>
        <strong>
          {amount == null
            ? "A confirmar pela escola"
            : `${new Intl.NumberFormat("pt-AO", { maximumFractionDigits: 0 }).format(amount)} Kz`}
        </strong>
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        O envio não efectua pagamentos. O pagamento online ainda não está disponível; aguarde as
        orientações da secretaria. As propinas são confirmadas separadamente.
      </p>
    </div>
  );
}

export function EnrollmentSubmissionReview({
  data,
  programName,
  fee,
  busy,
  error,
  onBack,
  onConfirm,
}: {
  data: FormData;
  programName?: string;
  fee?: number | null;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (confirmed && !busy) onConfirm();
      }}
    >
      <div>
        <p className="text-xs font-medium text-muted-foreground">Passo 2 de 3 · Revisão</p>
        <h2 ref={heading} tabIndex={-1} className="mt-1 font-display text-xl font-semibold">
          Confirme a sua candidatura
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Reveja os dados. Pode voltar e corrigir antes de enviar à escola.
        </p>
      </div>
      <dl className="divide-y divide-border">
        {Object.entries(labels).flatMap(([name, label]) => {
          const raw = String(data.get(name) ?? "").trim();
          if (!raw) return [];
          const value =
            name === "desired_program"
              ? programName || "Curso seleccionado"
              : name === "sex"
                ? ({ M: "Masculino", F: "Feminino", outro: "Outro" }[raw] ?? raw)
                : raw;
          return [
            <div key={name} className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_1.4fr]">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="whitespace-pre-wrap break-words font-medium">{value}</dd>
            </div>,
          ];
        })}
      </dl>
      <EnrollmentFeeNotice amount={fee} />
      <p className="text-sm text-muted-foreground">
        Após o envio, a confirmação e o número de processo aparecem nesta página. Guarde o talão. A
        secretaria revê a candidatura antes de confirmar a matrícula.
      </p>
      <Label
        htmlFor="enrollment-review-consent"
        className="flex items-start gap-3 text-sm font-normal leading-normal"
      >
        <input
          id="enrollment-review-consent"
          type="checkbox"
          required
          checked={confirmed}
          disabled={busy}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-1 size-4 shrink-0"
        />
        <span>Revi os dados e confirmo o envio desta candidatura à escola.</span>
      </Label>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" disabled={busy} onClick={onBack}>
          Corrigir dados
        </Button>
        <Button type="submit" disabled={busy || !confirmed} aria-busy={busy}>
          {busy ? "A enviar…" : "Confirmar e enviar"}
        </Button>
      </div>
    </form>
  );
}
