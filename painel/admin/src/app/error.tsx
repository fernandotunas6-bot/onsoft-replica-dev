"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertCircle, RefreshCw, Home } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Erro na aplicação ADMIN:", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-6" />
      </div>
      <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
        Ocorreu um erro no painel
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {error?.message || "Não foi possível carregar as informações solicitadas."}
      </p>
      <div className="mt-6 flex flex-wrap gap-3 justify-center">
        <Button onClick={() => reset()} variant="default" className="gap-2">
          <RefreshCw className="size-4" /> Tentar novamente
        </Button>
        <Button asChild variant="outline">
          <a href="/tenants" className="gap-2">
            <Home className="size-4" /> Voltar às escolas
          </a>
        </Button>
      </div>
    </div>
  )
}
