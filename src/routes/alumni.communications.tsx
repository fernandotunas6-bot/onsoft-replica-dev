import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Mail,
  Megaphone,
  MessageCircle,
  Network,
  Send,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildAlumniCommunicationAudience } from "@/features/alumni/admin-tools";
import { createSchoolAnnouncement } from "@/features/communications/server";

export const Route = createFileRoute("/alumni/communications")({
  head: () => ({ meta: [{ title: "Comunicação Alumni · SIGA" }] }),
  component: AlumniCommunicationsPage,
});

type Purpose = "general" | "opportunities" | "events" | "mentoring" | "surveys" | "fundraising";
type Channel = "portal" | "email" | "sms";

const audienceForPurpose: Record<
  Purpose,
  | "alumni_all"
  | "alumni_opportunities"
  | "alumni_events"
  | "alumni_mentoring"
  | "alumni_surveys"
  | "alumni_fundraising"
> = {
  general: "alumni_all",
  opportunities: "alumni_opportunities",
  events: "alumni_events",
  mentoring: "alumni_mentoring",
  surveys: "alumni_surveys",
  fundraising: "alumni_fundraising",
};

function AlumniCommunicationsPage() {
  const queryClient = useQueryClient();
  const [purpose, setPurpose] = useState<Purpose>("general");
  const [channel, setChannel] = useState<Channel>("portal");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const audienceQuery = useQuery({
    queryKey: ["alumni", "communications", purpose],
    queryFn: () => buildAlumniCommunicationAudience({ data: { purpose } }),
  });

  const eligible = (audienceQuery.data ?? []).filter((person) => {
    if (channel === "email") return Boolean(person.email);
    if (channel === "sms") return Boolean(person.phone);
    return true;
  });

  const mutation = useMutation({
    mutationFn: (status: "draft" | "sent") =>
      createSchoolAnnouncement({
        data: {
          title,
          body,
          audience: audienceForPurpose[purpose],
          channel,
          status,
        },
      }),
    onSuccess: async (_, status) => {
      toast.success(
        status === "draft"
          ? "Comunicado Alumni guardado como rascunho."
          : "Comunicado Alumni registado como enviado.",
      );
      setTitle("");
      setBody("");
      await queryClient.invalidateQueries({ queryKey: ["communications"] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Não foi possível criar o comunicado Alumni.",
      ),
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1350px] space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <PageHeader
          group="Alumni"
          title="Comunicação Alumni"
          description="Envio centralizado de comunicados segmentados por consentimento e preferências de contacto dos antigos alunos."
          icon={Megaphone}
          crumbs={[
            { label: "Início", to: "/" },
            { label: "Alumni", to: "/alumni" },
            { label: "Comunicação" },
          ]}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" asChild className="rounded-xl h-9 text-xs">
                <Link to="/alumni">
                  <Network className="mr-1.5 size-3.5" />
                  Rede
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild className="rounded-xl h-9 text-xs">
                <Link to="/alumni/operations">Operações</Link>
              </Button>
            </div>
          }
        />

        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <Megaphone className="size-5 text-primary" />
              <p className="mt-3 text-3xl font-black">{audienceQuery.data?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Alumni consentidos para a finalidade</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <Mail className="size-5 text-primary" />
              <p className="mt-3 text-3xl font-black">
                {(audienceQuery.data ?? []).filter((row) => row.email).length}
              </p>
              <p className="text-xs text-muted-foreground">E-mails elegíveis</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <Smartphone className="size-5 text-primary" />
              <p className="mt-3 text-3xl font-black">
                {(audienceQuery.data ?? []).filter((row) => row.phone).length}
              </p>
              <p className="text-xs text-muted-foreground">Telefones autorizados</p>
            </CardContent>
          </Card>
        </section>

        <div className="grid gap-4 xl:grid-cols-[1fr_.8fr]">
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Criar comunicado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  id="comm-purpose"
                  aria-label="Finalidade do comunicado"
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value as Purpose)}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                >
                  <option value="general">Rede Alumni geral</option>
                  <option value="opportunities">Oportunidades</option>
                  <option value="events">Eventos</option>
                  <option value="mentoring">Mentoria</option>
                  <option value="surveys">Tracer studies</option>
                  <option value="fundraising">Fundraising</option>
                </select>
                <select
                  id="comm-channel"
                  aria-label="Canal de comunicação"
                  value={channel}
                  onChange={(event) => setChannel(event.target.value as Channel)}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                >
                  <option value="portal">Portal</option>
                  <option value="email">E-mail</option>
                  <option value="sms">SMS</option>
                </select>
              </div>
              <Input
                id="comm-title"
                aria-label="Título do comunicado"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Título do comunicado"
              />
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="min-h-44 w-full rounded-xl border border-input bg-background p-3 text-sm"
                placeholder="Mensagem para a rede Alumni…"
              />
              <div className="rounded-2xl bg-muted/50 p-4 text-xs leading-5 text-muted-foreground">
                <strong className="text-foreground">Pré-validação:</strong> {eligible.length}{" "}
                destinatário(s) compatíveis com o canal seleccionado. O registo do comunicado não
                substitui o provider de entrega; e-mail/SMS dependem das integrações configuradas no
                SIGA.
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => mutation.mutate("draft")}
                  disabled={!title.trim() || !body.trim() || mutation.isPending}
                >
                  Guardar rascunho
                </Button>
                <Button
                  onClick={() => mutation.mutate("sent")}
                  disabled={!title.trim() || !body.trim() || mutation.isPending}
                >
                  <Send className="mr-2 size-4" />
                  Registar envio
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="size-5 text-primary" />
                Preview da audiência
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {eligible.slice(0, 20).map((person) => (
                <div
                  key={person.alumniId}
                  className="rounded-xl border border-border/60 px-3 py-2.5"
                >
                  <p className="text-sm font-semibold">{person.fullName}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {channel === "email"
                      ? person.email
                      : channel === "sms"
                        ? person.phone
                        : "Portal Alumni"}
                  </p>
                  <p className="mt-1 text-[11px] font-bold text-primary">
                    {[person.graduationYear, person.province].filter(Boolean).join(" · ") ||
                      "Alumni"}
                  </p>
                </div>
              ))}
              {eligible.length > 20 ? (
                <p className="pt-2 text-xs text-muted-foreground">
                  + {eligible.length - 20} destinatários elegíveis
                </p>
              ) : null}
              {!eligible.length ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  Nenhum Alumni elegível para esta combinação de finalidade e canal.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
