"use client"

import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Globe, Loader2 } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MarketingFormPage } from "@/components/marketing/marketing-form-page"
import { ANGOLA_PROVINCES, SCHOOL_TYPES } from "@/lib/angola"
import { cn } from "@/lib/utils"
import { ECOSYSTEM_URLS, PLATFORM_DOMAIN } from "@/lib/ecosystem-urls"
import {
  checkSlugAvailability,
  fetchSaasPlans,
  signupSchool,
  type PlanCode,
  type SaasPlan,
} from "@/lib/saas-api"

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
  // Obrigatório e validado do mesmo modo que no servidor. Era opcional, e o
  // resultado foi 85 das 87 escolas em produção sem NIF — sem o qual não
  // conseguem exportar SAF-T para a AGT nem emitir documento fiscal válido.
  // Melhor recusar aqui, com a mensagem certa, do que deixar a escola descobrir
  // meses depois na altura de declarar.
  nif: z
    .string()
    .trim()
    .min(1, "NIF obrigatório — necessário para facturação e SAF-T (AGT)")
    .regex(/^[0-9]{9,10}$/, "NIF inválido. Use o NIF de entidade da AGT (9–10 dígitos)"),
  commercial_name: z.string().trim().max(160).optional(),
  school_type: z.string().trim().optional(),
  province: z.string().trim().min(1, "Escolha a província"),
  municipality: z.string().trim().min(2, "Indique o município").max(80),
  commune: z.string().trim().max(80).optional(),
  neighborhood: z.string().trim().max(120).optional(),
  city: z.string().trim().optional(),
  address: z.string().trim().max(200).optional(),
  phone: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^\+?(244)?9\d{8}$/.test(v.replace(/[\s-]/g, "")), {
      message: "Telefone inválido. Use +244 9XX XXX XXX",
    }),
  email: z.string().trim().email("E-mail inválido").optional().or(z.literal("")),
  contact_name: z.string().trim().min(2, "Nome do responsável obrigatório"),
  contact_role: z.string().trim().optional(),
  contact_phone: z.string().trim().optional(),
  contact_email: z.string().trim().email("E-mail do responsável inválido"),
  plan_code: z.enum(["start", "professional", "business", "enterprise"]),
  admin_name: z.string().trim().min(2, "Nome do administrador obrigatório"),
  admin_email: z.string().trim().email("E-mail do administrador inválido"),
  // Espelha adminPasswordSchema no servidor. Se o formulário aceitasse o que o
  // servidor recusa, o cliente só via o erro depois de submeter tudo.
  admin_password: z
    .string()
    .min(10, "A senha deve ter pelo menos 10 caracteres")
    .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), {
      message: "A senha deve combinar letras e números",
    })
    .refine((v) => !/^(.)\1+$/.test(v), { message: "A senha não pode ser o mesmo caracter repetido" })
    .refine((v) => !/^\d+$/.test(v.trim()), { message: "A senha não pode ser só dígitos" })
    .refine(
      (v) =>
        ![
          "password", "passw0rd", "senha", "senhasenha", "qwerty", "qwertyuiop",
          "abc123", "abcd1234", "admin123", "escola123", "1234567890",
        ].includes(v.trim().toLowerCase().replace(/[^a-z0-9]/g, "")),
      { message: "Esta senha é demasiado comum. Escolha outra" },
    ),
  admin_password_confirm: z.string().min(1, "Confirme a senha"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Mínimo 3 caracteres")
    .regex(/^[a-z0-9-]+$/, "Só letras minúsculas, números e hífen"),
  website: z.string().max(0).optional().or(z.literal("")),
}).refine((data) => data.admin_password === data.admin_password_confirm, {
  message: "As senhas não coincidem",
  path: ["admin_password_confirm"],
})

type FormValues = z.infer<typeof schema>

const STEPS = [
  { id: 1, title: "Instituição", hint: "Nome, NIF e natureza" },
  { id: 2, title: "Localização", hint: "Onde fica a escola" },
  { id: 3, title: "Responsável", hint: "Quem trata do registo" },
  { id: 4, title: "Plano", hint: "Pode mudar depois" },
  { id: 5, title: "Conta", hint: "Acesso do administrador" },
  { id: 6, title: "Endereço", hint: "O seu subdomínio" },
  { id: 7, title: "Revisão", hint: "Confirmar e criar" },
]

const STEP_INTRO: Record<number, string> = {
  1: "Os dados oficiais aparecem nas facturas, pautas e certificados emitidos pela escola.",
  2: "A localização fica na ficha da escola e nos documentos oficiais.",
  3: "A pessoa que acompanha o registo e recebe as comunicações comerciais.",
  4: "Todos os planos começam com um período experimental. O pagamento só é pedido depois.",
  5: "Esta conta entra no SIGA Plus como Administrador e convida o resto da equipa.",
  6: "O endereço próprio da escola no SIGA Plus. Pode ligar um domínio seu mais tarde.",
  7: "Confirme os dados. Pode voltar a qualquer passo para corrigir.",
}

const LAST_STEP = STEPS.length

const FIELDS_BY_STEP: Record<number, (keyof FormValues)[]> = {
  1: ["name", "nif", "commercial_name"],
  2: ["province", "municipality", "commune", "neighborhood", "address", "phone", "email"],
  3: ["contact_name", "contact_role", "contact_phone", "contact_email"],
  4: ["plan_code"],
  5: ["admin_name", "admin_email", "admin_password", "admin_password_confirm"],
  6: ["slug"],
}

/** Rascunho no navegador: quem fecha a página a meio retoma onde estava. Nunca a senha. */
const DRAFT_KEY = "siga-web:start-draft:v1"
const DRAFT_OMIT = new Set<keyof FormValues>(["admin_password", "admin_password_confirm", "website"])

type Draft = { step: number; values: Partial<FormValues> }

function readDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Draft
    return parsed && typeof parsed === "object" && parsed.values ? parsed : null
  } catch {
    return null
  }
}

function writeDraft(draft: Draft | null) {
  try {
    if (draft) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    else window.localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* navegador sem armazenamento: o registo continua, só sem rascunho */
  }
}

/** 0 a 3: comprimento, letras e números, símbolo ou 14+ caracteres. */
function passwordStrength(value: string) {
  if (!value) return 0
  let score = 0
  if (value.length >= 10) score++
  if (/[a-zA-Z]/.test(value) && /\d/.test(value)) score++
  if (/[^a-zA-Z0-9]/.test(value) || value.length >= 14) score++
  return score
}

const RECOMMENDED_PLAN: PlanCode = "professional"

function formatAoa(value?: number) {
  if (value == null) return null
  return new Intl.NumberFormat("pt-AO", {
    style: "currency",
    currency: "AOA",
    maximumFractionDigits: 0,
  }).format(value)
}

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
  // `form.formState.isSubmitting` só activa dentro de `form.handleSubmit(...)` — o
  // <form onSubmit> aqui chama onNext/onCreate directamente, então nunca acendia.
  // Sem isto, um duplo clique em "Criar escola" disparava dois pedidos de signup.
  const [isCreating, setIsCreating] = useState(false)
  const [done, setDone] = useState<{
    hostname: string
    sigaUrl: string
    adminTenantsUrl?: string
    adminInviteDelivered: boolean
    adminPasswordSet: boolean
  } | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      nif: "",
      commercial_name: "",
      school_type: "privada",
      province: "",
      municipality: "",
      commune: "",
      neighborhood: "",
      city: "",
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
      admin_password: "",
      admin_password_confirm: "",
      slug: "",
      website: "",
    },
  })

  // Retomar o rascunho (uma vez, ao abrir).
  const [resumed, setResumed] = useState(false)
  useEffect(() => {
    const draft = readDraft()
    if (!draft) return
    for (const [key, value] of Object.entries(draft.values)) {
      if (!DRAFT_OMIT.has(key as keyof FormValues) && typeof value === "string") {
        form.setValue(key as keyof FormValues, value as never, { shouldValidate: false })
      }
    }
    // Sem a senha guardada, quem já ia além da conta volta ao passo da conta.
    setStep(Math.min(Math.max(1, draft.step || 1), 5))
    setResumed(true)
  }, [form])

  function restart() {
    writeDraft(null)
    form.reset()
    setStep(1)
    setResumed(false)
  }

  useEffect(() => {
    void fetchSaasPlans().then((list) => {
      if (list.length) setPlans(list)
    })
  }, [])

  // Chegar de /pricing com um plano já escolhido (?plan=professional) não deve
  // obrigar a repetir a escolha no passo 3 — só pré-selecciona, a pessoa ainda
  // confirma lá.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("plan")
    const validCodes: PlanCode[] = ["start", "professional", "business", "enterprise"]
    if (requested && (validCodes as string[]).includes(requested)) {
      form.setValue("plan_code", requested as PlanCode, { shouldValidate: false })
    }
  }, [form])

  const name = form.watch("name")
  useEffect(() => {
    if (!form.getValues("slug") && name) {
      form.setValue("slug", slugFromName(name), { shouldValidate: false })
    }
  }, [name, form])

  const values = form.watch()
  const draftJson = JSON.stringify(
    Object.fromEntries(
      Object.entries(values).filter(([key]) => !DRAFT_OMIT.has(key as keyof FormValues)),
    ),
  )
  useEffect(() => {
    if (done) return
    const timeout = setTimeout(() => {
      writeDraft({ step, values: JSON.parse(draftJson) as Partial<FormValues> })
    }, 400)
    return () => clearTimeout(timeout)
  }, [draftJson, step, done])
  const planLabel = useMemo(
    () => plans.find((p) => p.code === values.plan_code)?.name ?? values.plan_code,
    [plans, values.plan_code],
  )

  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle")
  const slug = values.slug
  useEffect(() => {
    if (!slug || slug.length < 3) {
      setSlugStatus("idle")
      return
    }
    setSlugStatus("checking")
    const timeout = setTimeout(() => {
      void checkSlugAvailability(slug).then((available) => {
        if (available == null) {
          setSlugStatus("idle") // não deu para confirmar — não bloqueia, o servidor valida na submissão
        } else {
          setSlugStatus(available ? "available" : "taken")
        }
      })
    }, 500)
    return () => clearTimeout(timeout)
  }, [slug])

  async function validateStep() {
    const fields = FIELDS_BY_STEP[step]
    if (!fields) return true
    return form.trigger(fields)
  }

  async function onNext() {
    setServerError(null)
    if (!(await validateStep())) return
    if (step === 6 && slugStatus === "taken") {
      form.setError("slug", { message: "Este subdomínio já está em uso por outra escola." })
      return
    }
    if (step === 3 && !form.getValues("admin_name")) {
      form.setValue("admin_name", form.getValues("contact_name"))
      form.setValue("admin_email", form.getValues("contact_email"))
    }
    setResumed(false)
    setStep((s) => Math.min(LAST_STEP, s + 1))
  }

  // Sem isto o passo seguinte abre a meio do cartão: o conteúdo do formulário
  // troca mas o scroll da página fica onde o botão «Continuar» estava.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [step, done])

  async function onCreate() {
    if (isCreating) return
    setServerError(null)
    const ok = await form.trigger()
    if (!ok) {
      const errors = form.formState.errors
      const firstBad = Object.entries(FIELDS_BY_STEP).find(([, fields]) =>
        fields.some((field) => errors[field]),
      )
      if (firstBad) setStep(Number(firstBad[0]))
      setServerError("Falta corrigir um campo. Levámo-lo ao passo onde está.")
      return
    }
    if (slugStatus === "taken") {
      setServerError("Este subdomínio já está em uso por outra escola. Volte ao passo 6 e escolha outro.")
      return
    }
    setIsCreating(true)
    try {
      const { admin_password_confirm: _confirm, ...payload } = form.getValues()
      let result: Awaited<ReturnType<typeof signupSchool>>
      try {
        result = await signupSchool({
          ...payload,
          city: payload.municipality || payload.city,
          commercial_name: payload.commercial_name || undefined,
          email: payload.email || payload.contact_email,
        })
      } catch {
        // Falha de rede (servidor em baixo, sem ligação) — signupSchool() não
        // apanha isto sozinho, e sem este catch o erro ficava só na consola:
        // o botão voltava ao normal e a pessoa não fazia ideia do que correu mal.
        setServerError(
          "Não foi possível ligar ao servidor. Verifique a sua ligação à internet e tente novamente.",
        )
        return
      }
      if (!result.ok) {
        setServerError(result.error || "Falha ao criar a escola.")
        return
      }
      writeDraft(null)
      setDone({
        hostname: result.hostname || `${payload.slug}.${PLATFORM_DOMAIN}`,
        sigaUrl: result.sigaUrl || ECOSYSTEM_URLS.siga,
        adminTenantsUrl: result.adminTenantsUrl,
        adminInviteDelivered: result.adminInviteDelivered ?? false,
        adminPasswordSet: result.adminPasswordSet ?? false,
      })
    } finally {
      setIsCreating(false)
    }
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
      <Card className="mx-auto w-full max-w-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
            <Check className="h-6 w-6 text-emerald-600" />
          </div>
          <CardTitle className="text-xl font-semibold tracking-tight">
            {values.name} está criada
          </CardTitle>
          <CardDescription>
            O acesso experimental pode iniciar agora. O plano pago só fica activo depois da validação do pagamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 text-center">
          <div className="rounded-lg border p-4 space-y-2 text-left">
            <h3 className="text-sm">Acesso do administrador</h3>
            {done.adminPasswordSet ? (
              <p className="text-sm text-muted-foreground">
                A conta já está pronta. Entre no SIGA Plus com <strong>{values.admin_email}</strong> e a senha que definiu neste registo.
                {done.adminInviteDelivered
                  ? " Também enviámos um e-mail de confirmação — se não chegar em poucos minutos, verifique a pasta de spam."
                  : ""}
              </p>
            ) : done.adminInviteDelivered ? (
              <p className="text-sm text-muted-foreground">
                Enviámos para <strong>{values.admin_email}</strong> o link para definir a senha de acesso. Se não chegar em poucos minutos, verifique a pasta de spam.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                A conta de <strong>{values.admin_email}</strong> já está criada, mas o convite ainda não foi enviado. Use «Recuperar senha» no SIGA Plus com este e-mail, ou peça o link à equipa de suporte.
              </p>
            )}
          </div>

          <div className="rounded-lg border p-4 text-left">
            <h3 className="text-sm">Primeiros passos no SIGA Plus</h3>
            <ol className="mt-3 grid gap-2.5">
              {[
                ["Confirme os dados da escola", "Definições → Escola: logótipo, director e coordenadas."],
                ["Publique o modelo de avaliação", "Pedagógica → Modelos de avaliação. Sem ele não há pautas."],
                ["Crie o ano lectivo, as classes e as turmas", "Pedagógica → Estrutura académica."],
                ["Convide a equipa", "Acessos: secretaria, tesouraria e professores."],
              ].map(([title, hint], index) => (
                <li key={title} className="flex gap-3">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="text-sm">
                    {title}
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                </li>
              ))}
            </ol>
            <Button asChild className="mt-4 w-full">
              <a href={done.sigaUrl}>
                Entrar no SIGA Plus <ArrowRight className="size-4" />
              </a>
            </Button>
          </div>

          <div className="grid gap-3 border-t pt-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Pagamento do plano</p>
          <div className="rounded-lg bg-muted p-4 space-y-3">
              <h3 className="text-sm">Estado da assinatura</h3>
              <p className="text-sm font-medium">Pagamento pendente de validação</p>
              <p className="text-xs text-muted-foreground">Plano seleccionado: {planLabel}</p>
            </div>

            {hasPaymentInstructions ? (
              <div className="rounded-lg border p-4 space-y-2">
                <h3 className="text-sm">Dados para pagamento por IBAN</h3>
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

          </div>

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

          <div className="flex justify-center border-t pt-3 text-sm">
            <Button variant="link" asChild className="text-muted-foreground">
              <a href={manageUrl(done.sigaUrl)}>
                Gerir a assinatura, o plano e o domínio &rarr;
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const typeLabel = SCHOOL_TYPES.find((t) => t.id === values.school_type)?.label ?? null
  const locationLabel = [values.municipality, values.province].filter(Boolean).join(", ")
  const progress = Math.round(((step - 1) / (LAST_STEP - 1)) * 100)

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
      {/* Coluna lateral: percurso e pré-visualização da escola */}
      <aside className="hidden lg:flex lg:flex-col lg:gap-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Nova escola</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Criar a sua escola</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Cerca de cinco minutos. A escola fica pronta a usar no fim.
          </p>
        </div>

        <ol className="grid gap-1">
          {STEPS.map((item) => {
            const isComplete = item.id < step
            const isActive = item.id === step
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={!isComplete || isCreating}
                  onClick={() => setStep(item.id)}
                  aria-current={isActive ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                    isActive && "bg-muted",
                    isComplete && "hover:bg-muted/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px]",
                      isComplete
                        ? "bg-primary text-primary-foreground"
                        : isActive
                          ? "border border-primary text-primary"
                          : "border text-muted-foreground",
                    )}
                  >
                    {isComplete ? <Check className="size-3" /> : item.id}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-sm",
                        isActive ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {item.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground/80">
                      {item.hint}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">A sua escola</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm text-primary">
              {schoolInitials(values.name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm">{values.name || "Nome da escola"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[typeLabel, locationLabel].filter(Boolean).join(" · ") || "Natureza e localização"}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
            <Globe className="size-3.5 shrink-0" />
            <span className="truncate">
              {values.slug || "a-sua-escola"}.{PLATFORM_DOMAIN}
            </span>
          </div>
        </div>

        <ul className="grid gap-2 text-xs text-muted-foreground">
          {[
            "Período experimental antes de qualquer pagamento",
            "Endereço próprio para a escola",
            "Pautas, matrículas e propinas no mesmo sítio",
          ].map((text) => (
            <li key={text} className="flex items-start gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
              {text}
            </li>
          ))}
        </ul>
      </aside>

      <Card className="gap-4 self-start overflow-hidden pt-0">
        {/* Progresso: fino, sempre visível (também no telemóvel) */}
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${Math.max(progress, 4)}%` }}
          />
        </div>
        <CardHeader className="gap-1 pt-2">
          <p className="text-xs text-muted-foreground">
            Passo {step} de {LAST_STEP}
            <span className="lg:hidden"> · Criar a sua escola</span>
          </p>
          <CardTitle className="text-xl font-semibold tracking-tight">
            {STEPS[step - 1]?.title}
          </CardTitle>
          <CardDescription>{STEP_INTRO[step]}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (step < LAST_STEP) void onNext()
                else void onCreate()
              }}
              className="grid gap-4"
            >
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
                {...form.register("website")}
              />

              {resumed ? (
                <p className="flex items-center justify-between gap-3 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  Retomámos o registo que deixou a meio neste navegador.
                  <button type="button" className="shrink-0 underline" onClick={restart}>
                    Recomeçar
                  </button>
                </p>
              ) : null}

              {step === 1 ? (
                <>
                  <Field form={form} name="name" label="Nome oficial da instituição" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      form={form}
                      name="nif"
                      label="NIF da instituição"
                      description="NIF de entidade da AGT (9–10 dígitos)."
                    />
                    <Field
                      form={form}
                      name="commercial_name"
                      label="Nome comercial (opcional)"
                      description="Se for diferente do nome oficial."
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="school_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Natureza da instituição</FormLabel>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup">
                          {SCHOOL_TYPES.map((type) => (
                            <button
                              key={type.id}
                              type="button"
                              role="radio"
                              aria-checked={field.value === type.id}
                              onClick={() => field.onChange(type.id)}
                              className={cn(
                                "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                                field.value === type.id
                                  ? "border-primary bg-primary/5 text-foreground"
                                  : "text-muted-foreground hover:bg-muted/60",
                              )}
                            >
                              {type.label}
                            </button>
                          ))}
                        </div>
                      </FormItem>
                    )}
                  />
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="province"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Província</FormLabel>
                          <Select value={field.value || undefined} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Escolha a província" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {ANGOLA_PROVINCES.map((province) => (
                                <SelectItem key={province} value={province}>
                                  {province}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Field form={form} name="municipality" label="Município" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field form={form} name="commune" label="Comuna (opcional)" />
                    <Field form={form} name="neighborhood" label="Bairro (opcional)" />
                  </div>
                  <Field form={form} name="address" label="Endereço (opcional)" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field form={form} name="phone" label="Telefone da escola (opcional)" />
                    <Field form={form} name="email" label="E-mail institucional (opcional)" />
                  </div>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <Field form={form} name="contact_name" label="Nome do responsável" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      form={form}
                      name="contact_role"
                      label="Função (opcional)"
                      description="Director, Secretário, Proprietário…"
                    />
                    <Field form={form} name="contact_phone" label="Telefone (opcional)" />
                  </div>
                  <Field form={form} name="contact_email" label="E-mail" />
                </>
              ) : null}

              {step === 4 ? (
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
                  {plans.map((plan) => {
                    const selected = values.plan_code === plan.code
                    return (
                      <button
                        key={plan.code}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => form.setValue("plan_code", plan.code as PlanCode)}
                        className={cn(
                          "flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors",
                          selected ? "border-primary bg-primary/5" : "hover:bg-muted/60",
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-sm">
                            {plan.name}
                            {plan.code === RECOMMENDED_PLAN ? (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                                Recomendado
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={cn(
                              "flex size-4 items-center justify-center rounded-full border",
                              selected && "border-primary bg-primary text-primary-foreground",
                            )}
                          >
                            {selected ? <Check className="size-2.5" /> : null}
                          </span>
                        </span>
                        {plan.description ? (
                          <span className="text-xs text-muted-foreground">{plan.description}</span>
                        ) : null}
                        {formatAoa(plan.price_aoa_monthly) ? (
                          <span className="mt-1 text-sm text-primary">
                            {formatAoa(plan.price_aoa_monthly)}
                            <span className="text-xs text-muted-foreground"> /mês</span>
                          </span>
                        ) : null}
                        {plan.max_students ? (
                          <span className="text-xs text-muted-foreground">
                            Até {plan.max_students.toLocaleString("pt-AO")} alunos
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              ) : null}

              {step === 5 ? (
                <>
                  <Field form={form} name="admin_name" label="Nome do administrador" />
                  <Field
                    form={form}
                    name="admin_email"
                    label="E-mail da conta SIGA"
                    description="É o e-mail usado para entrar no SIGA Plus."
                  />
                  <div className="grid items-start gap-4 sm:grid-cols-2">
                    <PasswordField
                      form={form}
                      name="admin_password"
                      label="Senha de acesso"
                      showStrength
                    />
                    <PasswordField form={form} name="admin_password_confirm" label="Confirmar senha" />
                  </div>
                </>
              ) : null}

              {step === 6 ? (
                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="subdomain-slug">Subdomínio SIGA</FormLabel>
                      <div className="flex items-center overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-ring">
                        <FormControl>
                          <Input
                            id="subdomain-slug"
                            className="border-0 shadow-none focus-visible:ring-0"
                            {...field}
                          />
                        </FormControl>
                        <span className="shrink-0 border-l bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                          .{PLATFORM_DOMAIN}
                        </span>
                      </div>
                      {slugStatus === "checking" ? (
                        <p className="text-xs text-muted-foreground">A verificar disponibilidade…</p>
                      ) : slugStatus === "available" ? (
                        <p className="text-xs text-emerald-600">
                          {field.value}.{PLATFORM_DOMAIN} está disponível.
                        </p>
                      ) : slugStatus === "taken" ? (
                        <p className="text-xs text-destructive">
                          {field.value}.{PLATFORM_DOMAIN} já está em uso por outra escola.
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Letras minúsculas, números e hífen. Sugerido a partir do nome da escola.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              {step === LAST_STEP ? (
                <div className="grid gap-3">
                  <ReviewSection title="Instituição" onEdit={() => setStep(1)}>
                    <Row label="Nome" value={values.name} />
                    {values.commercial_name ? (
                      <Row label="Nome comercial" value={values.commercial_name} />
                    ) : null}
                    <Row label="NIF" value={values.nif} />
                    <Row label="Natureza" value={typeLabel ?? ""} />
                  </ReviewSection>
                  <ReviewSection title="Localização" onEdit={() => setStep(2)}>
                    <Row label="Província" value={values.province} />
                    <Row
                      label="Município"
                      value={[values.municipality, values.commune].filter(Boolean).join(" · ")}
                    />
                    <Row
                      label="Endereço"
                      value={[values.neighborhood, values.address].filter(Boolean).join(", ")}
                    />
                  </ReviewSection>
                  <ReviewSection title="Responsável e plano" onEdit={() => setStep(3)}>
                    <Row label="Responsável" value={`${values.contact_name} · ${values.contact_email}`} />
                    <Row label="Plano" value={planLabel} />
                  </ReviewSection>
                  <ReviewSection title="Acesso" onEdit={() => setStep(5)}>
                    <Row label="Administrador" value={`${values.admin_name} · ${values.admin_email}`} />
                    <Row label="Endereço" value={`${values.slug}.${PLATFORM_DOMAIN}`} />
                  </ReviewSection>
                </div>
              ) : null}

              {serverError ? (
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {serverError}
                </p>
              ) : null}

              <div className="flex gap-2 border-t pt-4">
                {step > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isCreating}
                    onClick={() => setStep((s) => s - 1)}
                  >
                    <ArrowLeft className="size-4" />
                    Voltar
                  </Button>
                ) : (
                  <Button type="button" variant="ghost" asChild>
                    <Link to="/">Cancelar</Link>
                  </Button>
                )}
                <Button type="submit" className="ml-auto" disabled={isCreating}>
                  {isCreating ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> A criar a escola…
                    </>
                  ) : step < LAST_STEP ? (
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
    </div>
  )
}

/** Área do cliente no SIGA: plano, uso, pagamento e domínio (só Administrador). */
function manageUrl(sigaUrl: string) {
  return `${sigaUrl.replace(/\/+$/, "")}/configuracoes/assinatura`
}

function schoolInitials(name: string) {
  const words = name
    .replace(/\b(de|da|do|das|dos|e)\b/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const letters = words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "")
  return letters.join("") || "E"
}

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string
  onEdit: () => void
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border px-4 py-2">
      <div className="flex items-center justify-between py-1.5">
        <h3 className="text-sm">{title}</h3>
        <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs" onClick={onEdit}>
          Editar
        </Button>
      </div>
      <dl className="grid">{children}</dl>
    </section>
  )
}

function Field({
  form,
  name,
  label,
  type = "text",
  description,
}: {
  form: ReturnType<typeof useForm<FormValues>>
  name: keyof FormValues
  label: string
  type?: string
  description?: string
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type={type} {...field} value={field.value ?? ""} />
          </FormControl>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function PasswordField({
  form,
  name,
  label,
  showStrength = false,
}: {
  form: ReturnType<typeof useForm<FormValues>>
  name: "admin_password" | "admin_password_confirm"
  label: string
  showStrength?: boolean
}) {
  const [visible, setVisible] = useState(false)
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => {
        const strength = passwordStrength(field.value ?? "")
        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <div className="relative">
              <FormControl>
                <Input
                  type={visible ? "text" : "password"}
                  autoComplete="new-password"
                  className="pr-10"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? "Esconder senha" : "Mostrar senha"}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {showStrength ? (
              <div className="grid gap-1">
                <div className="grid grid-cols-3 gap-1" aria-hidden>
                  {[1, 2, 3].map((level) => (
                    <span
                      key={level}
                      className={cn(
                        "h-1 rounded-full bg-muted transition-colors",
                        strength >= level && (strength === 1 ? "bg-amber-500" : "bg-emerald-500"),
                      )}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {strength >= 3
                    ? "Senha forte."
                    : "10 ou mais caracteres, com letras e números. Um símbolo torna-a mais forte."}
                </p>
              </div>
            ) : null}
            <FormMessage />
          </FormItem>
        )
      }}
    />
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-t py-2 text-sm first:border-t-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value || "—"}</dd>
    </div>
  )
}

export default function StartSchoolPage() {
  return (
    <MarketingFormPage maxWidth="5xl">
      <StartSchoolWizard />
    </MarketingFormPage>
  )
}
