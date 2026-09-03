import { useEffect, useMemo, useState } from "react";
import {
  createBankTransfer,
  getCheckout,
  getCheckoutStatus,
  uploadTransferProof,
  type BankTransferInstructions,
  type Checkout,
  type CheckoutStatus,
} from "./payflow-api";

function checkoutIdFromPath(): string | null {
  const match = window.location.pathname.match(/^\/checkout\/([^/]+)\/?$/);
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("pt-AO", {
    style: "currency",
    currency: currency.toUpperCase() === "KZ" ? "AOA" : currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function dateTime(value?: string): string | null {
  if (!value) return null;
  const valueDate = new Date(value);
  if (Number.isNaN(valueDate.getTime())) return null;
  return new Intl.DateTimeFormat("pt-AO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(valueDate);
}

function statusText(status: CheckoutStatus): string {
  const labels: Record<CheckoutStatus, string> = {
    open: "Pronto para pagamento",
    pending: "Aguardando transferência",
    under_review: "Pagamento em validação",
    paid: "Pagamento confirmado",
    failed: "Falha no pagamento",
    expired: "Checkout expirado",
    cancelled: "Pagamento cancelado",
  };
  return labels[status];
}

export function App() {
  const checkoutId = useMemo(checkoutIdFromPath, []);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [transfer, setTransfer] = useState<BankTransferInstructions | null>(null);
  const [status, setStatus] = useState<CheckoutStatus>("open");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!checkoutId) return;
    let active = true;
    setBusy(true);
    getCheckout(checkoutId)
      .then((data) => {
        if (!active) return;
        setCheckout(data);
        setStatus(data.status);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Checkout indisponível.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [checkoutId]);

  async function startTransfer() {
    if (!checkoutId) return;
    setBusy(true);
    setError(null);
    try {
      const data = await createBankTransfer(checkoutId);
      setTransfer(data);
      setStatus(data.status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar a transferência.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshStatus() {
    if (!checkoutId) return;
    setBusy(true);
    setError(null);
    try {
      const data = await getCheckoutStatus(checkoutId);
      setStatus(data.status);
      setCheckout((current) =>
        current
          ? {
              ...current,
              status: data.status,
              receiptUrl: data.receiptUrl || current.receiptUrl,
            }
          : current,
      );
      if (data.message) setNotice(data.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível verificar o pagamento.");
    } finally {
      setBusy(false);
    }
  }

  async function submitProof() {
    if (!checkoutId || !transfer || !proofFile) return;
    setBusy(true);
    setError(null);
    try {
      const data = await uploadTransferProof(checkoutId, transfer.transferId, proofFile);
      setStatus(data.status);
      setNotice(
        data.message ||
          "Comprovativo recebido. O pagamento continua pendente até ser conciliado ou aprovado.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar o comprovativo.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  if (!checkoutId) {
    return <StateCard title="PayFlow" message="Este endereço não contém um checkout válido." />;
  }

  if (busy && !checkout) {
    return <StateCard title="PayFlow" message="A preparar o pagamento…" loading />;
  }

  if (!checkout) {
    return (
      <StateCard
        title="Checkout indisponível"
        message={error || "Verifique o endereço ou tente novamente."}
      />
    );
  }

  const total = transfer ? transfer.amount : checkout.amount;
  const currency = transfer ? transfer.currency : checkout.currency;
  const expires = dateTime(transfer ? transfer.expiresAt : checkout.expiresAt);
  const paid = status === "paid";

  return (
    <main className="shell">
      <div className="frame">
        <header className="topbar">
          <Brand />
          <span className="secure"><i /> Ambiente seguro</span>
        </header>

        <div className="checkout">
          <section className="summary">
            <div className="merchant">
              <div className="avatar">
                {checkout.merchantLogoUrl ? (
                  <img src={checkout.merchantLogoUrl} alt="" />
                ) : (
                  checkout.merchantName.slice(0, 1).toUpperCase()
                )}
              </div>
              <div>
                <span className="overline">Pagamento para</span>
                <h1>{checkout.merchantName}</h1>
                {checkout.schoolName ? <p>{checkout.schoolName}</p> : null}
              </div>
            </div>

            <div className="total">
              <span className="overline">Total</span>
              <strong>{money(total, currency)}</strong>
              <h2>{checkout.title}</h2>
              {checkout.description ? <p>{checkout.description}</p> : null}
            </div>

            {checkout.lineItems.length ? (
              <div className="items">
                {checkout.lineItems.map((item) => (
                  <div className="item" key={item.id}>
                    <div>
                      <b>{item.label}</b>
                      {item.description ? <small>{item.description}</small> : null}
                    </div>
                    <b>{money(item.amount, checkout.currency)}</b>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="meta"><span>Estado</span><b>{statusText(status)}</b></div>
            {expires ? <div className="meta"><span>Válido até</span><b>{expires}</b></div> : null}

            <footer><span>Processado por PayFlow</span><span>Integrado ao SIGA Plus</span></footer>
          </section>

          <section className="payment">
            <span className="overline dark">Método de pagamento</span>
            <h2>Transferência bancária</h2>
            <p className="lead">
              Gere uma referência única, transfira o valor exacto e acompanhe a validação.
            </p>

            <div className="method selected">
              <div className="methodIcon">↗</div>
              <div><b>Transferência por IBAN</b><small>Disponível agora</small></div>
              <span className="radio" />
            </div>

            <div className="method muted">
              <div className="methodIcon">M</div>
              <div>
                <b>Multicaixa Express</b>
                <small>Será activado quando as credenciais EMIS estiverem configuradas.</small>
              </div>
              <span className="soon">Em breve</span>
            </div>

            {error ? <div className="alert error">{error}</div> : null}

            {!transfer && !paid ? (
              <button className="primary" disabled={busy} onClick={startTransfer}>
                {busy ? "A gerar instruções…" : "Continuar · " + money(total, currency)}
              </button>
            ) : null}

            {transfer && !paid ? (
              <div className="transfer">
                <div className="transferHead">
                  <div><span className="overline dark">Instruções bancárias</span><h3>Faça a transferência</h3></div>
                  <span className="pill">{statusText(status)}</span>
                </div>

                <CopyRow label="Banco" value={transfer.bankName} copied={copied} copy={copy} />
                <CopyRow label="Titular" value={transfer.accountHolder} copied={copied} copy={copy} />
                <CopyRow label="IBAN" value={transfer.iban} copied={copied} copy={copy} mono />
                <CopyRow
                  label="Referência"
                  value={transfer.reference}
                  copied={copied}
                  copy={copy}
                  mono
                  strong
                />

                <div className="exact"><span>Valor exacto</span><b>{money(transfer.amount, transfer.currency)}</b></div>

                <div className="alert">
                  Use exactamente a referência acima. O comprovativo não confirma o pagamento por
                  si só; a confirmação depende da conciliação bancária ou de revisão autorizada.
                </div>

                <label className="upload">
                  <b>Comprovativo de transferência</b>
                  <small>PDF, JPG ou PNG. Opcional.</small>
                  <input
                    type="file"
                    accept=".pdf,image/jpeg,image/png"
                    onChange={(event) => setProofFile(event.target.files?.[0] || null)}
                  />
                  <span>{proofFile ? proofFile.name : "Escolher ficheiro"}</span>
                </label>

                {notice ? <div className="alert success">{notice}</div> : null}

                <div className="actions">
                  <button className="secondary" disabled={busy || !proofFile} onClick={submitProof}>
                    Enviar comprovativo
                  </button>
                  <button className="primary compact" disabled={busy} onClick={refreshStatus}>
                    {busy ? "A verificar…" : "Verificar pagamento"}
                  </button>
                </div>
              </div>
            ) : null}

            {paid ? (
              <div className="paid">
                <div className="check">✓</div>
                <span className="overline dark">Pagamento confirmado</span>
                <h2>{money(checkout.amount, checkout.currency)}</h2>
                <p>A transferência foi validada e o pagamento está concluído.</p>
                {checkout.receiptUrl ? (
                  <a className="primary link" href={checkout.receiptUrl} target="_blank" rel="noreferrer">
                    Abrir recibo
                  </a>
                ) : null}
              </div>
            ) : null}

            <div className="trust"><span>🔒 Ligação protegida</span><span>Referência única</span><span>Auditoria financeira</span></div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Brand() {
  return (
    <div className="brand">
      <div className="mark">P</div>
      <div><b>PayFlow</b><span>by SIGA Plus</span></div>
    </div>
  );
}

function StateCard({
  title,
  message,
  loading = false,
}: {
  title: string;
  message: string;
  loading?: boolean;
}) {
  return (
    <main className="shell centered">
      <section className="state">
        <Brand />
        {loading ? <div className="spinner" /> : null}
        <h1>{title}</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}

function CopyRow({
  label,
  value,
  copied,
  copy,
  mono = false,
  strong = false,
}: {
  label: string;
  value: string;
  copied: string | null;
  copy: (label: string, value: string) => void;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div className={"copyRow" + (strong ? " strong" : "")}>
      <div><span>{label}</span><b className={mono ? "mono" : ""}>{value}</b></div>
      <button onClick={() => copy(label, value)}>{copied === label ? "Copiado" : "Copiar"}</button>
    </div>
  );
}
