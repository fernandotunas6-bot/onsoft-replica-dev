import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  fetchOverview,
  fetchResource,
  runAction,
  type PayflowOverview,
} from "./admin-api";
import {
  getPayflowSession,
  payflowSupabase,
  signInPayflow,
  signOutPayflow,
} from "./auth";
import "./admin.css";

type Row = Record<string, unknown>;

const money = (value: unknown) =>
  new Intl.NumberFormat("pt-AO", {
    style: "currency",
    currency: "AOA",
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));

const dateValue = (value: unknown) => {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("pt-AO", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

const NAV = [
  ["Visão geral", "/dashboard", "◫"],
  ["Pagamentos", "/payments", "↙"],
  ["Cobranças", "/charges", "▤"],
  ["Estudantes", "/students", "◎"],
  ["Transações", "/transactions", "⇄"],
  ["Reconciliação", "/reconciliation", "✓"],
  ["Reembolsos", "/refunds", "↶"],
  ["Contas a receber", "/receivables", "◴"],
  ["Planos", "/payment-plans", "≡"],
  ["Relatórios", "/reports", "⌁"],
  ["Notificações", "/notifications", "◌"],
  ["Auditoria", "/audit", "⌕"],
  ["Webhooks", "/webhooks", "⤴"],
  ["Configurações", "/settings", "⚙"],
] as const;

const RESOURCE_BY_PATH: Record<string, { title: string; resource: string; description: string }> = {
  "/payments": {
    title: "Pagamentos",
    resource: "payments",
    description: "Recibos oficiais emitidos no SIGA e respetivo estado.",
  },
  "/charges": {
    title: "Cobranças e faturas",
    resource: "invoices",
    description: "Faturas abertas, vencidas, pagas ou canceladas.",
  },
  "/students": {
    title: "Estudantes",
    resource: "students",
    description: "Visão financeira por estudante, com acesso ao histórico individual.",
  },
  "/transactions": {
    title: "Transações",
    resource: "transactions",
    description: "Ciclo de vida completo das transações PayFlow.",
  },
  "/refunds": {
    title: "Reembolsos",
    resource: "refunds",
    description: "Pedidos e processamento de reembolsos sem apagar o histórico.",
  },
  "/receivables": {
    title: "Contas a receber",
    resource: "receivables",
    description: "Faturas por liquidar e exposição financeira.",
  },
  "/payment-plans": {
    title: "Planos de pagamento",
    resource: "payment-plans",
    description: "Planos, referências e canais associados às faturas.",
  },
  "/notifications": {
    title: "Notificações",
    resource: "notifications",
    description: "Entrega de avisos de pagamento por portal, e-mail, SMS e WhatsApp.",
  },
  "/audit": {
    title: "Auditoria",
    resource: "audit",
    description: "Registo imutável das ações financeiras e operacionais do PayFlow.",
  },
  "/webhooks": {
    title: "Webhooks",
    resource: "webhooks",
    description: "Eventos externos, idempotência, tentativas e falhas.",
  },
};

export function AdminApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [path, setPath] = useState(() => window.location.pathname || "/dashboard");

  useEffect(() => {
    void getPayflowSession().then((next) => {
      setSession(next);
      setAuthReady(true);
    });
    const subscription = payflowSupabase?.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthReady(true);
    });
    const pop = () => setPath(window.location.pathname || "/dashboard");
    window.addEventListener("popstate", pop);
    return () => {
      subscription?.data.subscription.unsubscribe();
      window.removeEventListener("popstate", pop);
    };
  }, []);

  function navigate(next: string) {
    if (window.location.pathname === next) return;
    window.history.pushState({}, "", next);
    setPath(next);
  }

  if (!authReady) return <Loading label="A validar sessão PayFlow…" />;
  if (!session) return <Login />;

  const routePath = path === "/" ? "/dashboard" : path;
  return (
    <div className="pf-admin">
      <aside className="pf-sidebar">
        <div className="pf-side-brand">
          <span className="pf-side-mark">P</span>
          <div><b>PayFlow</b><small>by SIGA Plus</small></div>
        </div>
        <nav>
          {NAV.map(([label, href, icon]) => (
            <a
              key={href}
              href={href}
              className={routePath === href || (href !== "/dashboard" && routePath.startsWith(href + "/")) ? "active" : ""}
              onClick={(event) => {
                event.preventDefault();
                navigate(href);
              }}
            >
              <span>{icon}</span>{label}
            </a>
          ))}
        </nav>
        <div className="pf-side-foot">
          <button onClick={() => void signOutPayflow()}>Terminar sessão</button>
          <small>Dados financeiros reais · sem modo demo</small>
        </div>
      </aside>

      <main className="pf-main">
        <header className="pf-admin-top">
          <div>
            <span className="pf-kicker">SIGA Plus · Finance</span>
            <b>PayFlow Connect</b>
          </div>
          <span className="pf-live"><i /> Produção preparada</span>
        </header>

        {routePath === "/dashboard" ? <Dashboard session={session} navigate={navigate} /> : null}
        {routePath === "/reconciliation" ? <Reconciliation session={session} /> : null}
        {routePath === "/reports" ? <Reports session={session} /> : null}
        {routePath === "/settings" ? <SettingsHome navigate={navigate} /> : null}
        {routePath === "/settings/payment-methods" ? <PaymentMethods session={session} /> : null}
        {routePath === "/settings/integrations" ? <Integrations session={session} /> : null}
        {/^\/students\/[^/]+\/finance\/?$/.test(routePath) ? (
          <StudentFinance
            session={session}
            studentId={routePath.split("/")[2] || ""}
            navigate={navigate}
          />
        ) : null}
        {/^\/payments\/[^/]+\/?$/.test(routePath) ? (
          <RecordDetail
            session={session}
            resource="payments"
            id={routePath.split("/")[2] || ""}
            title="Detalhe do pagamento"
            navigate={navigate}
          />
        ) : null}
        {/^\/transactions\/[^/]+\/?$/.test(routePath) ? (
          <RecordDetail
            session={session}
            resource="transactions"
            id={routePath.split("/")[2] || ""}
            title="Detalhe da transação"
            navigate={navigate}
          />
        ) : null}
        {RESOURCE_BY_PATH[routePath] ? (
          <ResourcePage
            session={session}
            {...RESOURCE_BY_PATH[routePath]}
            navigate={navigate}
          />
        ) : null}
      </main>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!payflowSupabase) {
    return (
      <div className="pf-login-shell">
        <section className="pf-login-card">
          <Brand />
          <h1>PayFlow não configurado</h1>
          <p>Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.</p>
        </section>
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInPayflow(email.trim(), password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar sessão.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pf-login-shell">
      <section className="pf-login-card">
        <Brand />
        <span className="pf-kicker">Acesso institucional</span>
        <h1>Entre no PayFlow</h1>
        <p>Use a mesma conta autorizada no SIGA Plus.</p>
        <form onSubmit={submit}>
          <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Palavra-passe<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {error ? <div className="pf-alert error">{error}</div> : null}
          <button className="pf-primary" disabled={busy}>{busy ? "A entrar…" : "Entrar"}</button>
        </form>
        <small>O PayFlow respeita as permissões finance.* e a sessão AAL2/2FA do SIGA.</small>
      </section>
    </div>
  );
}

function Dashboard({ session, navigate }: { session: Session; navigate: (path: string) => void }) {
  const [data, setData] = useState<PayflowOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetchOverview(session).then(setData).catch((e) => setError(e instanceof Error ? e.message : "Erro"));
  }, [session]);
  if (error) return <ErrorPanel message={error} />;
  if (!data) return <Loading label="A carregar o painel financeiro…" />;

  const cards = [
    ["Total processado", money(data.settledAmount), "Liquidações com recibo oficial"],
    ["Checkouts", data.checkouts, "Checkouts criados nesta escola"],
    ["Pendentes", data.pending, "Aguardam pagamento ou finalização"],
    ["Reconciliação", data.reconciliationQueue, "Comprovativos/movimentos a rever"],
    ["Transações", data.transactions, "Histórico PayFlow"],
    ["Reembolsos", data.refundsOpen, "Pedidos ainda abertos"],
  ];
  return (
    <section className="pf-page">
      <PageHead
        eyebrow="Visão geral"
        title="Dinheiro em movimento, sem perder o controlo."
        description="Saldo operacional do PayFlow ligado ao financeiro real do SIGA Plus."
        action={<button className="pf-primary slim" onClick={() => navigate("/charges")}>Nova cobrança</button>}
      />
      <div className="pf-metric-grid">
        {cards.map(([label, value, hint]) => (
          <article className="pf-metric" key={String(label)}>
            <span>{label}</span><strong>{value}</strong><small>{hint}</small>
          </article>
        ))}
      </div>
      <div className="pf-panel-grid">
        <article className="pf-panel">
          <h3>Prioridade operacional</h3>
          <p>Confirme primeiro as transferências conciliadas e emita os recibos oficiais antes de tratar tarefas secundárias.</p>
          <button className="pf-link-button" onClick={() => navigate("/reconciliation")}>Abrir reconciliação →</button>
        </article>
        <article className="pf-panel">
          <h3>Integridade financeira</h3>
          <ul>
            <li>Comprovativo não equivale a pagamento.</li>
            <li>Movimento bancário não pode ser reutilizado.</li>
            <li>Recibo oficial exige liquidação atómica no SIGA.</li>
          </ul>
        </article>
      </div>
    </section>
  );
}

function ResourcePage({
  session,
  title,
  resource,
  description,
  navigate,
}: {
  session: Session;
  title: string;
  resource: string;
  description: string;
  navigate: (path: string) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    void fetchResource(session, resource, 150)
      .then((result) => setRows(result.rows))
      .catch((e) => setError(e instanceof Error ? e.message : "Não foi possível carregar."));
  }, [session, resource, refresh]);

  const actions =
    resource === "invoices" ? (
      <CreateCheckoutButton session={session} onDone={() => setRefresh((v) => v + 1)} />
    ) : undefined;

  if (error) return <ErrorPanel message={error} />;
  if (!rows) return <Loading label={"A carregar " + title.toLowerCase() + "…"} />;

  return (
    <section className="pf-page">
      <PageHead eyebrow="PayFlow" title={title} description={description} action={actions} />
      <DataTable
        rows={rows}
        onRow={
          resource === "payments"
            ? (row) => navigate("/payments/" + row["id"])
            : resource === "transactions"
              ? (row) => navigate("/transactions/" + row["id"])
              : resource === "students"
                ? (row) => navigate("/students/" + row["id"] + "/finance")
                : undefined
        }
      />
    </section>
  );
}

function Reconciliation({ session }: { session: Session }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const result = await fetchResource(session, "reconciliation", 150);
      setRows(result.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro de reconciliação.");
    }
  }
  useEffect(() => { void load(); }, [session]);

  async function verify(row: Row) {
    const txId = window.prompt("ID do movimento bancário:");
    if (!txId) return;
    const amount = window.prompt("Montante observado no banco:", String(row["expected_amount"] ?? ""));
    if (!amount) return;
    const reference = window.prompt("Referência observada no banco:", String(row["reference"] ?? ""));
    if (!reference) return;
    setBusyId(String(row["id"]));
    try {
      await runAction(session, "verify-transfer", {
        transferId: row["id"],
        bankTransactionId: txId,
        amount: Number(amount.replace(",", ".")),
        reference,
        postedAt: new Date().toISOString(),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível conciliar.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="pf-page">
      <PageHead
        eyebrow="Operações"
        title="Reconciliação bancária"
        description="Compare movimento, referência e montante. O comprovativo isolado nunca liquida a fatura."
      />
      {error ? <ErrorPanel message={error} /> : null}
      {!rows ? <Loading label="A carregar a fila de reconciliação…" /> : (
        <div className="pf-review-list">
          {rows.length === 0 ? <Empty label="Nenhuma transferência pendente." /> : rows.map((row) => (
            <article className="pf-review" key={String(row["id"])}>
              <div><span className="pf-status">{String(row["status"] ?? "")}</span><h3>{String(row["reference"] ?? "")}</h3><p>{money(row["expected_amount"])} · criado {dateValue(row["created_at"])}</p></div>
              <div className="pf-review-meta"><span>Comprovativo</span><b>{row["proof_received_at"] ? "Recebido" : "Não enviado"}</b><span>Movimento bancário</span><b>{String(row["bank_transaction_id"] ?? "—")}</b></div>
              <button className="pf-primary slim" disabled={busyId === row["id"] || row["status"] === "verified"} onClick={() => void verify(row)}>
                {row["status"] === "verified" ? "Conciliado" : busyId === row["id"] ? "A validar…" : "Conciliar"}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Reports({ session }: { session: Session }) {
  const [report, setReport] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetchResource<Row>(session, "reports", 1)
      .then((result) => setReport((result as unknown as { rows?: Row[] }).rows?.[0] ?? (result as unknown as Row)))
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar relatórios."));
  }, [session]);

  // The reports endpoint returns a summary object, not a rows array. Fall back to a direct request via generic response is handled below.
  useEffect(() => {
    const base = (import.meta.env.VITE_PAYFLOW_API_BASE || "").replace(/\/$/, "");
    const run = async () => {
      const headers = new Headers({ Authorization: "Bearer " + session.access_token });
      const school = localStorage.getItem("siga:payflow:school-id");
      if (school) headers.set("X-SIGA-School-ID", school);
      const res = await fetch(base + "/api/payflow/admin/data?resource=reports", { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao carregar relatórios.");
      setReport(data);
    };
    void run().catch((e) => setError(e instanceof Error ? e.message : "Erro"));
  }, [session]);

  if (error) return <ErrorPanel message={error} />;
  if (!report) return <Loading label="A calcular indicadores reais…" />;
  const cards = [
    ["Recebido", money(report["settled"])],
    ["Reembolsado", money(report["refunded"])],
    ["Líquido", money(report["net"])],
    ["A receber", money(report["receivable"])],
    ["Vencido", money(report["overdue"])],
  ];
  return (
    <section className="pf-page">
      <PageHead eyebrow="Inteligência financeira" title="Relatórios" description="Indicadores calculados sobre transações e faturas reais, sem números simulados." />
      <div className="pf-metric-grid">{cards.map(([label, value]) => <article className="pf-metric" key={label}><span>{label}</span><strong>{value}</strong><small>AOA · fonte SIGA/PayFlow</small></article>)}</div>
    </section>
  );
}

function SettingsHome({ navigate }: { navigate: (path: string) => void }) {
  return (
    <section className="pf-page">
      <PageHead eyebrow="Configuração" title="Configurações do PayFlow" description="Métodos de pagamento e integrações ficam separados de segredos do browser." />
      <div className="pf-settings-grid">
        <button onClick={() => navigate("/settings/payment-methods")}><b>Métodos de pagamento</b><span>Contas bancárias, IBAN e conta principal.</span></button>
        <button onClick={() => navigate("/settings/integrations")}><b>Integrações</b><span>EMIS, Multicaixa e provedores configurados no SIGA.</span></button>
      </div>
    </section>
  );
}

function PaymentMethods({ session }: { session: Session }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [form, setForm] = useState({ label: "Conta principal", bankName: "", accountHolder: "", iban: "", swift: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const result = await fetchResource(session, "bank-accounts", 50);
      setRows(result.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar contas.");
    }
  }
  useEffect(() => { void load(); }, [session]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      await runAction(session, "save-bank-account", { ...form, isDefault: true, isActive: true });
      setForm({ label: "Conta principal", bankName: "", accountHolder: "", iban: "", swift: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível guardar.");
    } finally { setBusy(false); }
  }

  return (
    <section className="pf-page">
      <PageHead eyebrow="Configurações" title="Métodos de pagamento" description="A transferência por IBAN usa apenas contas ativas guardadas no servidor." />
      {error ? <ErrorPanel message={error} /> : null}
      <div className="pf-panel-grid">
        <article className="pf-panel">
          <h3>Contas bancárias</h3>
          {!rows ? <p>A carregar…</p> : rows.length === 0 ? <p>Nenhuma conta configurada.</p> : rows.map((row) => (
            <div className="pf-bank" key={String(row["id"])}><div><b>{String(row["label"])}</b><span>{String(row["bank_name"])} · {String(row["account_holder"])}</span><code>{String(row["iban"])}</code></div>{row["is_default"] ? <span className="pf-status">Principal</span> : null}</div>
          ))}
        </article>
        <article className="pf-panel">
          <h3>Adicionar conta</h3>
          <form className="pf-form" onSubmit={save}>
            <label>Nome<input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required /></label>
            <label>Banco<input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} required /></label>
            <label>Titular<input value={form.accountHolder} onChange={(e) => setForm({ ...form, accountHolder: e.target.value })} required /></label>
            <label>IBAN<input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} required /></label>
            <label>SWIFT<input value={form.swift} onChange={(e) => setForm({ ...form, swift: e.target.value })} /></label>
            <button className="pf-primary" disabled={busy}>{busy ? "A guardar…" : "Guardar conta"}</button>
          </form>
        </article>
      </div>
    </section>
  );
}

function Integrations({ session }: { session: Session }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetchResource(session, "integrations", 100)
      .then((result) => setRows(result.rows))
      .catch((e) => setError(e instanceof Error ? e.message : "Erro"));
  }, [session]);
  return (
    <section className="pf-page">
      <PageHead eyebrow="Configurações" title="Integrações de pagamento" description="A interface nunca devolve tokens, segredos, passwords ou API keys." />
      {error ? <ErrorPanel message={error} /> : null}
      {!rows ? <Loading label="A carregar integrações…" /> : (
        <div className="pf-card-list">
          {rows.length === 0 ? <Empty label="Nenhuma integração configurada." /> : rows.map((row) => (
            <article className="pf-integration" key={String(row["id"])}>
              <div><b>{String(row["provider"])}</b><span>{String(row["status"])}</span></div>
              <pre>{JSON.stringify(row["config"] ?? {}, null, 2)}</pre>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function StudentFinance({ session, studentId, navigate }: { session: Session; studentId: string; navigate: (path: string) => void }) {
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const base = (import.meta.env.VITE_PAYFLOW_API_BASE || "").replace(/\/$/, "");
    const run = async () => {
      const headers = new Headers({ Authorization: "Bearer " + session.access_token });
      const school = localStorage.getItem("siga:payflow:school-id");
      if (school) headers.set("X-SIGA-School-ID", school);
      const res = await fetch(base + "/api/payflow/admin/data?resource=student-finance&studentId=" + encodeURIComponent(studentId), { headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Não foi possível carregar o aluno.");
      setData(body);
    };
    void run().catch((e) => setError(e instanceof Error ? e.message : "Erro"));
  }, [session, studentId]);
  if (error) return <ErrorPanel message={error} />;
  if (!data) return <Loading label="A carregar histórico financeiro do estudante…" />;

  return (
    <section className="pf-page">
      <button className="pf-back" onClick={() => navigate("/students")}>← Estudantes</button>
      <PageHead eyebrow="Estudante" title={String(data["fullName"] ?? "Histórico financeiro")} description={"Processo " + String(data["studentNumber"] ?? "—")} />
      <div className="pf-metric-grid">
        <article className="pf-metric"><span>Faturado</span><strong>{money(data["billed"])}</strong><small>Total histórico</small></article>
        <article className="pf-metric"><span>Recebido</span><strong>{money(data["paid"])}</strong><small>Recibos não anulados</small></article>
        <article className="pf-metric"><span>Em dívida</span><strong>{money(data["outstanding"])}</strong><small>Saldo atual</small></article>
      </div>
      <h3 className="pf-section-title">Faturas</h3>
      <DataTable rows={(data["invoices"] as Row[]) ?? []} />
      <h3 className="pf-section-title">Pagamentos</h3>
      <DataTable rows={(data["payments"] as Row[]) ?? []} onRow={(row) => navigate("/payments/" + row["id"])} />
    </section>
  );
}

function RecordDetail({ session, resource, id, title, navigate }: { session: Session; resource: string; id: string; title: string; navigate: (path: string) => void }) {
  const [row, setRow] = useState<Row | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetchResource(session, resource, 200)
      .then((result) => setRow(result.rows.find((item) => String(item["id"]) === id) ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : "Erro"));
  }, [session, resource, id]);
  if (error) return <ErrorPanel message={error} />;
  if (row === undefined) return <Loading label="A carregar detalhe…" />;
  if (row === null) return <ErrorPanel message="Registo não encontrado nesta escola." />;

  return (
    <section className="pf-page">
      <button className="pf-back" onClick={() => navigate(resource === "payments" ? "/payments" : "/transactions")}>← Voltar</button>
      <PageHead eyebrow="Detalhe" title={title} description={"ID " + id} />
      <div className="pf-detail-grid">
        {Object.entries(row).map(([key, value]) => (
          <div key={key}><span>{prettyKey(key)}</span><b>{displayValue(key, value)}</b></div>
        ))}
      </div>
      {resource === "transactions" && row["status"] === "verified" ? (
        <FinalizeButton session={session} transactionId={id} />
      ) : null}
      {resource === "transactions" && ["settled", "partial_refund"].includes(String(row["status"])) ? (
        <RefundButton session={session} transaction={row} />
      ) : null}
    </section>
  );
}

function FinalizeButton({ session, transactionId }: { session: Session; transactionId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!window.confirm("Emitir o recibo oficial desta transação conciliada?")) return;
    setBusy(true);
    try {
      const result = await runAction<{ receiptNumber?: string }>(session, "finalize-transaction", { transactionId });
      setMessage("Recibo oficial emitido: " + String(result.receiptNumber ?? ""));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha na liquidação.");
    } finally { setBusy(false); }
  }
  return <div className="pf-action-box"><button className="pf-primary" disabled={busy} onClick={() => void run()}>{busy ? "A emitir…" : "Emitir recibo oficial"}</button>{message ? <p>{message}</p> : null}</div>;
}

function RefundButton({ session, transaction }: { session: Session; transaction: Row }) {
  const [busy, setBusy] = useState(false);
  async function run() {
    const amount = window.prompt("Montante a reembolsar:", String(transaction["amount"] ?? ""));
    if (!amount) return;
    const reason = window.prompt("Motivo do reembolso:");
    if (!reason) return;
    setBusy(true);
    try {
      await runAction(session, "request-refund", {
        transactionId: transaction["id"],
        amount: Number(amount.replace(",", ".")),
        reason,
      });
      window.alert("Pedido de reembolso registado. O histórico financeiro foi preservado.");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao pedir reembolso.");
    } finally { setBusy(false); }
  }
  return <div className="pf-action-box"><button className="pf-secondary" disabled={busy} onClick={() => void run()}>{busy ? "A registar…" : "Solicitar reembolso"}</button></div>;
}

function CreateCheckoutButton({ session, onDone }: { session: Session; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function create() {
    const invoiceId = window.prompt("ID da fatura (UUID):");
    if (!invoiceId) return;
    const amountRaw = window.prompt("Montante do checkout (AOA):");
    if (!amountRaw) return;
    const title = window.prompt("Descrição da cobrança:", "Pagamento escolar");
    if (!title) return;
    setBusy(true);
    try {
      const result = await runAction<{ checkoutUrl?: string }>(session, "create-checkout", {
        invoiceId,
        amount: Number(amountRaw.replace(",", ".")),
        title,
        sourceType: "invoice",
        items: [{ label: title, amount: Number(amountRaw.replace(",", ".")) }],
      });
      onDone();
      if (result.checkoutUrl) {
        await navigator.clipboard.writeText(result.checkoutUrl);
        window.alert("Checkout criado. Link copiado:\n" + result.checkoutUrl);
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Não foi possível criar o checkout.");
    } finally { setBusy(false); }
  }
  return <button className="pf-primary slim" disabled={busy} onClick={() => void create()}>{busy ? "A criar…" : "Criar checkout"}</button>;
}

function DataTable({ rows, onRow }: { rows: Row[]; onRow?: (row: Row) => void }) {
  const columns = useMemo(() => {
    const priority = ["receipt_number", "invoice_number", "student_number", "full_name", "title", "reference", "amount", "status", "payment_method", "method", "due_date", "paid_on", "created_at"];
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((key) => !["metadata", "config", "person"].includes(key));
    return [...priority.filter((key) => keys.includes(key)), ...keys.filter((key) => !priority.includes(key))].slice(0, 8);
  }, [rows]);

  if (rows.length === 0) return <Empty label="Ainda não existem registos nesta área." />;
  return (
    <div className="pf-table-wrap">
      <table className="pf-table"><thead><tr>{columns.map((column) => <th key={column}>{prettyKey(column)}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => (
          <tr key={String(row["id"] ?? index)} className={onRow ? "clickable" : ""} onClick={() => onRow?.(row)}>
            {columns.map((column) => <td key={column}>{displayValue(column, row[column])}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function displayValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (/amount|total|billed|paid|outstanding|penalty|discount/i.test(key) && typeof value !== "boolean") return money(value);
  if (/date|_at$|paid_on|due_on/i.test(key)) return dateValue(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function prettyKey(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function PageHead({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="pf-page-head"><div><span className="pf-kicker">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action ? <div>{action}</div> : null}</div>;
}

function Brand() {
  return <div className="pf-brand"><span>P</span><div><b>PayFlow</b><small>by SIGA Plus</small></div></div>;
}
function Loading({ label }: { label: string }) { return <div className="pf-state"><span className="pf-spinner" /><p>{label}</p></div>; }
function Empty({ label }: { label: string }) { return <div className="pf-empty"><b>Sem dados</b><p>{label}</p></div>; }
function ErrorPanel({ message }: { message: string }) { return <div className="pf-alert error"><b>Não foi possível concluir</b><p>{message}</p></div>; }
