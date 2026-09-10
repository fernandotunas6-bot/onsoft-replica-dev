"use client"

import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"

export function ForgotPasswordForm1({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const supabase = createClient()
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: typeof window !== "undefined" ? `${window.location.origin}/sign-in` : undefined,
      })

      if (resetError) {
        setError(resetError.message)
        setIsSubmitting(false)
        return
      }

      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o pedido.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Esqueceu a senha?</CardTitle>
          <CardDescription>
            Insira o seu e-mail de administrador e enviaremos instruções para redefinir o acesso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                E-mail de recuperação enviado para <strong>{email}</strong> se a conta existir.
              </p>
              <div className="text-center text-sm">
                <Link href="/sign-in" className="underline underline-offset-4 font-medium">
                  Voltar para o login
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="grid gap-6">
                {error && <p className="text-destructive text-sm">{error}</p>}
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@exemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full cursor-pointer" disabled={isSubmitting}>
                    {isSubmitting ? "A enviar…" : "Enviar link de redefinição"}
                  </Button>
                </div>
                <div className="text-center text-sm">
                  Lembrou-se da senha?{" "}
                  <Link href="/sign-in" className="underline underline-offset-4 font-medium">
                    Voltar para o login
                  </Link>
                </div>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
