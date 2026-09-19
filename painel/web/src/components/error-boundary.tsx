import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught React error in WEB:", error, errorInfo)
    
    // Auto-recover once from stale chunk loading errors
    const isChunkError =
      error?.message?.includes("dynamically imported module") ||
      error?.message?.includes("Failed to fetch") ||
      error?.name === "ChunkLoadError"
      
    if (isChunkError) {
      const reloadKey = "web_chunk_reload_attempted"
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, "true")
        window.location.reload()
      }
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="size-6" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Ocorreu um problema ao carregar esta secção
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {this.state.error?.message || "Houve uma falha inesperada na interface."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button onClick={this.handleReset} variant="default" className="gap-2">
              <RefreshCw className="size-4" /> Recarregar página
            </Button>
            <Button asChild variant="outline">
              <a href="/" className="gap-2">
                <Home className="size-4" /> Voltar ao início
              </a>
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
