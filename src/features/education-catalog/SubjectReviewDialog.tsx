/**
 * «Rever disciplinas»: compara as disciplinas da escola com o catálogo e
 * mostra duplicados e nomes fora do padrão. Corrige os nomes escolhidos e
 * junta duplicados, sempre com confirmação.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ListChecks } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InlineLoading } from "@/components/ui/inline-loading";
import { badgeBase, toneClass } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import type { DuplicateGroup, RenameSuggestion, SubjectReview } from "./subject-review";
import {
  getSubjectReview,
  mergeDuplicateSubjects,
  normalizeSubjectNames,
} from "./subject-review-server";

const REASON_LABEL: Record<RenameSuggestion["reason"], string> = {
  grafia: "acentos/maiúsculas",
  "letra trocada": "letra trocada",
  sigla: "sigla — confirme",
};

export function SubjectReviewDialog() {
  const [open, setOpen] = useState(false);
  const fetchReview = useServerFn(getSubjectReview);
  const normalize = useServerFn(normalizeSubjectNames);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["academic", "subject-review"],
    queryFn: () => fetchReview() as Promise<SubjectReview>,
    enabled: open,
    staleTime: 30_000,
  });
  const review = query.data;
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => (review?.renames ?? []).filter((r) => picked[r.id] ?? r.preselected).map((r) => r.id),
    [review, picked],
  );

  const submit = async () => {
    setSaving(true);
    try {
      const result = await normalize({ data: { subjectIds: selected } });
      toast.success(
        result.applied === 1 ? "1 nome corrigido" : `${result.applied} nomes corrigidos`,
        result.skipped
          ? { description: `${result.skipped} mudaram entretanto e ficaram como estavam.` }
          : undefined,
      );
      setPicked({});
      await queryClient.invalidateQueries({ queryKey: ["academic"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível corrigir os nomes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-2"
        onClick={() => setOpen(true)}
      >
        <ListChecks className="size-4" /> Rever disciplinas
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rever disciplinas</DialogTitle>
            <DialogDescription>
              Compara as disciplinas da escola com o catálogo: a mesma disciplina escrita de várias
              formas, e nomes com acentos ou letras trocadas.
            </DialogDescription>
          </DialogHeader>

          {query.isLoading ? <InlineLoading label="A comparar com o catálogo…" /> : null}
          {query.error ? (
            <p className="text-sm text-destructive">
              {query.error instanceof Error
                ? query.error.message
                : "Não foi possível rever as disciplinas."}
            </p>
          ) : null}

          {review ? (
            <div className="space-y-5 text-sm">
              <p className="text-muted-foreground" aria-live="polite">
                {review.total} disciplinas · {review.matched} reconhecidas no catálogo ·{" "}
                {review.duplicates.length} duplicadas · {review.renames.length} nomes a corrigir ·{" "}
                {review.unmatched.length} próprias da escola
              </p>

              <section className="space-y-2">
                <h3 className="font-medium">Nomes a corrigir</h3>
                {review.renames.length ? (
                  <>
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {review.renames.map((r) => (
                        <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                          <Checkbox
                            checked={picked[r.id] ?? r.preselected}
                            onCheckedChange={(v) =>
                              setPicked((p) => ({ ...p, [r.id]: v === true }))
                            }
                            aria-label={`Corrigir ${r.from} para ${r.to}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="text-muted-foreground line-through">{r.from}</span> →{" "}
                            <span className="font-medium">{r.to}</span>{" "}
                            <span className="font-mono text-xs text-muted-foreground">
                              {r.code}
                            </span>
                          </span>
                          <span
                            className={cn(
                              badgeBase,
                              r.reason === "sigla" ? toneClass.warning : toneClass.muted,
                            )}
                          >
                            {REASON_LABEL[r.reason]}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">
                      Só muda o nome; o código, as turmas e as notas ficam iguais. Pautas, boletins
                      e horários gerados a partir de agora usam o nome novo.
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">Nada a corrigir.</p>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="font-medium">A mesma disciplina mais de uma vez</h3>
                {review.duplicates.length ? (
                  <>
                    <ul className="space-y-2">
                      {review.duplicates.map((g) => (
                        <DuplicateGroupCard key={g.catalogCode} group={g} />
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">
                      Juntar passa turmas, currículos, professores, avaliações, presenças e planos
                      de aula para a disciplina a manter; as outras ficam inactivas (não se apagam).
                      Recusa-se se as duas estiverem na mesma turma.
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">Sem duplicados.</p>
                )}
              </section>

              {review.unmatched.length ? (
                <section className="space-y-1">
                  <h3 className="font-medium">Próprias da escola</h3>
                  <p className="text-xs text-muted-foreground">
                    Sem correspondência no catálogo — ficam como estão:{" "}
                    {review.unmatched
                      .slice(0, 15)
                      .map((s) => s.name)
                      .join(", ")}
                    {review.unmatched.length > 15 ? ` e mais ${review.unmatched.length - 15}` : ""}.
                  </p>
                </section>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Fechar
            </Button>
            <Button type="button" onClick={submit} disabled={!selected.length || saving}>
              {saving
                ? "A corrigir…"
                : selected.length === 1
                  ? "Corrigir 1 nome"
                  : `Corrigir ${selected.length} nomes`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Um grupo de duplicados: escolher a que fica, as que se juntam, e confirmar. */
function DuplicateGroupCard({ group }: { group: DuplicateGroup }) {
  const merge = useServerFn(mergeDuplicateSubjects);
  const queryClient = useQueryClient();
  const [keepId, setKeepId] = useState(group.keepId);
  // Siglas soltas («EM») podem ser outra disciplina: não vão por omissão.
  const [joined, setJoined] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const keep = group.members.find((m) => m.id === keepId)!;
  const mergeIds = group.members
    .filter((m) => m.id !== keepId && (joined[m.id] ?? !m.ambiguous))
    .map((m) => m.id);

  const submit = async () => {
    setSaving(true);
    try {
      const result = await merge({ data: { keepId, mergeIds } });
      toast.success(`Disciplinas juntas em «${result.keepName}»`, {
        description:
          result.merged === 1
            ? "1 disciplina ficou inactiva."
            : `${result.merged} ficaram inactivas.`,
      });
      await queryClient.invalidateQueries({ queryKey: ["academic"] });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível juntar as disciplinas.",
      );
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  };

  return (
    <li className="rounded-lg border border-border px-3 py-2">
      <fieldset>
        <legend className="font-medium">{group.canonicalName}</legend>
        <ul className="mt-1 space-y-1 text-xs">
          {group.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`keep-${group.catalogCode}`}
                  checked={m.id === keepId}
                  onChange={() => {
                    setKeepId(m.id);
                    setConfirming(false);
                  }}
                  className="accent-primary"
                />
                <span className="sr-only">Manter</span>
                <span>{m.name}</span>
              </label>
              <span className="font-mono text-muted-foreground">{m.code}</span>
              <span className="text-muted-foreground">
                {m.usage === 1 ? "1 ligação" : `${m.usage} ligações`}
              </span>
              {m.id === keepId ? (
                <span className={cn(badgeBase, toneClass.success)}>fica</span>
              ) : (
                <label className="flex items-center gap-1.5">
                  <Checkbox
                    checked={joined[m.id] ?? !m.ambiguous}
                    onCheckedChange={(v) => {
                      setJoined((p) => ({ ...p, [m.id]: v === true }));
                      setConfirming(false);
                    }}
                  />
                  juntar
                </label>
              )}
              {m.ambiguous ? (
                <span className={cn(badgeBase, toneClass.warning)}>só sigla — confirme</span>
              ) : null}
            </li>
          ))}
        </ul>
      </fieldset>
      {confirming ? (
        <div className="mt-2 rounded-md bg-muted p-2 text-xs" role="alert">
          <p>
            Juntar {mergeIds.length === 1 ? "1 disciplina" : `${mergeIds.length} disciplinas`} em «
            {keep.name}»? Tudo o que está ligado a elas passa para «{keep.name}». Não se desfaz
            automaticamente.
          </p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" onClick={submit} disabled={saving}>
              {saving ? "A juntar…" : "Confirmar"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2"
          disabled={!mergeIds.length}
          onClick={() => setConfirming(true)}
        >
          Juntar em «{keep.name}»…
        </Button>
      )}
    </li>
  );
}
