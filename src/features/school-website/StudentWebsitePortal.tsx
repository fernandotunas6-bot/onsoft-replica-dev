import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { useSignOut } from "@/features/auth/use-sign-out";
import { getStudentWebsitePage } from "./student-portal-server";
import { getSigaLoginUrl } from "@/lib/ecosystem-urls";
import { isStudentPortalRequest, studentPortalFramePath } from "./student-portal-bridge";

/** The school website owns its presentation; SIGA owns authentication, membership and data. */
export function StudentWebsitePortal({
  initialSection = "",
}: {
  initialSection?: "" | "financeiro";
}) {
  const account = useCurrentAccount();
  const { selectedYearLabel } = useSchoolSettings();
  const queryClient = useQueryClient();
  const { signOut } = useSignOut();
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [frameError, setFrameError] = useState(false);
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const eligible =
    account.role === "Aluno" && Boolean(account.schoolId && account.schoolSlug && account.id);
  const finance = useQuery({
    queryKey: ["student-finance-portal", account.id, account.schoolId, account.activeStudentId],
    queryFn: () =>
      getStudentWebsitePage({ data: { schoolId: account.schoolId!, section: "financeiro" } }),
    enabled: initialSection === "financeiro" && eligible && !account.profile.isPending,
    retry: false,
    staleTime: 0,
  });
  const source =
    origin && eligible
      ? studentPortalFramePath(origin, account.schoolSlug || "", getSigaLoginUrl(), initialSection)
      : null;
  useEffect(() => {
    if (!eligible || !source || initialSection === "financeiro") return;
    let active = true;
    setReady(false);
    setFrameError(false);
    const timer = window.setTimeout(() => {
      if (active) setFrameError(true);
    }, 20000);
    async function receive(event: MessageEvent) {
      const target = frame.current?.contentWindow ?? null;
      if (!isStudentPortalRequest(event, target, window.location.origin, account.schoolSlug || ""))
        return;
      clearTimeout(timer);
      setFrameError(false);
      setReady(true);
      const request = event.data;
      if (request.action === "signout") {
        await signOut();
        return;
      }
      try {
        const page = await queryClient.fetchQuery({
          queryKey: [
            "school-student-portal",
            account.id,
            account.schoolId,
            account.activeStudentId,
            selectedYearLabel,
            request.section,
          ],
          queryFn: () =>
            getStudentWebsitePage({
              data: { schoolId: account.schoolId!, section: request.section },
            }),
          staleTime: 30000,
          retry: false,
        });
        if (!active || target !== frame.current?.contentWindow) return;
        target?.postMessage(
          {
            type: "siga-student-response",
            version: 1,
            requestId: request.requestId,
            schoolSlug: account.schoolSlug,
            section: request.section,
            ok: true,
            data: {
              name: account.name,
              email: account.email,
              schoolName: account.schoolName,
              yearLabel: selectedYearLabel,
              ...page,
            },
          },
          window.location.origin,
        );
      } catch {
        if (active && target === frame.current?.contentWindow)
          target?.postMessage(
            {
              type: "siga-student-response",
              version: 1,
              requestId: request.requestId,
              schoolSlug: account.schoolSlug,
              section: request.section,
              ok: false,
            },
            window.location.origin,
          );
      }
    }
    const listener = (event: MessageEvent) => {
      void receive(event);
    };
    window.addEventListener("message", listener);
    frame.current?.contentWindow?.postMessage(
      { type: "siga-student-init", schoolSlug: account.schoolSlug },
      window.location.origin,
    );
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener("message", listener);
    };
    // Account identity and school/year changes reset the document and discard older replies.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signOut and account helpers are recreated by existing hooks.
  }, [
    eligible,
    source,
    account.id,
    account.schoolId,
    account.activeStudentId,
    account.name,
    account.email,
    account.schoolName,
    selectedYearLabel,
    queryClient,
    initialSection,
  ]);
  if (account.profile.isPending)
    return (
      <p role="status" className="p-6 text-sm">
        A verificar a conta académica…
      </p>
    );
  if (!eligible)
    return (
      <main className="mx-auto max-w-xl space-y-4 p-6">
        <h1 className="text-xl font-semibold">Este portal destina-se a estudantes.</h1>
        <p>
          Entre com uma conta de estudante vinculada à escola. Docentes e administração têm o seu
          espaço no SIGA Plus.
        </p>
        <a
          className="text-primary underline"
          href={`/portal${account.schoolSlug ? `?escola=${encodeURIComponent(account.schoolSlug)}` : ""}`}
        >
          Abrir o meu portal SIGA
        </a>
      </main>
    );
  // O regresso da Kursinha usa uma vista nativa autenticada: não depende de
  // páginas demonstrativas do iframe nem permite receber IDs do navegador.
  if (initialSection === "financeiro") {
    const data = finance.data && "finance" in finance.data ? finance.data.finance : null;
    const money = (value: number) =>
      new Intl.NumberFormat("pt-AO", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value) + " Kz";
    return (
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{account.schoolName}</p>
            <h1 className="text-2xl font-semibold">Finanças do estudante</h1>
            <p className="text-sm text-muted-foreground">
              Consulte propinas, saldos e recibos oficiais do SIGA Plus.
            </p>
          </div>
          <a
            className="rounded-lg border px-4 py-2 text-sm"
            href={`/portal?escola=${encodeURIComponent(account.schoolSlug!)}&vista=estudante`}
          >
            Portal académico
          </a>
        </header>
        {finance.isPending && <p role="status">A consultar os seus pagamentos…</p>}
        {finance.isError && (
          <p role="alert">Não foi possível carregar os dados financeiros. Consulte a tesouraria.</p>
        )}
        {data && (
          <>
            <section aria-label="Resumo financeiro" className="grid gap-3 sm:grid-cols-3">
              {[
                ["Total facturado", data.billed],
                ["Total pago", data.paid],
                ["Em dívida", data.outstanding],
              ].map(([label, value]) => (
                <article key={label} className="rounded-xl border bg-card p-5">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-2 text-xl font-semibold">{money(Number(value))}</p>
                </article>
              ))}
            </section>
            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-3 font-semibold">Facturas e propinas</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2">Factura</th>
                      <th>Competência</th>
                      <th>Total</th>
                      <th>Pago</th>
                      <th>Dívida</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invoices.map((row) => (
                      <tr key={row.number} className="border-b last:border-0">
                        <td className="py-3">{row.number}</td>
                        <td>{row.competenceMonth ?? "—"}</td>
                        <td>{money(row.total)}</td>
                        <td>{money(row.paid)}</td>
                        <td>{money(row.outstanding)}</td>
                        <td>
                          {row.status === "paid"
                            ? "Liquidada"
                            : row.status === "partially_paid"
                              ? "Parcial"
                              : "Em aberto"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.invoices.length && (
                <p className="mt-3 text-sm">Ainda não existem facturas registadas na sua conta.</p>
              )}
              {data.moreInvoices && (
                <p className="mt-3 text-sm">Mostram-se as 50 facturas mais recentes.</p>
              )}
            </section>
            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-3 font-semibold">Recibos emitidos</h2>
              <div className="space-y-2">
                {data.receipts.map((row) => (
                  <div
                    key={row.number}
                    className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm"
                  >
                    <span>
                      {row.number} · {row.paidOn ?? "—"}
                    </span>
                    <strong>{money(row.amount)}</strong>
                  </div>
                ))}
              </div>
              {!data.receipts.length && (
                <p className="mt-3 text-sm">Ainda não existem recibos emitidos.</p>
              )}
              {data.moreReceipts && (
                <p className="mt-3 text-sm">Mostram-se os 50 recibos mais recentes.</p>
              )}
            </section>
            <p className="text-sm text-muted-foreground">
              O regresso da plataforma de pagamento não confirma a liquidação. Se pagou e ainda não
              existir recibo, conserve o comprovativo e contacte a tesouraria, sem repetir o
              pagamento.
            </p>
          </>
        )}
      </main>
    );
  }
  return (
    <div className="min-h-dvh bg-background">
      {!ready && (
        <main className="p-6">
          <p role="status">A abrir o seu portal de estudante…</p>
          {frameError && (
            <p role="alert">
              Não foi possível carregar o website da escola.{" "}
              <a className="text-primary underline" href="/portal">
                Abrir o portal SIGA
              </a>
            </p>
          )}
        </main>
      )}
      {source && (
        <iframe
          key={JSON.stringify([
            account.schoolId,
            account.schoolSlug,
            account.id,
            account.activeStudentId,
            selectedYearLabel,
            account.name,
            account.email,
            account.schoolName,
          ])}
          ref={frame}
          src={source}
          title={`Portal do estudante · ${account.schoolName}`}
          referrerPolicy="same-origin"
          style={{
            border: 0,
            width: "100%",
            height: "100dvh",
            display: "block",
            visibility: ready ? "visible" : "hidden",
            position: ready ? "relative" : "absolute",
          }}
        />
      )}
    </div>
  );
}
