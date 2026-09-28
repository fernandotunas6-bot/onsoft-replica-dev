import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  KeyRound,
  Shield,
  User,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileSettingsPanel } from "@/features/auth/ProfileSettingsPanel";
import { TeacherContactVisibilityPanel } from "@/features/people/TeacherContactVisibilityPanel";
import { PasswordChangeForm } from "@/features/auth/PasswordChangeForm";
import { EmailChangeForm } from "@/features/auth/EmailChangeForm";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { getCreateSchoolUrl } from "@/lib/ecosystem-urls";

const PROFILE_TABS = ["perfil", "instituicoes", "seguranca"] as const;

export const Route = createFileRoute("/perfil")({
  // `?tab=seguranca` abre directamente o 2FA (ex.: a partir de uma recusa por
  // falta de verificação em duas etapas).
  validateSearch: (search: Record<string, unknown>): { tab?: (typeof PROFILE_TABS)[number] } =>
    PROFILE_TABS.includes(search["tab"] as (typeof PROFILE_TABS)[number])
      ? { tab: search["tab"] as (typeof PROFILE_TABS)[number] }
      : {},
  head: () => ({
    meta: [
      { title: "Perfil & Conta · SIGA" },
      {
        name: "description",
        content: "Foto, identidade, instituições associadas e segurança da sua conta SIGA.",
      },
    ],
  }),
  component: PerfilPage,
});

function PerfilPage() {
  const currentUser = useCurrentAccount();
  const { tab } = Route.useSearch();
  const [activeTab, setActiveTab] = useState<string>(tab ?? "perfil");

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          group="Conta Global"
          title="Minha Conta & Perfil"
          description="Gerencie a sua identidade institucional, fotografia, instituições onde leciona ou colabora e segurança de acesso."
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="perfil" className="gap-2 text-xs">
              <User className="size-3.5" />
              Perfil
            </TabsTrigger>
            <TabsTrigger value="instituicoes" className="gap-2 text-xs">
              <Building2 className="size-3.5" />
              Instituições
              {currentUser.schools.length > 1 ? (
                <Badge variant="secondary" className="px-1.5 py-0 text-[11px] ml-1">
                  {currentUser.schools.length}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="seguranca" className="gap-2 text-xs">
              <KeyRound className="size-3.5" />
              Segurança
            </TabsTrigger>
          </TabsList>

          <TabsContent value="perfil" className="space-y-6">
            <Panel
              title="Identidade & Contactos"
              description="Nome completo, fotografia, e-mail e telemóvel angolano"
            >
              <ProfileSettingsPanel />
            </Panel>
            <TeacherContactVisibilityPanel />
          </TabsContent>

          <TabsContent value="instituicoes" className="space-y-6">
            <Panel
              title="Instituições Associadas"
              description="A sua conta global permite pertencer a múltiplos colégios, institutos ou universidades sem duplicar cadastros."
            >
              <div className="space-y-4">
                {currentUser.schools.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Nenhuma instituição associada diretamente no momento.
                  </div>
                ) : (
                  currentUser.schools.map((item) => {
                    const isCurrent = item.schoolId === currentUser.schoolId;
                    return (
                      <div
                        key={item.membershipId}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border p-4 transition-colors ${
                          isCurrent
                            ? "border-primary/40 bg-primary/5 shadow-xs"
                            : "border-border bg-card hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-start sm:items-center gap-3">
                          <div
                            className={`flex size-10 shrink-0 items-center justify-center rounded-xl font-bold text-sm ${
                              isCurrent
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            <GraduationCap className="size-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-sm text-foreground">
                                {item.schoolName}
                              </h4>
                              {isCurrent ? (
                                <Badge className="gap-1 bg-primary text-[11px] text-primary-foreground">
                                  <CheckCircle2 className="size-3" /> Activa
                                </Badge>
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Cargo:{" "}
                              <strong className="text-foreground">
                                {item.roleName || item.appRole}
                              </strong>{" "}
                              • Estado: {item.status}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          {isCurrent ? (
                            <span className="text-xs text-primary font-semibold px-3 py-1.5 rounded-lg bg-primary/10">
                              Sessão Actual
                            </span>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => currentUser.setActiveSchoolId(item.schoolId)}
                            >
                              Alternar para esta escola
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    <strong className="text-foreground">
                      Quer cadastrar uma nova escola no SIGA?
                    </strong>
                    <p>Crie uma nova instituição e associe a sua conta no portal WEB.</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="shrink-0 gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                  >
                    <a href={getCreateSchoolUrl()} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-3.5" /> Criar Escola (WEB)
                    </a>
                  </Button>
                </div>
              </div>
            </Panel>
          </TabsContent>

          <TabsContent value="seguranca" className="space-y-6">
            <Panel
              title="Palavra-passe & Acesso"
              description="Altere a sua senha de acesso à plataforma com segurança"
            >
              <div className="max-w-md">
                <PasswordChangeForm compact={false} />
              </div>
            </Panel>

            <Panel
              title="Endereço de E-mail"
              description="Alterar o e-mail associado à sua conta institucional"
            >
              <div className="max-w-md">
                <EmailChangeForm compact={false} />
              </div>
            </Panel>

            <Panel
              title="Autenticação Multifator (2FA)"
              description="Proteção adicional para cargos de gestão e administração"
            >
              <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                <Shield className="size-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-semibold text-sm">Segurança de Dois Fatores</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    O segundo fator de autenticação (MFA / TOTP) é suportado através do Supabase
                    Auth e pode ser ativado nas políticas institucionais da escola.
                  </p>
                </div>
              </div>
            </Panel>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
