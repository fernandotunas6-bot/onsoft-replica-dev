"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { fetchSaasSession } from "@/lib/saas-api"
import { getCreateSchoolUrl } from "@/lib/ecosystem-urls"
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

const loginFormSchema = z.object({
  email: z.string().email("Endereço de e-mail inválido"),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
})

type LoginFormValues = z.infer<typeof loginFormSchema>

const SAFE_ADMIN_PREFIXES = [
  "/tenants",
  "/subscriptions",
  "/platform-admins",
  "/audit",
  "/domains",
  "/gateway-webhooks",
  "/settings",
] as const

function isSafeAdminNext(path: string | null): path is string {
  if (!path || !path.startsWith("/")) return false
  if (path.startsWith("//")) return false
  return SAFE_ADMIN_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

export function LoginForm1({ className, ...props }: React.ComponentProps<"div">) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return new URLSearchParams(window.location.search).get("error") === "platform"
      ? "Esta conta não é administrador da plataforma. Contas escolares entram no SIGA Plus."
      : null
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  // 2.º passo (MFA). As rotas /api/saas/* do SIGA recusam sessões sem aal2.
  const [mfa, setMfa] = useState<
    | { step: "verify"; factorId: string }
    | { step: "enroll"; factorId: string; qrCode: string; secret: string }
    | null
  >(null)
  const [mfaCode, setMfaCode] = useState("")

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  async function onSubmit(values: LoginFormValues) {
    setServerError(null)
    setIsSubmitting(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    })

    if (error) {
      setServerError(error.message)
      setIsSubmitting(false)
      return
    }

    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.currentLevel === "aal2") {
        await finishLogin()
        return
      }
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const verified = factors?.totp?.find((factor) => factor.status === "verified")
      if (verified) {
        setMfa({ step: "verify", factorId: verified.id })
        setIsSubmitting(false)
        return
      }
      // Sem autenticador: regista um agora (QR). Factores por confirmar de uma
      // tentativa anterior impediriam um novo registo com o mesmo nome.
      for (const factor of factors?.all ?? []) {
        if (factor.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: factor.id })
      }
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "SIGA Plus — administração",
      })
      if (enrollError || !enrolled)
        throw enrollError ?? new Error("Não foi possível iniciar o MFA.")
      setMfa({
        step: "enroll",
        factorId: enrolled.id,
        qrCode: enrolled.totp.qr_code,
        secret: enrolled.totp.secret,
      })
    } catch (mfaError) {
      await supabase.auth.signOut()
      setServerError(
        mfaError instanceof Error && mfaError.message
          ? mfaError.message
          : "Não foi possível preparar a verificação em dois passos.",
      )
    }
    setIsSubmitting(false)
  }

  async function onVerifyCode(event: React.FormEvent) {
    event.preventDefault()
    if (!mfa) return
    setServerError(null)
    setIsSubmitting(true)
    const supabase = createClient()
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: mfa.factorId,
      code: mfaCode.trim(),
    })
    if (error) {
      setServerError("Código inválido ou expirado. Use o código actual da aplicação autenticadora.")
      setIsSubmitting(false)
      return
    }
    await finishLogin()
  }

  /** Sessão já com MFA: confirma que é administrador da plataforma e entra. */
  async function finishLogin() {
    const supabase = createClient()
    const { data } = await supabase.auth.getSession()
    const saasSession = await fetchSaasSession(data.session?.access_token)
    if (!saasSession.ok || !saasSession.profile.platformAdmin) {
      await supabase.auth.signOut()
      setMfa(null)
      setServerError("Esta conta não tem permissão de administrador da plataforma SIGA Plus.")
      setIsSubmitting(false)
      return
    }
    router.push(safeNext())
    router.refresh()
  }

  async function cancelMfa() {
    await createClient().auth.signOut()
    setMfa(null)
    setMfaCode("")
    setServerError(null)
  }

  function safeNext() {
    if (typeof window === "undefined") return "/tenants"
    const next = new URLSearchParams(window.location.search).get("next")
    if (isSafeAdminNext(next)) return next
    return "/tenants"
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Centro de controlo SaaS</CardTitle>
          <CardDescription>
            Acesso reservado a administradores da plataforma SIGA Plus (`platform_admins`).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mfa ? (
            <form onSubmit={onVerifyCode} className="grid gap-4">
              {serverError && <p className="text-destructive text-sm">{serverError}</p>}
              {mfa.step === "enroll" ? (
                <div className="grid gap-3 text-sm">
                  <p>
                    O acesso de administrador exige verificação em dois passos. Leia este QR com uma
                    aplicação autenticadora (Google Authenticator, Microsoft Authenticator, Authy…)
                    e escreva o código de 6 dígitos que ela mostra.
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element -- QR em data: URI do Supabase */}
                  <img
                    src={mfa.qrCode}
                    alt="QR para registar a aplicação autenticadora"
                    className="mx-auto size-44 rounded-md bg-white p-2"
                  />
                  <p className="text-muted-foreground text-xs break-all">
                    Sem câmara? Chave manual: <code>{mfa.secret}</code>
                  </p>
                </div>
              ) : (
                <p className="text-sm">
                  Escreva o código de 6 dígitos da sua aplicação autenticadora.
                </p>
              )}
              <label htmlFor="admin-mfa-code" className="grid gap-2 text-sm font-medium">
                Código de verificação
                <Input
                  id="admin-mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))}
                  autoFocus
                />
              </label>
              <Button
                type="submit"
                className="w-full cursor-pointer"
                disabled={isSubmitting || mfaCode.length !== 6}
              >
                {isSubmitting ? "A verificar…" : "Verificar e entrar"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => void cancelMfa()}>
                Cancelar
              </Button>
            </form>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <div className="grid gap-6">
                  {serverError && <p className="text-destructive text-sm">{serverError}</p>}
                  <div className="grid gap-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>E-mail</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="teste@exemplo.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center">
                            <FormLabel>Senha</FormLabel>
                            <Link
                              href="/forgot-password"
                              className="ml-auto text-sm underline-offset-4 hover:underline"
                            >
                              Esqueceu a senha?
                            </Link>
                          </div>
                          <FormControl>
                            <Input type="password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full cursor-pointer" disabled={isSubmitting}>
                      {isSubmitting ? "A entrar…" : "Entrar no Centro de controlo"}
                    </Button>
                  </div>
                  <div className="text-center text-sm text-muted-foreground">
                    Quer registar uma escola?{" "}
                    <a
                      href={getCreateSchoolUrl()}
                      className="font-medium text-foreground underline underline-offset-4"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Wizard no portal WEB
                    </a>
                  </div>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
      <div className="text-muted-foreground text-center text-xs text-balance">
        Operação escolar (alunos, notas, propinas) vive no SIGA Plus — não nesta consola.
      </div>
    </div>
  )
}
