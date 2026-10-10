import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { toastActionError } from "@/lib/action-error-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import {
  getSchoolSettings,
  updateSchoolAgt,
  updateSchoolBanking,
  type SchoolSettingsBundle,
} from "@/features/school/server";
import { AGT_NIF_PORTAL_URL } from "@/lib/angola-identity";
import {
  angolaBankLabelFromIban,
  formatAngolaIban,
  validateAngolaIban,
} from "@/lib/angola-banking";
import { DOC_PATHS, getDocUrl } from "@/lib/ecosystem-urls";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import {
  BillingParametersSummary,
  BillingSettingsForm,
  FeePlanSettingsForm,
} from "./settings-billing-panel";
import { PayflowBankSyncButton } from "@/features/finance/components/PayflowBankSyncButton";
import { syncSchoolBankToPayflow } from "@/features/finance/server";

export function FinancePanel() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h5 className="text-xs font-bold text-muted-foreground">Propinas e taxas</h5>
        <FeePlanSettingsForm />
      </div>
      <Separator />
      <InstalledModuleTools module="financeiro" />
      <InstalledModuleTools module="faturas" />
      <div className="space-y-3">
        <h5 className="text-xs font-bold text-muted-foreground">Parâmetros activos</h5>
        <BillingParametersSummary />
      </div>
      <Separator />
      <div className="space-y-3">
        <h5 className="text-xs font-bold text-muted-foreground">Conta bancária (Angola)</h5>
        <SchoolBankingForm />
      </div>
      <Separator />
      <div className="space-y-3">
        <h5 className="text-xs font-bold text-muted-foreground">AGT — facturação electrónica</h5>
        <SchoolAgtForm />
      </div>
      <Separator />
      <div className="space-y-3">
        <h5 className="text-xs font-bold text-muted-foreground">Regras de cobrança</h5>
        <BillingSettingsForm />
      </div>
    </div>
  );
}

function SchoolBankingForm() {
  const currentUser = useCurrentAccount();
  const queryClient = useQueryClient();
  const canEdit = currentUser.role === "Administrador" || currentUser.role === "Tesouraria";
  const schoolQuery = useQuery({
    queryKey: ["school", "settings"],
    queryFn: () => getSchoolSettings() as Promise<SchoolSettingsBundle>,
    staleTime: 5 * 60_000,
  });
  const banking = schoolQuery.data?.banking;
  const [bankName, setBankName] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [iban, setIban] = useState("");
  const [swift, setSwift] = useState("");
  const [merchant, setMerchant] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!banking) return;
    setBankName(banking.bank_name ?? "");
    setAccountHolder(banking.account_holder ?? "");
    setIban(banking.iban ? formatAngolaIban(banking.iban) : "");
    setSwift(banking.swift ?? "");
    setMerchant(banking.multicaixa_merchant ?? "");
  }, [banking]);

  const bankLabel = iban.trim() ? angolaBankLabelFromIban(iban) : null;

  const save = async () => {
    const checked = validateAngolaIban(iban);
    if (!checked.ok) {
      toast.error(checked.error ?? "IBAN inválido.");
      return;
    }
    setSaving(true);
    try {
      const data = await updateSchoolBanking({
        data: {
          bankName: bankName.trim(),
          accountHolder: accountHolder.trim(),
          iban: checked.compact ?? iban,
          swift: swift.trim(),
          multicaixaMerchant: merchant.trim(),
        },
      });
      queryClient.setQueryData(["school", "settings"], (prev: unknown) =>
        prev && typeof prev === "object" ? { ...prev, banking: data } : prev,
      );
      toast.success("Dados bancários guardados.");
      try {
        const synced = await syncSchoolBankToPayflow();
        toast.message(
          synced.ibanMasked
            ? `PayFlow actualizado (${synced.ibanMasked})`
            : "IBAN enviado ao PayFlow.",
        );
      } catch (syncError) {
        toast.message(
          syncError instanceof Error
            ? `Guardado no SIGA; PayFlow: ${syncError.message}`
            : "Guardado no SIGA; PayFlow não sincronizado.",
        );
      }
    } catch (error) {
      toastActionError(error, "Não foi possível guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="bank-holder">Titular da conta</Label>
        <Input
          id="bank-holder"
          value={accountHolder}
          onChange={(event) => setAccountHolder(event.target.value)}
          disabled={!canEdit}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bank-name">Banco</Label>
        <Input
          id="bank-name"
          value={bankName}
          onChange={(event) => setBankName(event.target.value)}
          disabled={!canEdit}
          placeholder="BAI, BIC, BFA…"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bank-swift">SWIFT (opcional)</Label>
        <Input
          id="bank-swift"
          value={swift}
          onChange={(event) => setSwift(event.target.value.toUpperCase())}
          disabled={!canEdit}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="bank-iban">IBAN (AO…)</Label>
        <Input
          id="bank-iban"
          value={iban}
          onChange={(event) => setIban(event.target.value.toUpperCase())}
          disabled={!canEdit}
          placeholder="AO20 0044 3015 6278 3436 9480 4"
        />
        {bankLabel ? (
          <p className="text-xs text-muted-foreground">{bankLabel}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Formato BNA: 25 caracteres (AO + 23 dígitos).
          </p>
        )}
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="bank-merchant">Merchant Multicaixa (EMIS)</Label>
        <Input
          id="bank-merchant"
          value={merchant}
          onChange={(event) => setMerchant(event.target.value)}
          disabled={!canEdit}
          placeholder="Referência EMIS / merchant ID"
        />
      </div>
      {canEdit ? (
        <div className="sm:col-span-2 flex flex-wrap justify-end gap-2">
          <PayflowBankSyncButton size="default" />
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "A guardar…" : "Guardar banco"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SchoolAgtForm() {
  const currentUser = useCurrentAccount();
  const queryClient = useQueryClient();
  const canEdit = currentUser.role === "Administrador";
  const schoolQuery = useQuery({
    queryKey: ["school", "settings"],
    queryFn: () => getSchoolSettings() as Promise<SchoolSettingsBundle>,
    staleTime: 5 * 60_000,
  });
  const agt = schoolQuery.data?.agt;
  const [software, setSoftware] = useState("");
  const [series, setSeries] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agt) return;
    setSoftware(agt.software_certified ?? "");
    setSeries(agt.invoice_series ?? "");
    setNotes(agt.fiscal_notes ?? "");
  }, [agt]);

  const save = async () => {
    setSaving(true);
    try {
      const data = await updateSchoolAgt({
        data: {
          softwareCertified: software.trim(),
          invoiceSeries: series.trim(),
          fiscalNotes: notes.trim(),
        },
      });
      queryClient.setQueryData(["school", "settings"], (prev: unknown) =>
        prev && typeof prev === "object" ? { ...prev, agt: data } : prev,
      );
      toast.success("Parâmetros AGT guardados.");
    } catch (error) {
      toastActionError(error, "Não foi possível guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        O SIGA prepara linhas AGT e recibos oficiais. A submissão electrónica depende do software
        certificado instalado na escola. Exportação SAFT-AO:{" "}
        <a
          href={getDocUrl(DOC_PATHS.financeSaft)}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          manual SAFT-AO
        </a>
        {" · "}
        menu Exportar em `/faturas`.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="agt-software">Software certificado</Label>
          <Input
            id="agt-software"
            value={software}
            onChange={(event) => setSoftware(event.target.value)}
            disabled={!canEdit}
            placeholder="Nome do produto certificado AGT"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="agt-series">Série de facturação</Label>
          <Input
            id="agt-series"
            value={series}
            onChange={(event) => setSeries(event.target.value)}
            disabled={!canEdit}
            placeholder="Ex.: SIGA/2026"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="agt-notes">Notas fiscais internas</Label>
          <Input
            id="agt-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={!canEdit}
            placeholder="Observações para tesouraria e auditoria"
          />
        </div>
      </div>
      <a
        href={AGT_NIF_PORTAL_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-block text-xs font-semibold text-primary hover:underline"
      >
        Portal do Contribuinte — consultar NIF
      </a>
      {canEdit ? (
        <div className="flex justify-end">
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "A guardar…" : "Guardar AGT"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
