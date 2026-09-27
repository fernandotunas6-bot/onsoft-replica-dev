import { useState } from "react";
import { InlineLoading } from "@/components/ui/inline-loading";
import { MoreInfo } from "@/components/ui/more-info";
import { publicErrorMessage } from "@/lib/public-error";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailCheck, MailWarning } from "lucide-react";
import { actionIcons, moduleIcons, statusIcons } from "@/lib/app-icons";
import { toast } from "sonner";
import { Panel, badgeBase, toneClass } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ApplicationRole } from "@/features/auth/access-policy";
import {
  accessRequestStatusLabels,
  canGrantRole,
  defaultRoleForProfile,
  grantableRolesByProfile,
  isOpenAccessRequest,
  type AccessRequestStatus,
} from "./institutional-link";
import type { ReviewAccessRequestInput } from "./request-schemas";
import {
  listSchoolAccessRequests,
  reviewAccessRequest,
  type SchoolAccessRequestItem,
} from "./requests-server";

const QUERY_KEY = ["access", "requests"] as const;

const statusTone: Record<AccessRequestStatus, string> = {
  pending: toneClass.warning,
  in_review: toneClass.info,
  info_requested: toneClass.primary,
  approved: toneClass.success,
  rejected: toneClass.danger,
  cancelled: toneClass.muted,
};

const filters = [
  ["open", "Em aberto"],
  ["pending", "Pendentes"],
  ["in_review", "Em análise"],
  ["info_requested", "Info. pedida"],
  ["approved", "Aprovados"],
  ["rejected", "Rejeitados"],
  ["cancelled", "Cancelados"],
  ["all", "Todos"],
] as const;
type Filter = (typeof filters)[number][0];

function RequestRow({
  item,
  reviewerRole,
}: {
  item: SchoolAccessRequestItem;
  reviewerRole: ApplicationRole;
}) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<ApplicationRole>(defaultRoleForProfile(item.profile));
  const [note, setNote] = useState("");
  const [linkRecord, setLinkRecord] = useState(
    Boolean(item.matchedRecord && !item.matchedRecord.alreadyLinkedToOtherAccount),
  );

  const review = useMutation({
    mutationFn: (input: ReviewAccessRequestInput) => reviewAccessRequest({ data: input }),
    onSuccess: (result, input) => {
      const labels: Record<ReviewAccessRequestInput["action"], string> = {
        start_review: "Pedido em análise.",
        request_info: "Pedido de informação enviado.",
        approve: result.linkedRecord ? "Acesso aprovado e ligado ao cadastro." : "Acesso aprovado.",
        reject: "Pedido rejeitado.",
      };
      toast.success(labels[input.action]);
      setNote("");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["access", "accounts"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível gravar a decisão."),
  });

  const open = isOpenAccessRequest(item.status);
  const roleOptions = grantableRolesByProfile[item.profile].filter(
    (candidate) => canGrantRole(reviewerRole, item.profile, candidate).ok,
  );
  const noteReady = note.trim().length >= 3;

  return (
    <li className="rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{item.fullName}</p>
          <p className="text-xs text-muted-foreground">
            {item.profileLabel} · {new Date(item.createdAt).toLocaleString("pt-AO")}
          </p>
        </div>
        <span className={`${badgeBase} ${statusTone[item.status]}`}>
          {accessRequestStatusLabels[item.status]}
        </span>
      </div>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Conta</dt>
          <dd className="flex items-center gap-1 font-medium break-all">
            {item.requesterEmailVerified ? (
              <MailCheck
                className="size-3.5 shrink-0 text-success"
                aria-label="E-mail verificado"
              />
            ) : (
              <MailWarning
                className="size-3.5 shrink-0 text-warning"
                aria-label="E-mail por verificar"
              />
            )}
            {item.requesterEmail ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Nº institucional</dt>
          <dd className="font-medium">{item.institutionalNumber ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">B.I.</dt>
          <dd className="font-medium">{item.nationalIdMasked ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Telefone</dt>
          <dd className="font-medium">{item.contactPhone ?? "—"}</dd>
        </div>
      </dl>

      {item.message ? (
        <p className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">{item.message}</p>
      ) : null}
      {item.infoRequestNote ? (
        <p className="mt-2 text-xs">
          <strong>Informação pedida:</strong> {item.infoRequestNote}
        </p>
      ) : null}
      {item.requesterReply ? (
        <p className="mt-1 text-xs">
          <strong>Resposta do requerente:</strong> {item.requesterReply}
        </p>
      ) : null}
      {item.decisionNote && !open ? (
        <p className="mt-1 text-xs text-muted-foreground">
          <strong>Nota da decisão:</strong> {item.decisionNote}
        </p>
      ) : null}

      <div
        className={`mt-3 rounded-lg px-3 py-2 text-xs ${
          item.matchedRecord ? "bg-success/10" : "bg-muted/60 text-muted-foreground"
        }`}
      >
        {item.matchedRecord ? (
          <>
            <strong>Cadastro encontrado:</strong> {item.matchedRecord.fullName}
            {item.matchedRecord.alreadyLinkedToOtherAccount ? " · já ligado a outra conta" : null}
          </>
        ) : (
          <>
            Sem cadastro correspondente.
            <MoreInfo className="mt-1">
              Nenhum cadastro coincide com o B.I. e o número indicados. Confirme a identidade antes
              de aprovar: a aprovação cria só o vínculo e o papel, sem cadastro académico.
            </MoreInfo>
          </>
        )}
      </div>

      {open ? (
        <div className="mt-3 space-y-3">
          <Textarea
            aria-label="Nota para o requerente"
            placeholder="Nota (obrigatória para pedir informação ou rejeitar)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
            rows={2}
            className="text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            {roleOptions.length ? (
              <label className="flex items-center gap-1.5 text-xs">
                Papel
                <select
                  aria-label="Papel"
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={roleOptions.includes(role) ? role : roleOptions[0]}
                  onChange={(event) => setRole(event.target.value as ApplicationRole)}
                >
                  {roleOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {item.matchedRecord && !item.matchedRecord.alreadyLinkedToOtherAccount ? (
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  aria-label="Ligar a conta ao cadastro"
                  checked={linkRecord}
                  onChange={(event) => setLinkRecord(event.target.checked)}
                />
                Ligar a conta ao cadastro
              </label>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="gap-1.5"
              disabled={review.isPending || !roleOptions.length}
              title={
                roleOptions.length ? undefined : "Só um Administrador pode conceder este papel."
              }
              onClick={() =>
                review.mutate({
                  action: "approve",
                  requestId: item.id,
                  role: roleOptions.includes(role) ? role : roleOptions[0]!,
                  linkMatchedRecord: linkRecord,
                  note: note.trim() || undefined,
                })
              }
            >
              {review.isPending ? (
                <actionIcons.loading className="size-3.5 animate-spin" />
              ) : (
                <statusIcons.success className="size-3.5" />
              )}
              Aprovar
            </Button>
            {item.status === "pending" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={review.isPending}
                onClick={() => review.mutate({ action: "start_review", requestId: item.id })}
              >
                Marcar em análise
              </Button>
            ) : null}
            {item.status !== "info_requested" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={review.isPending || !noteReady}
                onClick={() =>
                  review.mutate({ action: "request_info", requestId: item.id, note: note.trim() })
                }
              >
                Pedir informação
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-destructive"
              disabled={review.isPending || !noteReady}
              onClick={() =>
                review.mutate({ action: "reject", requestId: item.id, note: note.trim() })
              }
            >
              <statusIcons.error className="size-3.5" /> Rejeitar
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** Fila de pedidos de vinculação institucional da escola activa (Secretaria / Administração). */
export function AccessRequestsPanel() {
  const [filter, setFilter] = useState<Filter>("open");
  const requests = useQuery({
    queryKey: [...QUERY_KEY, filter],
    queryFn: () => listSchoolAccessRequests({ data: { status: filter } }),
    staleTime: 30_000,
  });

  const openCount = requests.data?.available
    ? Object.values(requests.data.counts).reduce((sum, n) => sum + (n ?? 0), 0)
    : 0;

  return (
    <Panel
      title="Solicitações de acesso"
      description="Pedidos para entrar na escola."
      icon={moduleIcons.accessRequests}
      action={
        openCount ? (
          <span className={`${badgeBase} ${toneClass.warning}`}>{openCount} em aberto</span>
        ) : undefined
      }
    >
      {requests.data && !requests.data.available ? (
        <p className="text-xs text-muted-foreground">
          Pedidos de acesso ainda não activos nesta escola.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar pedidos">
            {filters.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                onClick={() => setFilter(value)}
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                  filter === value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {requests.isPending ? (
            <InlineLoading label="A carregar pedidos…" />
          ) : requests.isError ? (
            <p role="alert" className="text-xs text-destructive">
              {publicErrorMessage(requests.error, "Não foi possível carregar os pedidos.")}
            </p>
          ) : requests.data?.items.length ? (
            <ul className="grid gap-3">
              {requests.data.items.map((item) => (
                <RequestRow
                  key={item.id}
                  item={item}
                  reviewerRole={(requests.data.reviewerRole ?? "Secretaria") as ApplicationRole}
                />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Sem pedidos neste estado.</p>
          )}
        </div>
      )}
    </Panel>
  );
}
