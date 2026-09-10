const fs = require("fs");
const file =
  "/Users/valentinocanguele/edu/onsoft-replica-dev/src/features/school/settings-identity-panel.tsx";
let content = fs.readFileSync(file, "utf-8");

// Adicionar import provisionMailbox se não existir
if (!content.includes("provisionMailbox")) {
  content = content.replace(
    "updateEmailForwarding,",
    "updateEmailForwarding,\n  provisionMailbox,",
  );
}

// Adicionar estado da mailbox
if (!content.includes("mailboxState")) {
  content = content.replace(
    "// Estados de Encaminhamento de E-mail",
    "// Estados de Caixa Profissional\n  const [mailboxState, setMailboxState] = useState<{email: string, status: string, provider: string} | null>(null);\n  const [isProvisioningMailbox, setIsProvisioningMailbox] = useState(false);\n  const provisionMailboxFn = useServerFn(provisionMailbox);\n\n  // Estados de Encaminhamento de E-mail",
  );
}

// Actualizar loadDomainData para ler mailbox
if (!content.includes("setMailboxState(")) {
  content = content.replace(
    "if (data.emailRoute) {",
    "if (data.mailbox) {\n        setMailboxState(data.mailbox);\n      }\n\n      if (data.emailRoute) {",
  );
}

// Adicionar handleProvisionMailbox
if (!content.includes("handleProvisionMailbox")) {
  content = content.replace(
    "const handleSaveEmailRoute = async () => {",
    `const handleProvisionMailbox = async () => {
    if (!activeTenant || !activeSlug) return;
    setIsProvisioningMailbox(true);
    try {
      const res = await provisionMailboxFn({
        data: {
          tenantId: activeTenant.id,
          tenantSlug: activeSlug,
          email: \`\${activeSlug}@\${platformDomain}\`,
          displayName: activeTenant.name || "Escola"
        }
      });
      if (res.ok) {
        toast.success("Caixa profissional solicitada com sucesso!");
        setMailboxState({
          email: \`\${activeSlug}@\${platformDomain}\`,
          status: "active",
          provider: res.provider
        });
      }
    } catch (err) {
      toast.error("Ocorreu um erro ao solicitar a caixa profissional.");
    } finally {
      setIsProvisioningMailbox(false);
    }
  };

  const handleSaveEmailRoute = async () => {`,
  );
}

// Adicionar UI da mailbox na aba "email"
if (!content.includes("Caixa de Correio Profissional")) {
  content = content.replace(
    '<TabsContent value="email" className="space-y-4">',
    `<TabsContent value="email" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="size-5 text-muted-foreground" />
                Caixa de Correio Profissional (Fase 5)
              </CardTitle>
              <CardDescription>
                Em vez de encaminhar, obtenha uma caixa de entrada real gerida pelo SIGA (Zoho/Google).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasProfessionalEmailAccess ? (
                mailboxState ? (
                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Endereço da Caixa</p>
                        <p className="text-sm text-muted-foreground">{mailboxState.email}</p>
                      </div>
                      <Badge variant={mailboxState.status === "active" ? "default" : "secondary"}>
                        {mailboxState.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Provider</p>
                        <p className="text-sm text-muted-foreground capitalize">{mailboxState.provider}</p>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <a href={mailboxState.provider === "zoho" ? "https://mail.zoho.com" : "https://mail.google.com"} target="_blank" rel="noreferrer">
                          Aceder ao Webmail
                        </a>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-6 text-center">
                    <Mail className="size-8 text-muted-foreground mx-auto mb-2" />
                    <h3 className="font-medium mb-1">Sem caixa configurada</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Obtenha uma caixa de correio dedicada para a direcção da sua escola.
                    </p>
                    <Button 
                      onClick={handleProvisionMailbox} 
                      disabled={isProvisioningMailbox}
                    >
                      {isProvisioningMailbox && <Loader2 className="mr-2 size-4 animate-spin" />}
                      Solicitar Caixa Profissional
                    </Button>
                  </div>
                )
              ) : (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="flex items-start gap-3">
                    <Lock className="size-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Funcionalidade Premium</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Faça upgrade para o plano Business ou Enterprise para obter caixas de e-mail profissionais.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
`,
  );
}

fs.writeFileSync(file, content);
