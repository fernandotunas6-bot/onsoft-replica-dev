"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { fetchSaasSession } from "@/lib/saas-api"
import { getCreateSchoolUrl, getDocsUrl } from "@/lib/ecosystem-urls"

type GateState = "loading" | "ok" | "denied" | "unconfigured"

export function PlatformAdminGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<GateState>("loading")

  useEffect(() => {
    let cancelled = false

    async function verify() {
      if (!isSupabaseConfigured()) {
        if (!cancelled) setState("unconfigured")
        return
      }

      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token

      if (!token) {
        router.replace("/sign-in?next=/tenants")
        return
      }

      const saasSession = await fetchSaasSession(token)
      if (!saasSession.ok || !saasSession.profile.platformAdmin) {
        await supabase.auth.signOut()
        if (!cancelled) setState("denied")
        return
      }

      if (!cancelled) setState("ok")
    }

    void verify()
    return () => {
      cancelled = true
    }
  }, [router])

  if (state === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 text-sm text-muted-foreground">
        A verificar permissões de administrador da plataforma…
      </div>
    )
  }

  if (state === "unconfigured") {
    return (
      <div className="px-4 lg:px-6">
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle>Supabase em falta</CardTitle>
            <CardDescription>
              Configure `NEXT_PUBLIC_SUPABASE_URL` e a chave pública em `painel/admin/.env.local`
              (use `npm run siga:sync-env` na raiz).
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (state === "denied") {
    return (
      <div className="px-4 lg:px-6">
        <Card className="mx-auto max-w-lg border-destructive/30">
          <CardHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <ShieldAlert className="size-5" />
            </div>
            <CardTitle>Acesso negado</CardTitle>
            <CardDescription>
              Esta consola é só para contas em `platform_admins`. Contas de escola (Director,
              Secretaria, etc.) entram no SIGA Plus — não aqui.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/sign-in">Tentar outra conta</Link>
            </Button>
            <Button variant="outline" asChild>
              <a href={getCreateSchoolUrl()} target="_blank" rel="noreferrer">
                Criar escola (WEB)
              </a>
            </Button>
            <Button variant="ghost" asChild>
              <a href={getDocsUrl("/arquitetura/")} target="_blank" rel="noreferrer">
                Documentação
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <>{children}</>
}
