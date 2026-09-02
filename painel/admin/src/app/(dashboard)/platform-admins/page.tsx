"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Shield, UserPlus } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"
import {
  fetchPlatformAdmins,
  grantPlatformAdmin,
  revokePlatformAdmin,
  type PlatformAdminRow,
} from "@/lib/saas-api"

async function accessToken(): Promise<string | undefined> {
  if (!isSupabaseConfigured()) return undefined
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token
}

export default function PlatformAdminsPage() {
  const [admins, setAdmins] = useState<PlatformAdminRow[]>([])
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const token = await accessToken()
    const result = await fetchPlatformAdmins(token)
    if (!token || result.error?.includes("Unauthorized") || result.error?.includes("Sem permissão")) {
      setNeedsAuth(true)
      setAdmins([])
      setLoading(false)
      return
    }
    setNeedsAuth(false)
    if (!result.ok) {
      setError(result.error || "Falha ao carregar.")
      setLoading(false)
      return
    }
    setAdmins(result.admins ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleGrant(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const token = await accessToken()
    const result = await grantPlatformAdmin(token, email.trim())
    if (!result.ok) {
      setError(result.error || "Não foi possível conceder acesso.")
      setSaving(false)
      return
    }
    setEmail("")
    await load()
    setSaving(false)
  }

  async function handleRevoke(userId: string) {
    setError(null)
    const token = await accessToken()
    const result = await revokePlatformAdmin(token, userId)
    if (!result.ok) {
      setError(result.error || "Não foi possível revogar.")
      return
    }
    await load()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="px-4 lg:px-6">
        <h1 className="text-2xl font-bold tracking-tight">Administradores da plataforma</h1>
        <p className="text-muted-foreground">
          Contas em `platform_admins` com acesso ao Control Center. Distinto de cargos escolares no SIGA.
        </p>
      </div>

      <div className="px-4 lg:px-6">
        {needsAuth ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              Inicie sessão como administrador da plataforma.{" "}
              <Link href="/sign-in?next=/platform-admins" className="font-medium text-primary underline">
                Entrar
              </Link>
            </CardContent>
          </Card>
        ) : null}

        {error ? (
          <p role="alert" className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Card className="mb-4">
          <CardContent className="pt-6">
            <form onSubmit={(event) => void handleGrant(event)} className="flex flex-col gap-3 sm:flex-row">
              <Input
                type="email"
                placeholder="email@exemplo.ao"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="sm:max-w-md"
              />
              <Button type="submit" disabled={saving || !email.trim()} className="gap-2">
                <UserPlus className="size-4" />
                {saving ? "A conceder…" : "Conceder acesso"}
              </Button>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">
              O utilizador já deve existir em Auth (convite SIGA ou registo prévio). Não cria conta nova.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Desde</TableHead>
                  <TableHead className="text-right">Acções</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      A carregar…
                    </TableCell>
                  </TableRow>
                ) : admins.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      Nenhum administrador listado.
                    </TableCell>
                  </TableRow>
                ) : (
                  admins.map((admin) => (
                    <TableRow key={admin.user_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Shield className="size-4 text-primary" />
                          <span>{admin.email || admin.user_id}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(admin.created_at).toLocaleString("pt-AO", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleRevoke(admin.user_id)}
                        >
                          Revogar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
