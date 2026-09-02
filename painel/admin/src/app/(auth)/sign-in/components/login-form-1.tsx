"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { fetchSaasSession } from "@/lib/saas-api"
import { getCreateSchoolUrl } from "@/lib/ecosystem-urls"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
  return SAFE_ADMIN_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  )
}

export function LoginForm1({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return new URLSearchParams(window.location.search).get("error") === "platform"
      ? "Esta conta não é administrador da plataforma. Contas escolares entram no SIGA Plus."
      : null
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

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
    const { data: sessionData, error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    })

    if (error) {
      setServerError(error.message)
      setIsSubmitting(false)
      return
    }

    const token = sessionData.session?.access_token
    const saasSession = await fetchSaasSession(token)
    if (!saasSession.ok || !saasSession.profile.platformAdmin) {
      await supabase.auth.signOut()
      setServerError(
        "Esta conta não tem permissão de administrador da plataforma SIGA Plus.",
      )
      setIsSubmitting(false)
      return
    }

    router.push(safeNext())
    router.refresh()
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
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid gap-6">
                {serverError && (
                  <p className="text-destructive text-sm">{serverError}</p>
                )}
                <div className="grid gap-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-mail</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="teste@exemplo.com"
                            {...field}
                          />
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
                          <a
                            href="/auth/forgot-password"
                            className="ml-auto text-sm underline-offset-4 hover:underline"
                          >
                            Esqueceu a senha?
                          </a>
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
        </CardContent>
      </Card>
      <div className="text-muted-foreground text-center text-xs text-balance">
        Operação escolar (alunos, notas, propinas) vive no SIGA Plus — não nesta consola.
      </div>
    </div>
  )
}
