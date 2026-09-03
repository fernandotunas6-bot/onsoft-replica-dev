import { useEffect, useMemo, useState } from "react";
import { getCheckout, getCheckoutStatus, type Checkout } from "./payflow-api";

function tokenFromPath() {
  const match = window.location.pathname.match(/^\/portal\/([^/]+)\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("pt-AO", {
    style: "currency",
    currency: currency === "KZ" ? "AOA" : currency,
    maximumFractionDigits: 2,
  }).format(value);

export function PortalApp() {
  const token = useMemo(tokenFromPath, []);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("A carregar o seu pagamento…");

  useEffect(() => {
    if (!token) {
      setMessage("Portal inválido.");
      return;
    }
    void getCheckout(token)
      .then(async (data) => {
        setCheckout(data);
        const status = await getCheckoutStatus(token);
        setReceiptUrl(status.receiptUrl ?? data.receiptUrl ?? null);
        setReceiptNumber(status.receiptNumber ?? null);
        setMessage(status.message ?? "");
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "Não foi possível abrir o portal.");
      });
  }, [token]);

  if (!checkout) {
    return (
      <main className="shell shell-centered">
        <section className="empty-card">
          <div className="brand"><div className="brand-mark">P</div><div><strong>PayFlow</strong><span>Portal do pagador</span></div></div>
          <h1>O seu pagamento</h1>
          <p>{message}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell shell-centered">
      <section className="empty-card" style={{ width: "min(620px, 100%)" }}>
        <div className="brand"><div className="brand-mark">P</div><div><strong>PayFlow</strong><span>Portal do pagador</span></div></div>
        <p className="eyebrow" style={{ marginTop: 30 }}>Pagamento para</p>
        <h1>{checkout.merchantName}</h1>
        <div className="amount-box" style={{ marginTop: 22 }}>
          <span>{checkout.title}</span>
          <strong>{money(checkout.amount, checkout.currency)}</strong>
        </div>
        <div className="summary-row" style={{ color: "#667085" }}>
          <span>Estado</span><strong style={{ color: "#101828" }}>{checkout.status}</strong>
        </div>
        {receiptNumber ? (
          <div className="summary-row" style={{ color: "#667085" }}>
            <span>Recibo</span><strong style={{ color: "#101828" }}>{receiptNumber}</strong>
          </div>
        ) : null}
        {message ? <div className="notice">{message}</div> : null}
        {receiptUrl ? (
          <a className="primary-button link-button" href={receiptUrl} target="_blank" rel="noreferrer">
            Abrir recibo oficial
          </a>
        ) : (
          <a className="primary-button link-button" href={"/checkout/" + checkout.id}>
            Abrir checkout
          </a>
        )}
      </section>
    </main>
  );
}
