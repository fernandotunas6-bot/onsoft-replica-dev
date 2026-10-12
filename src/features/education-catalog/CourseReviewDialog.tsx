/**
 * «Ligar cursos»: liga os cursos da escola ao catálogo
 * (`programs.catalog_course_code`). Os reconhecidos pelo nome ligam-se de uma
 * vez; os próprios da escola ligam-se à mão ou ficam como estão. Só muda a
 * ligação — o nome, o código, as classes e as turmas ficam iguais.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InlineLoading } from "@/components/ui/inline-loading";
import {
  getCourseReview,
  linkCoursesToCatalog,
} from "@/features/academic/curriculum-templates-server";
import { catalogCourseOptions, type CourseReview } from "./course-review";

export function CourseReviewDialog() {
  const [open, setOpen] = useState(false);
  const fetchReview = useServerFn(getCourseReview);
  const link = useServerFn(linkCoursesToCatalog);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["academic", "course-review"],
    queryFn: () => fetchReview() as Promise<CourseReview>,
    enabled: open,
    staleTime: 30_000,
  });
  const review = query.data;
  const [saving, setSaving] = useState(false);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const options = useMemo(() => catalogCourseOptions(), []);

  const run = async (data: {
    auto?: string[];
    manual?: Array<{ programId: string; catalogCode: string }>;
  }) => {
    setSaving(true);
    try {
      const result = await link({ data: { auto: data.auto ?? [], manual: data.manual ?? [] } });
      toast.success(
        result.applied === 1
          ? "1 curso ligado ao catálogo"
          : `${result.applied} cursos ligados ao catálogo`,
        result.skipped
          ? { description: `${result.skipped} mudaram entretanto e ficaram como estavam.` }
          : undefined,
      );
      setChosen({});
      await queryClient.invalidateQueries({ queryKey: ["academic"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ligar os cursos.");
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
        <Link2 className="size-4" /> Ligar cursos
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ligar cursos ao catálogo</DialogTitle>
            <DialogDescription>
              Diz a que curso de referência corresponde cada curso da escola, sem mudar o nome, o
              código, as classes nem as turmas.
            </DialogDescription>
          </DialogHeader>

          {query.isLoading ? <InlineLoading label="A comparar com o catálogo…" /> : null}
          {query.error ? (
            <p className="text-sm text-destructive">
              {query.error instanceof Error
                ? query.error.message
                : "Não foi possível ler os cursos."}
            </p>
          ) : null}

          {review && !review.total ? (
            <p className="text-sm text-muted-foreground">A escola ainda não tem cursos.</p>
          ) : null}

          {review && review.total > 0 && !review.linkAvailable ? (
            <p className="text-sm text-muted-foreground">
              Fica disponível depois de aplicada no servidor a migração
              20261012120000_subjects_catalog_link.sql.
            </p>
          ) : null}

          {review && review.total > 0 && review.linkAvailable ? (
            <div className="space-y-5 text-sm">
              <p className="text-muted-foreground" aria-live="polite">
                {review.total} cursos · {review.linked} ligados · {review.toLink.length}{" "}
                reconhecidos pelo nome · {review.unmatched.length} próprios da escola
              </p>

              {review.toLink.length ? (
                <section className="space-y-2">
                  <h3 className="font-medium">Reconhecidos pelo nome</h3>
                  <ul className="divide-y divide-border rounded-lg border border-border text-xs">
                    {review.toLink.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <span className="min-w-0 flex-1">
                          {l.name} <span className="font-mono text-muted-foreground">{l.code}</span>
                        </span>
                        <span className="text-muted-foreground">
                          → {l.catalogName} ({l.catalogCode})
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() => run({ auto: review.toLink.map((l) => l.id) })}
                  >
                    {review.toLink.length === 1 ? "Ligar 1" : `Ligar ${review.toLink.length}`}
                  </Button>
                </section>
              ) : null}

              {review.unmatched.length ? (
                <section className="space-y-2">
                  <h3 className="font-medium">Próprios da escola</h3>
                  <p className="text-xs text-muted-foreground">
                    Sem correspondência pelo nome. Ligue só os que são um curso do catálogo; os
                    outros ficam como estão.
                  </p>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {review.unmatched.map((u) => (
                      <li
                        key={u.id}
                        className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs"
                      >
                        <span className="min-w-0 flex-1">
                          {u.name} <span className="font-mono text-muted-foreground">{u.code}</span>
                        </span>
                        <select
                          className="h-8 max-w-[16rem] rounded-md border border-input bg-background px-2"
                          value={chosen[u.id] ?? ""}
                          onChange={(e) => setChosen((c) => ({ ...c, [u.id]: e.target.value }))}
                          aria-label={`Curso do catálogo para ${u.name}`}
                        >
                          <option value="">— próprio da escola —</option>
                          {options.map((o) => (
                            <option key={o.code} value={o.code}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={saving || !chosen[u.id]}
                          onClick={() =>
                            run({ manual: [{ programId: u.id, catalogCode: chosen[u.id]! }] })
                          }
                        >
                          Ligar
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {!review.toLink.length && !review.unmatched.length ? (
                <p className="text-muted-foreground">Todos os cursos estão ligados.</p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
