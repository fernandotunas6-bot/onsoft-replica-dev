import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Handshake, Network, ShieldCheck, Sparkles, UserRoundSearch } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listAlumni } from "@/features/alumni/server";
import { getAlumniMentorRecommendations } from "@/features/alumni/recommendations";

export const Route = createFileRoute("/alumni/matching")({
  head: () => ({ meta: [{ title: "Matching Alumni · SIGA" }] }),
  component: AlumniMatchingPage,
});

function AlumniMatchingPage() {
  const [alumniId, setAlumniId] = useState("");
  const alumniQuery = useQuery({
    queryKey: ["alumni", "matching", "directory"],
    queryFn: () => listAlumni({ data: { limit: 200, offset: 0 } }),
  });
  const matchesQuery = useQuery({
    queryKey: ["alumni", "matching", alumniId],
    queryFn: () => getAlumniMentorRecommendations({ data: { alumniId, limit: 12 } }),
    enabled: Boolean(alumniId),
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                <Sparkles className="size-3.5" /> Matching transparente
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight">
                Mentoria Inteligente Alumni
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Encontre mentores usando competências, interesses, sector, localização,
                disponibilidade e diferença de coorte. Cada recomendação mostra os motivos do score.
              </p>
            </div>
            <Link
              to="/alumni"
              className="inline-flex h-10 items-center rounded-xl border border-input px-4 text-sm font-medium"
            >
              <Network className="mr-2 size-4" />
              Rede Alumni
            </Link>
          </div>
        </section>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRoundSearch className="size-5 text-primary" /> Seleccionar Alumni
            </CardTitle>
          </CardHeader>
          <CardContent>
            <select
              value={alumniId}
              onChange={(event) => setAlumniId(event.target.value)}
              className="h-11 w-full max-w-xl rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="">Escolha quem procura mentor…</option>
              {(alumniQuery.data ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.full_name} · {row.student_number}
                  {row.graduation_year ? ` · ${row.graduation_year}` : ""}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>

        {!alumniId ? (
          <Card className="border-dashed">
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              Seleccione um Alumni para calcular recomendações.
            </CardContent>
          </Card>
        ) : matchesQuery.isLoading ? (
          <Card>
            <CardContent className="p-8 text-sm text-muted-foreground">
              A calcular os melhores encaixes…
            </CardContent>
          </Card>
        ) : (matchesQuery.data ?? []).length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-10 text-center">
              <Handshake className="mx-auto size-9 text-muted-foreground" />
              <p className="mt-3 font-semibold">
                Ainda não existem mentores compatíveis suficientes.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Actualize competências, interesses, sector e disponibilidade dos perfis Alumni.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(matchesQuery.data ?? []).map((match) => (
              <Link
                key={match.alumniId}
                to="/alumni/$alumniId"
                params={{ alumniId: match.alumniId }}
                className="block"
              >
                <Card className="h-full border-border/70 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-bold">{match.fullName}</h3>
                          {match.verifiedAt ? (
                            <ShieldCheck className="size-4 text-primary" />
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {match.currentRole || match.headline || "Mentor Alumni"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {match.currentCompany || match.industry || "Comunidade Alumni"}
                        </p>
                      </div>
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black text-primary">
                        {match.score}%
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {match.reasons.map((reason) => (
                        <span
                          key={reason}
                          className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                    <p className="mt-4 text-xs text-muted-foreground">
                      {[
                        match.city,
                        match.province,
                        match.graduationYear ? `Turma ${match.graduationYear}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
