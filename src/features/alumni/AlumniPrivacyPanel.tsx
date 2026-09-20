import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Mail, MessageCircle, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyAlumniPrivacy, listMyAlumniPrivacyAudit, updateMyAlumniPrivacy } from "./privacy";

type PreferenceState = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  opportunitiesEnabled: boolean;
  eventsEnabled: boolean;
  mentoringEnabled: boolean;
  surveysEnabled: boolean;
  fundraisingEnabled: boolean;
  contactConsent: boolean;
  directoryVisibility: "private" | "school" | "alumni";
};

const defaults: PreferenceState = {
  emailEnabled: true,
  smsEnabled: false,
  whatsappEnabled: false,
  opportunitiesEnabled: true,
  eventsEnabled: true,
  mentoringEnabled: true,
  surveysEnabled: true,
  fundraisingEnabled: false,
  contactConsent: false,
  directoryVisibility: "school",
};

function ToggleRow({
  label,
  helper,
  checked,
  onChange,
}: {
  label: string;
  helper: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-border/60 p-4">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{helper}</span>
      </span>
      <input
        aria-label={label}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4"
      />
    </label>
  );
}

export function AlumniPrivacyPanel() {
  const queryClient = useQueryClient();
  const privacyQuery = useQuery({
    queryKey: ["alumni", "self-service", "privacy"],
    queryFn: () => getMyAlumniPrivacy(),
  });
  const auditQuery = useQuery({
    queryKey: ["alumni", "self-service", "privacy-audit"],
    queryFn: () => listMyAlumniPrivacyAudit(),
  });
  const [state, setState] = useState<PreferenceState>(defaults);

  useEffect(() => {
    if (privacyQuery.data) setState(privacyQuery.data as PreferenceState);
  }, [privacyQuery.data]);

  const mutation = useMutation({
    mutationFn: () => updateMyAlumniPrivacy({ data: state }),
    onSuccess: async () => {
      toast.success("Preferências de privacidade guardadas.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["alumni", "self-service", "privacy"] }),
        queryClient.invalidateQueries({ queryKey: ["alumni", "self-service", "privacy-audit"] }),
        queryClient.invalidateQueries({ queryKey: ["alumni", "self-service"] }),
      ]);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Não foi possível guardar as preferências.",
      ),
  });

  if (privacyQuery.isLoading)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          A carregar preferências…
        </CardContent>
      </Card>
    );

  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
      <div className="space-y-4">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" /> Privacidade e contacto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ToggleRow
              label="Autorizar contacto institucional"
              helper="Permite que a escola use os contactos registados para finalidades que activar abaixo."
              checked={state.contactConsent}
              onChange={(value) => setState((current) => ({ ...current, contactConsent: value }))}
            />
            <div className="rounded-2xl border border-border/60 p-4">
              <label
                className="flex items-center gap-2 text-sm font-semibold"
                htmlFor="alumni-visibility"
              >
                <Eye className="size-4 text-primary" /> Visibilidade no directório
              </label>
              <select
                id="alumni-visibility"
                value={state.directoryVisibility}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    directoryVisibility: event.target
                      .value as PreferenceState["directoryVisibility"],
                  }))
                }
                className="mt-3 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="private">Privado — apenas gestão autorizada</option>
                <option value="school">Escola — comunidade institucional</option>
                <option value="alumni">Alumni — rede de antigos alunos</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Canais e finalidades</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <ToggleRow
              label="E-mail"
              helper="Receber comunicações por e-mail."
              checked={state.emailEnabled}
              onChange={(value) => setState((current) => ({ ...current, emailEnabled: value }))}
            />
            <ToggleRow
              label="SMS"
              helper="Receber comunicações por SMS."
              checked={state.smsEnabled}
              onChange={(value) => setState((current) => ({ ...current, smsEnabled: value }))}
            />
            <ToggleRow
              label="WhatsApp"
              helper="Permitir contacto por WhatsApp quando integrado."
              checked={state.whatsappEnabled}
              onChange={(value) => setState((current) => ({ ...current, whatsappEnabled: value }))}
            />
            <ToggleRow
              label="Oportunidades"
              helper="Empregos, bolsas, estágios e negócios."
              checked={state.opportunitiesEnabled}
              onChange={(value) =>
                setState((current) => ({ ...current, opportunitiesEnabled: value }))
              }
            />
            <ToggleRow
              label="Eventos"
              helper="Reencontros, networking e webinars."
              checked={state.eventsEnabled}
              onChange={(value) => setState((current) => ({ ...current, eventsEnabled: value }))}
            />
            <ToggleRow
              label="Mentoria"
              helper="Programas de mentoria e matching."
              checked={state.mentoringEnabled}
              onChange={(value) => setState((current) => ({ ...current, mentoringEnabled: value }))}
            />
            <ToggleRow
              label="Pesquisas"
              helper="Tracer studies e estudos de empregabilidade."
              checked={state.surveysEnabled}
              onChange={(value) => setState((current) => ({ ...current, surveysEnabled: value }))}
            />
            <ToggleRow
              label="Fundraising"
              helper="Campanhas de apoio, bolsas e projectos institucionais."
              checked={state.fundraisingEnabled}
              onChange={(value) =>
                setState((current) => ({ ...current, fundraisingEnabled: value }))
              }
            />
            <div className="md:col-span-2">
              <Button
                className="rounded-xl"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "A guardar…" : "Guardar preferências"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>Transparência</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-muted/50 p-3">
              <Mail className="mx-auto size-4 text-primary" />
              <p className="mt-1 text-[10px] text-muted-foreground">E-mail</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <Smartphone className="mx-auto size-4 text-primary" />
              <p className="mt-1 text-[10px] text-muted-foreground">SMS</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <MessageCircle className="mx-auto size-4 text-primary" />
              <p className="mt-1 text-[10px] text-muted-foreground">WhatsApp</p>
            </div>
          </div>
          <h3 className="mt-5 text-sm font-bold">Histórico recente</h3>
          <div className="mt-3 space-y-2">
            {(auditQuery.data ?? []).length ? (
              (auditQuery.data ?? []).map((row) => (
                <div key={row.id} className="rounded-xl border border-border/60 px-3 py-2.5">
                  <p className="text-xs font-semibold">{String(row.action).replaceAll("_", " ")}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(row.occurred_at).toLocaleString("pt-AO")}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs leading-5 text-muted-foreground">
                As alterações de consentimento e visibilidade aparecerão aqui.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
