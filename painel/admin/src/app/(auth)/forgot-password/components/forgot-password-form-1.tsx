"use client"

import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getSigaUrl } from "@/lib/ecosystem-urls"

/**
 * Recuperação de senha dos administradores da plataforma.
 *
 * A consola não tem página para definir uma senha nova: o pedido antigo
 * (`resetPasswordForEmail` com regresso a /sign-in) enviava o e-mail genérico do
 * Supabase e deixava a pessoa no login sem forma de mudar a senha. A recuperação
 * oficial é a do SIGA Plus («Esqueceu a senha?» na entrada): e-mail institucional,
 * link seguro e confirmação do segundo factor antes de gravar a senha nova.
 */
export function ForgotPasswordForm1({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Recuperar o acesso</CardTitle>
          <CardDescription>
            A senha recupera-se na entrada do SIGA Plus, com um link seguro enviado para o
            seu e-mail.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <ol className="grid list-decimal gap-2 pl-5 text-sm text-muted-foreground">
            <li>Abra a entrada do SIGA Plus e escreva o e-mail desta conta.</li>
            <li>Escolha «Esqueceu a senha?» e abra o link que receber.</li>
            <li>
              Defina a nova senha (é pedido o código da aplicação autenticadora) e volte aqui
              para entrar.
            </li>
          </ol>
          <Button asChild className="w-full gap-2">
            <a href={getSigaUrl("/")} target="_blank" rel="noreferrer">
              Abrir a entrada do SIGA Plus
              <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </Button>
          <div className="text-center text-sm">
            Lembrou-se da senha?{" "}
            <Link href="/sign-in" className="font-medium underline underline-offset-4">
              Voltar para o login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
