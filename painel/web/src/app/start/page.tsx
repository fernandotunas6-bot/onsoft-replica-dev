"use client"

import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { ArrowLeft, ArrowRight, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { MarketingFormPage } from "@/components/marketing/marketing-form-page"
import { cn } from "@/lib/utils"
import { ECOSYSTEM_URLS } from "@/lib/ecosystem-urls"
import { fetchSaasPlans, signupSchool, type PlanCode, type SaasPlan } from "@/lib/saas-api"

const FALLBACK_PLANS: SaasPlan[] = [
  { code: "start", name: "Start", description: "Escolas pequenas" },
  { code: "professional", name: "Professional", description: "Operação completa" },
  { code: "business", name: "Business", description: "Multi-equipa e relatórios" },
  { code: "enterprise", name: "Enterprise", description: "Limites e suporte alargados" },
]

const PAYMENT_IBAN = String(import.meta.env["VITE_PAYMENT_IBAN"] ?? "").trim()
const PAYMENT_BANK = String(import.meta.env["VITE_PAYMENT_BANK"] ?? "").trim()
const PAYMENT_ACCOUNT_NAME = String(import.meta.env["VITE_PAYMENT_ACCOUNT_NAME"] ?? "").trim()
const SUPPORT_WHATSAPP = String(import.meta.env["VITE_SUPPORT_WHATSAPP"] ?? "").replace(/\D/g, "")
const SUPPORT_EMAIL = String(import.meta.env["VITE_SUPPORT_EMAIL"] ?? "").trim()

const schema = z.object({
  name: z.string().trim().min(2, "Nome da escola obrigatório"),
  nif: z.string().trim().optional(),
  city: z.string().trim().optional(),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("E-mail inválido").optional().or(z.literal("")),
  contact_name: z.string().trim().min(2, "Nome do responsável obrigatório"),
  contact_role: z.string().trim().optional(),
  contact_phone: z.string().trim().optional(),
  contact_email: z.string().trim().email("E-mail do responsável inválido"),
  plan_code: z.enum(["start", "professional", "business", "enterprise"]),
  admin_name: z.string().trim().min(2, "Nome do administrador obrigatório"),
  admin_email: z.string().trim().email("E-mail do administrador inválido"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Mínimo 3 caracteres")
    .regex(/^[a-z0-9-]+$/, "Só letras minúsculas, números e hífen"),
  website: z.string().max(0).optional().or(z.literal("")),
})

type FormValues = z.infer<typeof schema>

const STEPS = [
  { id: 1, title: "Instituição" },
  { id: 2, title: "Responsável" },
  { id: 3, title: "Plano" },
  { id: 4, title: "Conta" },
  { id: 5, title: "Endereço" },
  { id: 6, title: "Revisão" },
]

function slugFromName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

export function StartSchoolWizard() {
  const [step, setStep] = useState(1)
  const [plans, setPlans] = useState<SaasPlan[]>(FALLBACK_PLANS)
  const [serverError, setServerError] = useState<string | null>(null)
  const [done, setDone] = useState<{ hostname: string; sigaUrl: string; adminTenantsUrl?: string } | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      nif: "",
      city: "Luanda",
      address: "",
      phone: "",
      email: "",
      contact_name: "",
      contact_role: "",
      contact_phone: "",
      contact_email: "",
      plan_code: "professional",
      admin_name: "",
      admin_email: "",
      slug: "",
      website: "",
    },
  })

  useEffect(() => {
    void fetchSaasPlans().then((list) => {
      if (list.length) setPlans(list)
    })
  }, [])

  const name = form.watch("name")
  useEffect(() => {
    if (!form.getValues("slug") && name) {
      form.setValue("slug", slugFromName(name), { shouldValidate: false })
    }
  }, [name, form])

  const values = form.watch()
  const planLabel = useMemo(
    () => plans.find((p) => p.code === values.plan_code)?.name ?? values.plan_code,
    [plans, values.plan_code],
  )

  async function validateStep() {
    const fieldsByStep: Record<number, (keyof FormValues)[]> = {
      1: ["name"],
      2: ["contact_name", "contact_email"],
      3: ["plan_code"],
      4: ["admin_name", "admin_email"],
      5: ["slug"],
    }
    const fields = fieldsByStep[step]
    if (!fields) return true
    return form.trigger(fields)
  }

  async function onNext() {
    setServerError(null)
    if (!(await validateStep())) return
    if (step === 2 && !form.getValues("admin_name")) {
      form.setValue("admin_name", form.getValues("contact_name"))
      form.setValue("admin_email", form.getValues("contact_email"))
    }
    setStep((s) => Math.min(6, s + 1))
  }

  async function onCreate() {
    setServerError(null)
    const ok = await form.trigger()
    if (!ok) return
    const payload = form.getValues()
    const result = await signupSchool({
      ...payload,
      email: payload.email || payload.contact_email,
    })
    if (!result.ok) {
      setServerError(result.error || "Falha ao criar a escola.")
      return
    }
    setDone({
      hostname: result.hostname || `${payload.slug}.portal-siga.com`,
      sigaUrl: result.sigaUrl || ECOSYSTEM_URLS.siga,
      adminTenantsUrl: result.adminTenantsUrl,
    })
  }

  if (done) {
    const paymentMessage = encodeURIComponent(
      `Olá, registei a escola ${values.name} no SIGA Plus. Pretendo enviar o comprovativo do plano ${planLabel}. Endereço: ${done.hostname}.`,
    )
    const whatsappUrl = SUPPORT_WHATSAPP ? `https://wa.me/${SUPPORT_WHATSAPP}?text=${paymentMessage}` : null
    const emailUrl = SUPPORT_EMAIL
      ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Comprovativo de pagamento - SIGA Plus (${values.name})`)}`
      : null
    const hasPaymentInstructions = Boolean(PAYMENT_IBAN)

    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Pedido da escola registado com sucesso</CardTitle>
          <CardDescription>
            O acesso experimental pode iniciar agora. O plano pago só fica activo depois da validação do pagamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 text-center">
          <div className="rounded-lg bg-muted p-4 space-y-3">
            <h3 className="font-semibold text-sm">Estado da assinatura</h3>
            <p className="text-sm font-medium">Pagamento pendente de validação</p>
            <p className="text-xs text-muted-foreground">Plano seleccionado: {planLabel}</p>
          </div>

          {hasPaymentInstructions ? (
            <div className="rounded-lg border p-4 space-y-2">
              <h3 className="font-semibold text-sm">Dados para pagamento por IBAN</h3>
              <p className="text-sm font-mono tracking-wider">{PAYMENT_IBAN}</p>
              {PAYMENT_BANK ? <p className="text-xs text-muted-foreground">Banco: {PAYMENT_BANK}</p> : null}
              {PAYMENT_ACCOUNT_NAME ? (
                <p className="text-xs text-muted-foreground">Titular: {PAYMENT_ACCOUNT_NAME}</p>
              ) : null}
            </div>
          ) : (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">
              Os dados oficiais para pagamento serão enviados pelos canais comerciais configurados. Nenhum IBAN de demonstração é apresentado.
            </p>
          )}

          <p className="text-sm">
            Ao enviar o comprovativo, identifique a instituição como <strong>{values.name}</strong> e informe o endereço <strong>{done.hostname}</strong>.
          </p>

          {whatsappUrl || emailUrl ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              {whatsappUrl ? (
                <Button asChild>
                  <a href={whatsappUrl} target="_blank" rel="noreferrer">
                    Enviar comprovativo por WhatsApp
                  </a>
                </Button>
              ) : null}
              {emailUrl ? (
                <Button asChild variant="outline">
                  <a href={emailUrl}>Enviar comprovativo por e-mail</a>
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 border-t pt-4 text-sm">
            <Button variant="link" asChild className="text-muted-foreground">
              <a href={done.sigaUrl}>Entrar no SIGA Plus durante o período experimental &rarr;</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Criar a minha escola</CardTitle>
        <CardDescription>
          Passo {step} de {STEPS.length} · {STEPS[step - 1]?.title}
        </CardDescription>
        <ol className="mt-4 flex justify-center gap-1.5">
          {STEPS.map((item) => (
            <li
              key={item.id}
              className={cn(
                "h-1.5 w-8 rounded-full",
                item.id <= step ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </ol>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (step < 6) void onNext()
              else void onCreate()
            }}
            className="grid gap-4"
          >
            <input type="text" tabIndex={-1} autoComplete="off" className="hidden" {...form.register("website")} />

            {step === 1 ? (
              <>
                <Field form={form} name="name" label="Nome da instituição" />
                <Field form={form} name="nif" label="NIF (opcional)" />
                <Field form={form} name="city" label="Cidade" />
                <Field form={form} name="address" label="Endereço (opcional)" />
                <Field form={form} name="phone" label="Telefone (opcional)" />
                <Field form={form} name="email" label="E-mail institucional (opcional)" />
              </>
            ) : null}

            {step === 2 ? (
              <>
                <Field form={form} name="contact_name" label="Nome do responsável" />
                <Field form={form} name="contact_role" label="Função (opcional)" />
                <Field form={form} name="contact_email" label="E-mail" />
                <Field form={form} name="contact_phone" label="Telefone (opcional)" />
              </>
            ) : null}

            {step === 3 ? (
              <div className="grid gap-2">
                {plans.map((plan) => (
                  <button
                    key={plan.code}
                    type="button"
                    onClick={() => form.setValue("plan_code", plan.code as PlanCode)}
                    className={cn(
                      "rounded-lg border p-3 text-left text-sm transition-colors",
                      values.plan_code === plan.code
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/60",
                    )}
                  >
                    <span className="font-medium">{plan.name}</span>
                    {plan.description ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{plan.description}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}

            {step === 4 ? (
              <>
                <Field form={form} name="admin_name" label="Nome do administrador inicial" />
                <Field form={form} name="admin_email" label="E-mail da conta SIGA" />
              </>
            ) : null}

            {step === 5 ? (
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subdomínio SIGA</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <Input {...field} />
                        <span className="shrink-0 text-xs text-muted-foreground">.portal-siga.com</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            {step === 6 ? (
              <dl className="grid gap-2 text-sm">
                <Row label="Escola" value={values.name} />
                <Row label="Responsável" value={values.contact_name} />
                <Row label="Plano" value={planLabel} />
                <Row label="Administrador" value={`${values.admin_name} · ${values.admin_email}`} />
                <Row label="Endereço" value={`${values.slug}.portal-siga.com`} />
              </dl>
            ) : null}

            {serverError ? (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {serverError}
              </p>
            ) : null}

            <div className="flex gap-2 pt-2">
              {step > 1 ? (
                <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
                  <ArrowLeft className="size-4" />
                  Voltar
                </Button>
              ) : (
                <Button type="button" variant="outline" asChild>
                  <Link to="/">Cancelar</Link>
                </Button>
              )}
              <Button type="submit" className="ml-auto" disabled={form.formState.isSubmitting}>
                {step < 6 ? (
                  <>
                    Continuar <ArrowRight className="size-4" />
                  </>
                ) : (
                  <>
                    <Check className="size-4" /> Criar escola
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

function Field({
  form,
  name,
  label,
}: {
  form: ReturnType<typeof useForm<FormValues>>
  name: keyof FormValues
  label: string
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} value={field.value ?? ""} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value || "—"}</dd>
    </div>
  )
}

export default function StartSchoolPage() {
  return (
    <MarketingFormPage>
      <StartSchoolWizard />
    </MarketingFormPage>
  )
}
