import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, LogOut, MessageSquareReply, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { toneClass } from "@/components/layout/PageHeader";
import { IconChip } from "@/components/ui/icon-chip";
import { SigaLogo } from "@/components/ui/siga-logo";
import { actionIcons, moduleIcons, statusIcons } from "@/lib/app-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getCreateSchoolUrl } from "@/lib/ecosystem-urls";
import { useSignOut } from "@/features/auth/use-sign-out";
import {
  accessRequestProfileLabels,
  accessRequestProfiles,
  institutionalNumberLabels,
  isOpenAccessRequest,
  type AccessRequestProfile,
} from "@/features/access/institutional-link";
import {
  actOnMyAccessRequest,
  getInstitutionalLinkState,
  searchSchoolsForAccessRequest,
  submitAccessRequest,
  type MyAccessRequest,
  type SchoolSearchResult,
} from "@/features/access/requests-server";
import type { RequesterAccessRequestActionInput } from "@/features/access/request-schemas";

const LINK_STATE_KEY = ["auth", "institutional-link"] as const;

const FLOW_STEPS = ["Identificação", "Escola", "Pedido", "Verificação", "Acesso"] as const;

type View = "welcome" | "identify" | "school" | "confirm";

type IdentityDraft = {
  profile: AccessRequestProfile;
  fullName: string;
  nationalId: string;
  institutionalNumber: string;
  contactPhone: string;
  message: string;
};

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function FlowStepper({ current }: { current: number }) {
  return (
    <div>
      {current >= 0 ? (
        <p className="mb-2 text-[11px] text-muted-foreground sm:hidden">
          Passo {current + 1} de {FLOW_STEPS.length} ·{" "}
          <span className="font-semibold text-foreground">{FLOW_STEPS[current]}</span>
        </p>
      ) : null}
      <ol className="grid grid-cols-5 gap-2" aria-label="Etapas do pedido de acesso">
        {FLOW_STEPS.map((label, index) => {
          const reached = index <= current;
          const active = index === current;
          return (
            <li key={label} aria-current={active ? "step" : undefined} className="min-w-0">
              <span
                aria-hidden
                className={`block h-1 rounded-full ${reached ? "bg-primary" : "bg-border"}`}
              />
              <span
                className={`mt-1.5 hidden truncate text-[11px] sm:block ${
                  active ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const statusTone: Record<MyAccessRequest["status"], string> = {
  pending: toneClass.warning,
  in_review: toneClass.info,
  info_requested: toneClass.primary,
  approved: toneClass.success,
  rejected: toneClass.danger,
  cancelled: toneClass.muted,
};

function RequestCard({ request }: { request: MyAccessRequest }) {
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const action = useMutation({
    mutationFn: (input: RequesterAccessRequestActionInput) => actOnMyAccessRequest({ data: input }),
    onSuccess: (_, input) => {
      toast.success(
        input.action === "cancel" ? "Pedido cancelado." : "Resposta enviada à secretaria.",
      );
      setReply("");
      void queryClient.invalidateQueries({ queryKey: LINK_STATE_KEY });
    },
    onError: (error) => toast.error(errorText(error, "Não foi possível actualizar o pedido.")),
  });

  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{request.schoolName}</p>
          <p className="text-xs text-muted-foreground">
            {request.profileLabel} · enviado em{" "}
            {new Date(request.createdAt).toLocaleDateString("pt-AO")}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone[request.status]}`}
        >
          {request.statusLabel}
        </span>
      </div>

      {request.status === "info_requested" && request.infoRequestNote ? (
        <form
          className="mt-3 space-y-2 rounded-xl border border-border bg-muted/40 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            action.mutate({ action: "reply", requestId: request.id, reply });
          }}
        >
          <p className="text-xs">
            <strong>A secretaria pede:</strong> {request.infoRequestNote}
          </p>
          <Textarea
            aria-label="Resposta à secretaria"
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            maxLength={1000}
            rows={2}
            className="text-sm"
          />
          <Button
            size="sm"
            type="submit"
            className="gap-1.5"
            disabled={reply.trim().length < 2 || action.isPending}
          >
            <MessageSquareReply className="size-3.5" /> Responder
          </Button>
        </form>
      ) : null}

      {request.decisionNote ? (
        <p className="mt-3 text-xs text-muted-foreground">
          <strong>Nota da secretaria:</strong> {request.decisionNote}
        </p>
      ) : null}

      {isOpenAccessRequest(request.status) ? (
        <button
          type="button"
          className="mt-3 text-xs font-medium text-muted-foreground hover:text-destructive disabled:opacity-60"
          disabled={action.isPending}
          onClick={() => action.mutate({ action: "cancel", requestId: request.id })}
        >
          Cancelar pedido
        </button>
      ) : null}
    </li>
  );
}

/**
 * Painel de boas-vindas para contas autenticadas sem vínculo escolar activo.
 * Opção A: configurar uma escola (fluxo WEB existente). Opção B: pedir acesso
 * a uma escola do SIGA Plus — o pedido vai para a secretaria, que decide.
 */
export function InstitutionOnboarding({ displayName }: { displayName: string }) {
  const queryClient = useQueryClient();
  const { signOut, signingOut } = useSignOut();
  const [view, setView] = useState<View>("welcome");
  const [draft, setDraft] = useState<IdentityDraft>({
    profile: "aluno",
    fullName: displayName,
    nationalId: "",
    institutionalNumber: "",
    contactPhone: "",
    message: "",
  });
  const [schoolQuery, setSchoolQuery] = useState("");
  const [school, setSchool] = useState<SchoolSearchResult | null>(null);

  const linkState = useQuery({
    queryKey: LINK_STATE_KEY,
    queryFn: () => getInstitutionalLinkState(),
    // Enquanto há pedido em aberto, a aprovação deve aparecer sem recarregar.
    refetchInterval: (query) =>
      query.state.data?.requests.some((r) => isOpenAccessRequest(r.status)) ? 60_000 : false,
  });

  // Aprovado: o vínculo passou a existir — recarregar o contexto da conta abre o painel.
  useEffect(() => {
    if (linkState.data?.situation === "linked") {
      void queryClient.invalidateQueries({ queryKey: ["auth", "account-context"] });
    }
  }, [linkState.data?.situation, queryClient]);

  const search = useMutation({
    mutationFn: (query: string) => searchSchoolsForAccessRequest({ data: { query } }),
    onError: (error) => toast.error(errorText(error, "Não foi possível pesquisar escolas.")),
  });

  const submit = useMutation({
    mutationFn: () => {
      if (!school) throw new Error("Seleccione a escola.");
      return submitAccessRequest({
        data: {
          schoolId: school.id,
          profile: draft.profile,
          fullName: draft.fullName,
          nationalId: draft.nationalId || undefined,
          institutionalNumber: draft.institutionalNumber || undefined,
          contactPhone: draft.contactPhone || undefined,
          message: draft.message || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Pedido enviado à secretaria da escola.");
      setView("welcome");
      setSchool(null);
      setSchoolQuery("");
      search.reset();
      void queryClient.invalidateQueries({ queryKey: LINK_STATE_KEY });
    },
    onError: (error) => toast.error(errorText(error, "Não foi possível enviar o pedido.")),
  });

  const requests = linkState.data?.requests ?? [];
  const openRequests = requests.filter((r) => isOpenAccessRequest(r.status));
  const numberRequired = draft.profile === "aluno" || draft.profile === "encarregado";
  const stepIndex =
    view === "identify"
      ? 0
      : view === "school"
        ? 1
        : view === "confirm"
          ? 2
          : openRequests.length
            ? 3
            : -1;

  const identityValid = useMemo(
    () =>
      draft.fullName.trim().length >= 3 &&
      (!numberRequired || draft.institutionalNumber.trim().length > 0),
    [draft.fullName, draft.institutionalNumber, numberRequired],
  );

  const update = <K extends keyof IdentityDraft>(key: K, value: IdentityDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (schoolQuery.trim().length < 3) return;
    search.mutate(schoolQuery.trim());
  };

  return (
    <main className="min-h-screen bg-muted/20 px-4 py-8 sm:px-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-display text-lg font-extrabold">
            <SigaLogo size="sm" />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => void signOut()}
            disabled={signingOut}
          >
            <LogOut className="size-4" /> Terminar sessão
          </Button>
        </header>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Bem-vindo(a)
          </p>
          <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            Olá, {displayName}. A sua conta ainda não está ligada a nenhuma escola.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tem uma só identidade no SIGA Plus e pode pertencer a várias escolas, com um papel
            diferente em cada uma. Escolha como quer continuar.
          </p>
          {linkState.data && !linkState.data.emailVerified ? (
            <p className="mt-3 rounded-xl bg-warning/20 px-3 py-2 text-xs text-warning-foreground">
              O e-mail {linkState.data.email} ainda não foi confirmado. A secretaria verá essa
              indicação no seu pedido.
            </p>
          ) : null}
          <div className="mt-5">
            <FlowStepper current={stepIndex} />
          </div>
        </section>

        {view === "welcome" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <a
              href={getCreateSchoolUrl()}
              className="group rounded-3xl border border-border bg-card p-6 shadow-sm transition hover:border-primary/60 hover:shadow-md"
            >
              <IconChip icon={moduleIcons.school} size="md" />
              <h2 className="mt-4 text-lg font-bold">Quero configurar uma escola</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Registe a sua instituição, escolha o plano e o subdomínio. Novas escolas passam pela
                validação da plataforma antes de ficarem activas.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                Abrir assistente{" "}
                <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
              </span>
            </a>
            <button
              type="button"
              onClick={() => setView("identify")}
              disabled={linkState.data?.requestsAvailable === false}
              className="group rounded-3xl border border-border bg-card p-6 text-left shadow-sm transition hover:border-primary/60 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
            >
              <IconChip icon={moduleIcons.institutionalLink} size="md" />
              <h2 className="mt-4 text-lg font-bold">Já pertenço a uma escola</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Aluno, docente, funcionário ou encarregado: identifique-se e peça acesso. A
                secretaria confirma antes de abrir o painel.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                Pedir acesso{" "}
                <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
              </span>
            </button>
          </div>
        ) : null}

        {linkState.data?.requestsAvailable === false && view === "welcome" ? (
          <p className="rounded-2xl bg-warning/20 px-4 py-3 text-xs text-warning-foreground">
            Os pedidos de acesso ainda não estão activos nesta instalação. Peça à sua escola um
            convite directo.
          </p>
        ) : null}

        {view === "identify" ? (
          <form
            className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8"
            onSubmit={(event) => {
              event.preventDefault();
              if (identityValid) setView("school");
            }}
          >
            <div className="flex items-center gap-2">
              <IconChip icon={moduleIcons.profile} size="xs" />
              <h2 className="text-lg font-bold">Identificação institucional</h2>
            </div>

            <fieldset>
              <legend className="text-xs font-medium">Perfil pretendido</legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {accessRequestProfiles.map((profile) => (
                  <label
                    key={profile}
                    className={`cursor-pointer rounded-xl border px-3 py-2 text-center text-xs font-semibold transition ${
                      draft.profile === profile
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="profile"
                      value={profile}
                      className="sr-only"
                      checked={draft.profile === profile}
                      onChange={() => update("profile", profile)}
                    />
                    {accessRequestProfileLabels[profile]}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="req-name" className="text-xs">
                  Nome completo
                </Label>
                <Input
                  id="req-name"
                  value={draft.fullName}
                  onChange={(e) => update("fullName", e.target.value)}
                  required
                  minLength={3}
                  maxLength={160}
                  autoComplete="name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="req-bi" className="text-xs">
                  Nº do B.I. (recomendado)
                </Label>
                <Input
                  id="req-bi"
                  value={draft.nationalId}
                  onChange={(e) => update("nationalId", e.target.value.toUpperCase())}
                  maxLength={40}
                  placeholder="004212984LA042"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="req-number" className="text-xs">
                  {institutionalNumberLabels[draft.profile]}
                  {numberRequired ? " *" : ""}
                </Label>
                <Input
                  id="req-number"
                  value={draft.institutionalNumber}
                  onChange={(e) => update("institutionalNumber", e.target.value)}
                  maxLength={60}
                  required={numberRequired}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="req-phone" className="text-xs">
                  Telefone de contacto
                </Label>
                <Input
                  id="req-phone"
                  value={draft.contactPhone}
                  onChange={(e) => update("contactPhone", e.target.value)}
                  maxLength={30}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+244 9xx xxx xxx"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="req-message" className="text-xs">
                  Mensagem para a secretaria (opcional)
                </Label>
                <Textarea
                  id="req-message"
                  value={draft.message}
                  onChange={(e) => update("message", e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Ex.: turma, curso ou departamento."
                />
              </div>
            </div>

            <p className="flex gap-2 rounded-xl bg-muted/60 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              Estes dados ajudam a secretaria a localizar o seu cadastro. Não dão acesso por si só:
              o acesso só é aberto depois de a escola confirmar a sua identidade.
            </p>

            <div className="flex flex-wrap justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                className="gap-1.5"
                onClick={() => setView("welcome")}
              >
                <ArrowLeft className="size-4" /> Voltar
              </Button>
              <Button type="submit" className="gap-1.5" disabled={!identityValid}>
                Escolher escola <ArrowRight className="size-4" />
              </Button>
            </div>
          </form>
        ) : null}

        {view === "school" ? (
          <section className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-2">
              <IconChip icon={moduleIcons.school} size="xs" />
              <h2 className="text-lg font-bold">Seleccione a escola</h2>
            </div>
            <form className="flex gap-2" onSubmit={onSearch} role="search">
              <Input
                aria-label="Nome, sigla ou código da escola"
                value={schoolQuery}
                onChange={(e) => setSchoolQuery(e.target.value)}
                placeholder="Nome, sigla ou código da escola"
                minLength={3}
                maxLength={80}
              />
              <Button
                type="submit"
                className="gap-1.5"
                disabled={schoolQuery.trim().length < 3 || search.isPending}
              >
                {search.isPending ? (
                  <actionIcons.loading className="size-4 animate-spin" />
                ) : (
                  <actionIcons.search className="size-4" />
                )}
                Pesquisar
              </Button>
            </form>

            {search.data ? (
              search.data.length ? (
                <ul className="grid gap-2" aria-label="Escolas encontradas">
                  {search.data.map((result) => (
                    <li key={result.id}>
                      <button
                        type="button"
                        onClick={() => setSchool(result)}
                        aria-pressed={school?.id === result.id}
                        className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                          school?.id === result.id
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <span>
                          <span className="block text-sm font-semibold">{result.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {[result.commercialName, result.code, result.province]
                              .filter(Boolean)
                              .join(" · ") || "SIGA Plus"}
                          </span>
                        </span>
                        {school?.id === result.id ? (
                          <statusIcons.success className="size-5 text-primary" />
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma escola encontrada. Confirme o nome ou peça o código da escola à
                  secretaria.
                </p>
              )
            ) : null}

            <div className="flex flex-wrap justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                className="gap-1.5"
                onClick={() => setView("identify")}
              >
                <ArrowLeft className="size-4" /> Voltar
              </Button>
              <Button
                type="button"
                className="gap-1.5"
                disabled={!school}
                onClick={() => setView("confirm")}
              >
                Rever pedido <ArrowRight className="size-4" />
              </Button>
            </div>
          </section>
        ) : null}

        {view === "confirm" && school ? (
          <section className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-2">
              <IconChip icon={Send} size="xs" />
              <h2 className="text-lg font-bold">Confirmar pedido de acesso</h2>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Escola</dt>
                <dd className="font-semibold">{school.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Perfil</dt>
                <dd className="font-semibold">{accessRequestProfileLabels[draft.profile]}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Nome</dt>
                <dd className="font-semibold">{draft.fullName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {institutionalNumberLabels[draft.profile]}
                </dt>
                <dd className="font-semibold">{draft.institutionalNumber || "—"}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              A secretaria de {school.name} vai verificar o pedido. Será avisado aqui e, se a escola
              tiver e-mail configurado, também por e-mail.
            </p>
            <div className="flex flex-wrap justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                className="gap-1.5"
                onClick={() => setView("school")}
              >
                <ArrowLeft className="size-4" /> Voltar
              </Button>
              <Button
                type="button"
                className="gap-1.5"
                disabled={submit.isPending}
                onClick={() => submit.mutate()}
              >
                {submit.isPending ? (
                  <actionIcons.loading className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Enviar pedido
              </Button>
            </div>
          </section>
        ) : null}

        {view === "welcome" && requests.length ? (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              {openRequests.length ? (
                <statusIcons.pending className="size-4 text-primary" />
              ) : (
                <statusIcons.info className="size-4 text-muted-foreground" />
              )}
              Os meus pedidos de acesso
            </h2>
            <ul className="grid gap-3">
              {requests.map((request) => (
                <RequestCard key={request.id} request={request} />
              ))}
            </ul>
          </section>
        ) : null}

        {linkState.isError ? (
          <p
            role="alert"
            className="rounded-2xl bg-destructive/10 px-4 py-3 text-xs text-destructive"
          >
            {errorText(linkState.error, "Não foi possível carregar o estado da conta.")}
          </p>
        ) : null}
      </div>
    </main>
  );
}
